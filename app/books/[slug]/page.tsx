import Image from "next/image";
import Link from "next/link";
import { auth } from "@clerk/nextjs/server";
import { ArrowLeft, Mic, MicOff } from "lucide-react";
import { redirect } from "next/navigation";

import { getBookBySlug } from "@/lib/actions/book.actions";

export default async function Page(props: PageProps<"/books/[slug]">) {
  const { userId } = await auth();

  if (!userId) {
    redirect("/");
  }

  const { slug } = await props.params;
  const bookResult = await getBookBySlug(slug);

  if (!bookResult.success || !bookResult.data) {
    redirect("/");
  }

  const book = bookResult.data;
  const coverURL =
    book.coverURL && book.coverURL.trim() !== ""
      ? book.coverURL
      : "/assets/book-cover.svg";
  const persona = book.persona?.trim() || "Unknown";

  return (
    <main className="book-page-container">
      <Link href="/" className="back-btn-floating" aria-label="Back to library">
        <ArrowLeft className="size-5 text-[#212a3b]" />
      </Link>

      <div className="mx-auto flex max-w-4xl flex-col gap-6">
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
              <button
                type="button"
                className="vapi-mic-btn vapi-mic-btn-inactive"
                aria-label="Microphone muted"
              >
                <MicOff className="size-6 text-[#212a3b]" />
              </button>
            </div>
          </div>

          <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
            <div className="space-y-1">
              <h1 className="font-serif text-2xl font-bold text-[#212121] sm:text-3xl">
                {book.title}
              </h1>
              <p className="text-base text-[#5b4636] sm:text-lg">by {book.author}</p>
            </div>

            <div className="flex flex-wrap gap-3">
              <div className="vapi-status-indicator">
                <span className="vapi-status-dot vapi-status-dot-ready" />
                <span className="vapi-status-text">Ready</span>
              </div>

              <div className="vapi-status-indicator">
                <span className="vapi-status-text">Voice: {persona}</span>
              </div>

              <div className="vapi-status-indicator">
                <span className="vapi-status-text">0:00/15:00</span>
              </div>
            </div>
          </div>
        </section>

        <section className="transcript-container min-h-[400px]">
          <div className="transcript-empty">
            <Mic className="mb-4 size-12 text-[#212a3b]" />
            <p className="transcript-empty-text">No conversation yet</p>
            <p className="transcript-empty-hint">
              Click the mic button above to start talking
            </p>
          </div>
        </section>
      </div>
    </main>
  );
}
