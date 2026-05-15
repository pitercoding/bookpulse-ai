import { Types } from "mongoose";

import { connectToDatabase } from "@/database/mongoose";
import BookSegment from "@/database/models/book-segment.model";

type BookSegmentMatch = {
  _id: Types.ObjectId;
  content: string;
  segmentIndex: number;
  pageNumber?: number;
  score?: number;
};

const MAX_RESULTS = 3;

const escapeRegex = (value: string) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const toSegmentNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsedValue = Number(value);

    if (Number.isFinite(parsedValue)) {
      return parsedValue;
    }
  }

  return undefined;
};

const rankMatches = (
  matches: BookSegmentMatch[],
  segmentNumber?: number,
) => {
  return [...matches]
    .sort((left, right) => {
      const scoreDelta = (right.score ?? 0) - (left.score ?? 0);

      if (scoreDelta !== 0) {
        return scoreDelta;
      }

      if (segmentNumber !== undefined) {
        const leftDistance = Math.abs(left.segmentIndex - segmentNumber);
        const rightDistance = Math.abs(right.segmentIndex - segmentNumber);

        if (leftDistance !== rightDistance) {
          return leftDistance - rightDistance;
        }
      }

      return left.segmentIndex - right.segmentIndex;
    })
    .slice(0, MAX_RESULTS);
};

const searchByTextIndex = async (
  bookId: string,
  query: string,
  segmentNumber?: number,
) => {
  const matches = await BookSegment.find(
    {
      bookId,
      $text: { $search: query },
    },
    {
      content: 1,
      segmentIndex: 1,
      pageNumber: 1,
      score: { $meta: "textScore" },
    },
  )
    .sort({ score: { $meta: "textScore" }, segmentIndex: 1 })
    .limit(12)
    .lean<BookSegmentMatch[]>();

  return rankMatches(matches, segmentNumber);
};

const searchByRegex = async (
  bookId: string,
  query: string,
  segmentNumber?: number,
) => {
  const queryTerms = query
    .split(/\s+/)
    .map((term) => term.trim())
    .filter(Boolean)
    .slice(0, 8);

  if (queryTerms.length === 0) {
    return [];
  }

  const matchers = queryTerms.map((term) => new RegExp(escapeRegex(term), "i"));
  const matches = await BookSegment.find({
    bookId,
    $or: matchers.map((matcher) => ({
      content: matcher,
    })),
  })
    .select("content segmentIndex pageNumber")
    .limit(24)
    .lean<BookSegmentMatch[]>();

  const scoredMatches = matches.map((match) => ({
    ...match,
    score: matchers.reduce(
      (score, matcher) => score + Number(matcher.test(match.content)),
      0,
    ),
  }));

  return rankMatches(scoredMatches, segmentNumber);
};

export const searchBookSegments = async (
  bookId: string,
  query: string,
  segmentNumber?: unknown,
) => {
  const normalizedBookId = bookId.trim();
  const normalizedQuery = query.trim();
  const parsedSegmentNumber = toSegmentNumber(segmentNumber);

  if (!normalizedBookId || !normalizedQuery) {
    return [];
  }

  if (!Types.ObjectId.isValid(normalizedBookId)) {
    return [];
  }

  await connectToDatabase();

  const textMatches = await searchByTextIndex(
    normalizedBookId,
    normalizedQuery,
    parsedSegmentNumber,
  );

  if (textMatches.length > 0) {
    return textMatches;
  }

  return searchByRegex(
    normalizedBookId,
    normalizedQuery,
    parsedSegmentNumber,
  );
};
