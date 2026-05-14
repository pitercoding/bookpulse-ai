import { endVoiceSession, startVoiceSession } from "@/lib/actions/session.actions";
import { ASSISTANT_ID, VOICE_SETTINGS } from "@/lib/constants";
import { IBook, Messages } from "@/types";
import { useAuth } from "@clerk/nextjs";
import { useEffect, useEffectEvent, useRef, useState } from "react";
import Vapi from "@vapi-ai/web";
import { getVoice } from "@/lib/utils";

export type CallStatus =
  | "idle"
  | "connecting"
  | "starting"
  | "listening"
  | "thinking"
  | "speaking";

const useLatestRef = <T>(value: T) => {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
};

const VAPI_API_KEY = process.env.NEXT_PUBLIC_VAPI_API_KEY;

type VapiTranscriptMessage = {
  type: "transcript" | "transcript[transcriptType='final']";
  role: "assistant" | "user";
  transcriptType: "partial" | "final";
  transcript: string;
};

type VapiStatusMessage = {
  type: "status-update";
  status: string;
};

type VapiSpeechUpdateMessage = {
  type: "speech-update";
  status: "started" | "stopped";
  role: "assistant" | "user";
};

type VapiConversationItem = {
  role: string;
  message: string;
};

type VapiConversationUpdateMessage = {
  type: "conversation-update";
  messages?: VapiConversationItem[];
};

const VAPI_CLIENT_MESSAGES = [
  "transcript",
  "conversation-update",
  "speech-update",
  "status-update",
] as const;

const isValidMongoObjectId = (value: string) => /^[a-fA-F0-9]{24}$/.test(value);

type VapiMessage =
  | VapiTranscriptMessage
  | VapiStatusMessage
  | VapiSpeechUpdateMessage
  | VapiConversationUpdateMessage
  | { type?: string };

const isTranscriptMessage = (
  message: VapiMessage
): message is VapiTranscriptMessage =>
  (message.type === "transcript" ||
    message.type === "transcript[transcriptType='final']") &&
  "role" in message &&
  "transcriptType" in message &&
  "transcript" in message;

const isSpeechUpdateMessage = (
  message: VapiMessage
): message is VapiSpeechUpdateMessage =>
  message.type === "speech-update" &&
  "status" in message &&
  "role" in message;

const isStatusMessage = (message: VapiMessage): message is VapiStatusMessage =>
  message.type === "status-update" && "status" in message;

const isConversationUpdateMessage = (
  message: VapiMessage
): message is VapiConversationUpdateMessage =>
  message.type === "conversation-update" && "messages" in message;

let vapi: InstanceType<typeof Vapi>;

function getVapi() {
  if (!vapi) {
    if (!VAPI_API_KEY) {
      throw new Error(
        "NEXT_PUBLIC_VAPI_API_KEY not found. Please set it in the .env file."
      );
    }

    vapi = new Vapi(VAPI_API_KEY);
  }
  return vapi;
}

const areMessagesEqual = (left: Messages, right: Messages) =>
  left.role === right.role &&
  left.content.trim() === right.content.trim();

const createMessageId = (sequence: number) => `message-${sequence}`;

const normalizeMessage = (message: Messages): Messages | null => {
  const content = message.content.trim();

  if (!content) {
    return null;
  }

  return {
    ...message,
    content,
  };
};

const appendMessage = (
  previousMessages: Messages[],
  nextMessage: Messages
): Messages[] => {
  const normalizedNextMessage = normalizeMessage(nextMessage);

  if (!normalizedNextMessage) {
    return previousMessages;
  }

  const lastMessage = previousMessages.at(-1);

  if (lastMessage && areMessagesEqual(lastMessage, normalizedNextMessage)) {
    return previousMessages;
  }

  return [...previousMessages, normalizedNextMessage];
};

const reconcileConversationMessages = (
  currentMessages: Messages[],
  incomingMessages: Messages[],
  getNextId: () => string
): Messages[] => {
  const nextMessages = [...currentMessages];
  let searchStartIndex = 0;

  for (const incomingMessage of incomingMessages) {
    const normalizedIncomingMessage = normalizeMessage(incomingMessage);

    if (!normalizedIncomingMessage) {
      continue;
    }

    const matchedIndex = nextMessages.findIndex(
      (existingMessage, index) =>
        index >= searchStartIndex &&
        areMessagesEqual(existingMessage, normalizedIncomingMessage)
    );

    if (matchedIndex >= 0) {
      searchStartIndex = matchedIndex + 1;
      continue;
    }

    nextMessages.splice(searchStartIndex, 0, {
      ...normalizedIncomingMessage,
      id: normalizedIncomingMessage.id ?? getNextId(),
    });
    searchStartIndex += 1;
  }

  return nextMessages;
};

