import VapiControls from "@/components/VapiControls";
import { getBookBySlug } from "@/lib/actions/book.actions";
import { auth } from "@clerk/nextjs/server";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

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

  return (
    <main className="book-page-container">
      <Link href="/" className="back-btn-floating" aria-label="Back to library">
        <ArrowLeft className="size-5 text-[#212a3b]" />
      </Link>
      <VapiControls book={book} />
    </main>
  );
}
