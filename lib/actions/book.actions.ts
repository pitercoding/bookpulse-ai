"use server";

import { auth } from "@clerk/nextjs/server";
import { del } from "@vercel/blob";
import { connectToDatabase } from "@/database/mongoose";
import { CreateBook, TextSegment } from "@/types";
import { generateSlug, serializeData, splitIntoSegments } from "../utils";
import Book from "@/database/models/book.model";
import BookSegment from "@/database/models/book-segment.model";

const getErrorMessage = (error: unknown, fallback: string) => {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
};

const cleanupBlobUrls = async (urls: string[]) => {
  const sanitizedUrls = urls.filter(Boolean);

  if (sanitizedUrls.length === 0) {
    return;
  }

  await del(sanitizedUrls);
};

const tryCleanupBlobUrls = async (urls: string[]) => {
  try {
    await cleanupBlobUrls(urls);
  } catch (error) {
    console.error("Error cleaning up blob URLs", error);
  }
};

const toPlainResult = <T>(value: T) => serializeData(value);

export const createBook = async (data: CreateBook) => {
  try {
    await connectToDatabase();

    const slug = generateSlug(data.title);

    const existingBook = await Book.findOne({ slug }).lean();

    if (existingBook) {
      return toPlainResult({
        success: true,
        data: serializeData(existingBook),
        alreadyExist: true,
      });
    }

    const book = await Book.create({ ...data, slug, totalSegments: 0 });

    return toPlainResult({ success: true, data: serializeData(book) });

  } catch (e) {
    console.error("Error creating a book", e);

    return toPlainResult({
      success: false,
      error: getErrorMessage(e, "Failed to create book."),
    });
  }
};

export const saveBookSegments = async (bookId: string, clerkId: string, segments: TextSegment[]) => {
  try {
    await connectToDatabase();

    console.log("Saving book segments...");

    const segmentsToInsert = segments.map(({ text, segmentIndex, pageNumber, wordCount }) => ({
        clerkId,
        bookId,
        content: text,
        segmentIndex,
        pageNumber,
        wordCount,
    }));

    await BookSegment.insertMany(segmentsToInsert);

    await Book.findByIdAndUpdate(bookId, { totalSegments: segments.length });

    console.log("Book segments saved successfully.");

    return toPlainResult({
      success: true,
      data: { segmentsCreated: segments.length },
    });

  } catch (e) {
    console.error("Error saving book segments", e);

    await BookSegment.deleteMany({ bookId });
    await Book.findByIdAndDelete(bookId);
    console.log("Deleted book segments and book due to failure to save segments.");

    return toPlainResult({
      success: false,
      error: getErrorMessage(e, "Failed to save book segments."),
    });
  }
};

export const processUploadedBook = async (
  data: Omit<CreateBook, "clerkId"> & { extractedText: string },
) => {
  const { userId } = await auth();

  if (!userId) {
    return toPlainResult({ success: false, error: "Unauthorized" });
  }

  const uploadedUrls = [data.fileURL, data.coverURL].filter(
    (url): url is string => Boolean(url),
  );
  let createdBookId: string | undefined;

  try {
    await connectToDatabase();

    const slug = generateSlug(data.title);
    const existingBook = await Book.findOne({ slug }).lean();

    if (existingBook) {
      await tryCleanupBlobUrls(uploadedUrls);

      return toPlainResult({
        success: false,
        alreadyExists: true,
        data: serializeData(existingBook),
      });
    }

    const normalizedText = data.extractedText.trim();
    const textSegments = splitIntoSegments(normalizedText);

    if (!normalizedText || textSegments.length === 0) {
      await tryCleanupBlobUrls(uploadedUrls);

      return toPlainResult({
        success: false,
        error: "We couldn't extract readable text from this PDF.",
      });
    }

    const book = await Book.create({
      ...data,
      clerkId: userId,
      slug,
      coverURL: data.coverURL || "/assets/book-cover.svg",
      totalSegments: 0,
    });
    createdBookId = String(book._id);

    const segmentsResult = await saveBookSegments(createdBookId, userId, textSegments);

    if (!segmentsResult?.success) {
      throw new Error("Failed to save book segments.");
    }

    const savedBook = await Book.findById(createdBookId).lean();

    return toPlainResult({ success: true, data: serializeData(savedBook ?? book) });
  } catch (e) {
    console.error("Error processing uploaded book", e);

    if (createdBookId) {
      await BookSegment.deleteMany({ bookId: createdBookId });
      await Book.findByIdAndDelete(createdBookId);
    }

    await tryCleanupBlobUrls(uploadedUrls);

    return toPlainResult({
      success: false,
      error: getErrorMessage(e, "Failed to process uploaded book."),
    });
  }
};

export const cleanupUploadedFiles = async (urls: string[]) => {
  const { userId } = await auth();

  if (!userId) {
    return toPlainResult({ success: false, error: "Unauthorized" });
  }

  try {
    await cleanupBlobUrls(urls);

    return toPlainResult({ success: true });
  } catch (e) {
    console.error("Error cleaning up uploaded files", e);

    return toPlainResult({
      success: false,
      error: getErrorMessage(e, "Failed to clean up uploaded files."),
    });
  }
};

export const checkBookExists = async (title: string) => {
    try {
        await connectToDatabase();

        const slug = generateSlug(title);

        const existingBook = await Book.findOne({slug}).lean();

        if (existingBook) {
            return toPlainResult({
                exists: true,
                book: serializeData(existingBook)
            })
        }

        return toPlainResult({
            exists: false
        })
    } catch (e) {
        console.error('Error checking book exists', e);
        return toPlainResult({
            exists: false,
            error: getErrorMessage(e, "Failed to check whether the book already exists."),
        })
    }
};

export const getLibraryBooks = async () => {
  try {
    await connectToDatabase();

    const books = await Book.find({})
      .sort({ createdAt: -1 })
      .select("title author slug coverURL")
      .lean();

    return toPlainResult({
      success: true,
      data: books.map((book) => serializeData(book)),
    });
  } catch (e) {
    console.error("Error fetching library books", e);

    return toPlainResult({
      success: false,
      error: getErrorMessage(e, "Failed to fetch library books."),
      data: [],
    });
  }
};

export const getBookBySlug = async (slug: string) => {
  try {
    await connectToDatabase();

    const book = await Book.findOne({ slug })
      .select("title author coverURL persona slug")
      .lean();

    if (!book) {
      return toPlainResult({
        success: false,
        data: null,
        error: "Book not found.",
      });
    }

    return toPlainResult({
      success: true,
      data: serializeData(book),
    });
  } catch (e) {
    console.error("Error fetching book by slug", e);

    return toPlainResult({
      success: false,
      data: null,
      error: getErrorMessage(e, "Failed to fetch book."),
    });
  }
};