const normalizeConversationMessages = (
  conversationMessages?: VapiConversationItem[]
): Messages[] => {
  if (!conversationMessages) {
    return [];
  }

  const normalizedMessages = conversationMessages
    .filter(
      (message) =>
        (message.role === "assistant" || message.role === "user") &&
        message.message.trim().length > 0
    )
    .map((message) => ({
      role: message.role,
      content: message.message.trim(),
    }));

  return normalizedMessages;
};

export const useVapi = (book: IBook) => {
  const { userId } = useAuth();
  const selectedVoice = getVoice(book.persona);

  const [status, setStatus] = useState<CallStatus>("idle");
  const [messages, setMessages] = useState<Messages[]>([]);
  const [currentMessage, setCurrentMessage] = useState("");
  const [currentUserMessage, setCurrentUserMessage] = useState("");
  const [duration, setDuration] = useState(0);
  const [limitError, setLimitError] = useState<string | null>(null);

  const timeRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const isStoppingRef = useRef<boolean>(false);
  const hasEndedSessionRef = useRef(false);
  const messagesRef = useRef<Messages[]>([]);
  const messageSequenceRef = useRef(0);

  const durationRef = useLatestRef(duration);

  const isActive =
    status == "listening" ||
    status == "thinking" ||
    status == "speaking" ||
    status == "starting";

  //Limits:
  // const maxDurationRef = useLatestRef(limits.maxSessionMinutes * 60);
  // const maxDurationSeconds
  // const remainingSeconds
  // const showTimeWarning

  const clearDurationTimer = useEffectEvent(() => {
    if (timeRef.current) {
      clearInterval(timeRef.current);
      timeRef.current = null;
    }

    startTimeRef.current = null;
  });

  const startDurationTimer = useEffectEvent(() => {
    clearDurationTimer();
    startTimeRef.current = Date.now();
    setDuration(0);

    timeRef.current = setInterval(() => {
      if (!startTimeRef.current) {
        return;
      }

      const elapsedSeconds = Math.floor(
        (Date.now() - startTimeRef.current) / 1000
      );
      setDuration(elapsedSeconds);
    }, 1000);
  });

  const finalizeSession = useEffectEvent(async () => {
    if (hasEndedSessionRef.current) {
      return;
    }

    hasEndedSessionRef.current = true;
    clearDurationTimer();

    const sessionId = sessionIdRef.current;
    sessionIdRef.current = null;

    if (!sessionId) {
      return;
    }

    await endVoiceSession(sessionId, durationRef.current);
  });

  const syncVisibleMessages = useEffectEvent(() => {
    setMessages([...messagesRef.current]);
  });

  const getNextMessageId = useEffectEvent(() => {
    const nextId = createMessageId(messageSequenceRef.current);
    messageSequenceRef.current += 1;
    return nextId;
  });

  const appendTranscriptMessage = useEffectEvent((message: Messages) => {
    const normalizedMessage = normalizeMessage(message);

    if (!normalizedMessage) {
      return;
    }

    messagesRef.current = appendMessage(messagesRef.current, {
      ...normalizedMessage,
      id: normalizedMessage.id ?? getNextMessageId(),
    });
    syncVisibleMessages();
  });

  const handleTranscriptMessage = useEffectEvent((message: VapiTranscriptMessage) => {
    const transcript = message.transcript.trim();

    if (message.role === "user") {
      setCurrentMessage("");

      if (message.transcriptType === "partial") {
        setCurrentUserMessage(transcript);
        setStatus("listening");
        return;
      }

      setCurrentUserMessage("");
      setStatus("thinking");
      appendTranscriptMessage({
        role: "user",
        content: transcript,
      });
      return;
    }

    setCurrentUserMessage("");

    if (message.transcriptType === "partial") {
      setCurrentMessage(transcript);
      setStatus("speaking");
      return;
    }

    setCurrentMessage("");
    setStatus("listening");
    appendTranscriptMessage({
      role: "assistant",
      content: transcript,
    });
  });

  const handleVapiMessage = useEffectEvent((message: VapiMessage) => {
    if (isTranscriptMessage(message)) {
      handleTranscriptMessage(message);
      return;
    }

    if (isStatusMessage(message) && message.status === "ended") {
      setStatus("idle");
      setCurrentMessage("");
      setCurrentUserMessage("");
      void finalizeSession();
      return;
    }

    if (isSpeechUpdateMessage(message)) {
      if (message.role === "assistant") {
        setStatus(message.status === "started" ? "speaking" : "listening");
      } else {
        setStatus(message.status === "started" ? "listening" : "thinking");
      }

      return;
    }

    if (isConversationUpdateMessage(message)) {
      messagesRef.current = reconcileConversationMessages(
        messagesRef.current,
        normalizeConversationMessages(message.messages),
        getNextMessageId
      );
      syncVisibleMessages();
    }
  });

  useEffect(() => {
    const vapiInstance = getVapi();

    const handleCallStart = () => {
      isStoppingRef.current = false;
      hasEndedSessionRef.current = false;
      setStatus("listening");
      startDurationTimer();
    };

    const handleCallEnd = () => {
      setStatus("idle");
      setCurrentMessage("");
      setCurrentUserMessage("");
      void finalizeSession();
    };

    const handleError = () => {
      console.error("Vapi call error");
      setStatus("idle");
      setCurrentMessage("");
      setCurrentUserMessage("");
      void finalizeSession();
    };

    vapiInstance.on("call-start", handleCallStart);
    vapiInstance.on("call-end", handleCallEnd);
    vapiInstance.on("message", handleVapiMessage);
    vapiInstance.on("error", handleError);

    return () => {
      vapiInstance.removeListener("call-start", handleCallStart);
      vapiInstance.removeListener("call-end", handleCallEnd);
      vapiInstance.removeListener("message", handleVapiMessage);
      vapiInstance.removeListener("error", handleError);
      clearDurationTimer();
    };
  }, []);

  const start = async () => {
    if (!userId) return setLimitError("Please, logim to start a conversation");

    setLimitError(null);
    messagesRef.current = [];
    messageSequenceRef.current = 0;
    setMessages([]);
    setCurrentMessage("");
    setCurrentUserMessage("");
    setDuration(0);
    setStatus("connecting");
    isStoppingRef.current = false;
    hasEndedSessionRef.current = false;

    try {
      if (isValidMongoObjectId(book._id)) {
        const result = await startVoiceSession(userId, book._id);

        if (!result.success) {
          setLimitError(
            result.error || "Session limit reached. Please upgrade your plan."
          );
          setStatus("idle");
          return;
        }

        sessionIdRef.current = result.sessionId || null;
      } else {
        sessionIdRef.current = null;
      }

      const firstMessage = `Hey, good to meet you. quick question, before we dive in: Have you actually read ${book.title} yet? Or are we starting fresh?`;

      await getVapi().start(ASSISTANT_ID, {
        firstMessage,
        variableValues: {
          title: book.title,
          author: book.author,
          bookId: book._id,
        },
        // The SDK type currently declares `clientMessages` as a single literal,
        // but the runtime accepts an array as documented.
        clientMessages: VAPI_CLIENT_MESSAGES as never,
        voice: {
          provider: "11labs" as const,
          voiceId: selectedVoice.id,
          model: "eleven_turbo_v2_5" as const,
          stability: VOICE_SETTINGS.stability,
          similarityBoost: VOICE_SETTINGS.similarityBoost,
          style: VOICE_SETTINGS.style,
          useSpeakerBoost: VOICE_SETTINGS.useSpeakerBoost,
        }
      });
      setStatus("starting");

    } catch (e) {
      console.error("Error starting call", e);
      setStatus("idle");
      setLimitError("An error occurred while starting the call");
    }
  };

  const stop = async () => {
    isStoppingRef.current = true;
    await getVapi().stop();
  };

  const clearErrors = () => setLimitError(null);

  useEffect(() => {
    return () => {
      void finalizeSession();
    };
  }, []);

  return {
    status,
    isActive,
    messages,
    currentMessage,
    currentUserMessage,
    duration,
    limitError,
    start,
    stop,
    clearErrors,
    // maxDurationSeconds,
    // remainingSeconds,
    // showTimeWarning
  };
};

export default useVapi;
