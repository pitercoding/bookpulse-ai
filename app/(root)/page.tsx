import HeroSection from "@/components/HeroSection";
import { getLibraryBooks } from "@/lib/actions/book.actions";
import { sampleBooks } from "@/lib/constants";
import BookCard from "@/components/BookCard";

export default async function Page() {
  const booksResult = await getLibraryBooks();
  const books = booksResult.success && booksResult.data.length > 0
    ? booksResult.data
    : sampleBooks;

  return (
    <main className="wrapper container">
      <HeroSection />

      <div className="library-books-grid">
        {books.map((book) => (
          <BookCard key={book._id} title={book.title} author={book.author} coverURL={book.coverURL} slug={book.slug} />
        ))}
      </div>
    </main>
  );
}
