"use client";

import { Messages } from "@/types";
import { Mic } from "lucide-react";
import { useEffect, useRef } from "react";

interface TranscriptProps {
  messages: Messages[];
  currentMessage: string;
  currentUserMessage: string;
}

type TranscriptItem = Messages & {
  id: string;
  isStreaming?: boolean;
};

const Transcript = ({
  messages,
  currentMessage,
  currentUserMessage,
}: TranscriptProps) => {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const items: TranscriptItem[] = [
    ...messages.map((message, index) => ({
      ...message,
      id: message.id ?? `message-${index}-${message.role}`,
    })),
  ];

  if (currentUserMessage.trim()) {
    items.push({
      id: "streaming-user-message",
      role: "user",
      content: currentUserMessage,
      isStreaming: true,
    });
  }

  if (currentMessage.trim()) {
    items.push({
      id: "streaming-assistant-message",
      role: "assistant",
      content: currentMessage,
      isStreaming: true,
    });
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, currentMessage, currentUserMessage]);

  if (items.length === 0) {
    return (
      <section className="transcript-container">
        <div className="transcript-empty">
          <Mic className="mb-4 size-12 text-[#212a3b]" />
          <p className="transcript-empty-text">No conversation yet</p>
          <p className="transcript-empty-hint">
            Click the mic button above to start talking
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="transcript-container">
      <div className="transcript-messages">
        {items.map((message, index) => {
          const isUser = message.role === "user";
          const itemKey = `${message.id}-${index}`;

          return (
            <div
              key={itemKey}
              className={`transcript-message ${
                isUser
                  ? "transcript-message-user"
                  : "transcript-message-assistant"
              }`}
            >
              <div
                className={`transcript-bubble ${
                  isUser
                    ? "transcript-bubble-user"
                    : "transcript-bubble-assistant"
                }`}
              >
                <span>{message.content}</span>
                {message.isStreaming ? (
                  <span
                    aria-hidden="true"
                    className={`transcript-cursor ${isUser ? "bg-white" : ""}`}
                  />
                ) : null}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </section>
  );
};

export default Transcript;
