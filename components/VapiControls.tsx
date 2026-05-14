"use client";

import Transcript from "@/components/Transcript";
import useVapi from "@/hooks/useVapi";
import { getVoice } from "@/lib/utils";
import { IBook } from "@/types";
import { Mic, MicOff } from "lucide-react";
import Image from "next/image";

const VapiControls = ({ book }: { book: IBook }) => {
  const {
    status,
    isActive,
    messages,
    currentMessage,
    currentUserMessage,
    duration,
    start,
    stop,
  } = useVapi(book);

  const coverURL =
    book.coverURL && book.coverURL.trim() !== ""
      ? book.coverURL
      : "/assets/book-cover.svg";
  const selectedVoice = getVoice(book.persona);
  const isAiBusy = status === "thinking" || status === "speaking";
  const formatDuration = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const statusLabel =
    status === "idle"
      ? "Ready"
      : status === "connecting"
        ? "Connecting"
        : status === "thinking"
          ? "Thinking"
          : status === "speaking"
            ? "Speaking"
            : "Listening";

  return (
    <>
      <div className="mx-auto flex max-w-4xl flex-col gap-6">
        {/* Header Card */}
        <section className="vapi-header-card">
          <div className="vapi-cover-wrapper">
            <Image
              src={coverURL}
              alt={`Cover of ${book.title}`}
              width={120}
              height={180}
              className="vapi-cover-image"
              priority
            />

            <div className="vapi-mic-wrapper">
              {isActive && isAiBusy ? (
                <span aria-hidden="true" className="vapi-pulse-ring" />
              ) : null}
              <button
                onClick={isActive ? stop : start}
                disabled={status === "connecting"}
                type="button"
                className={`vapi-mic-btn ${
                  isActive ? "vapi-mic-btn-active" : "vapi-mic-btn-inactive"
                }`}
                aria-label={isActive ? "Turn microphone off" : "Turn microphone on"}
              >
                {isActive ? (
                  <Mic className="size-6" />
                ) : (
                  <MicOff className="size-6" />
                )}
              </button>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
            <div className="space-y-1">
              <h1 className="font-serif text-2xl font-bold text-[#212121] sm:text-3xl">
                {book.title}
              </h1>
              <p className="text-base text-[#5b4636] sm:text-lg">
                by {book.author}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="vapi-status-indicator">
                <span className="vapi-status-dot vapi-status-dot-ready" />
                <span className="vapi-status-text">{statusLabel}</span>
              </div>

              <div className="vapi-status-indicator">
                <span className="vapi-status-text">
                  Voice: {selectedVoice.name}
                </span>
              </div>

              <div className="vapi-status-indicator">
                <span className="vapi-status-text">
                  {formatDuration(duration)}/15:00
                </span>
              </div>
            </div>
          </div>
        </section>

        <div className="vapi-transcript-wrapper">
          <Transcript
            messages={messages}
            currentMessage={currentMessage}
            currentUserMessage={currentUserMessage}
          />
        </div>
      </div>
    </>
  );
};

export default VapiControls;
