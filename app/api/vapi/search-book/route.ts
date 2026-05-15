import { NextResponse } from "next/server";

import { searchBookSegments } from "@/lib/search-book-segments";

const NO_INFORMATION_FOUND = "no information found about this topic";

type ToolArguments = Record<string, unknown>;

type VapiToolCall = {
  id?: string;
  name?: string;
  arguments?: ToolArguments;
  function?: {
    name?: string;
    parameters?: ToolArguments;
  };
};

type VapiToolCallsMessage = {
  type?: string;
  toolCallList?: VapiToolCall[];
};

const normalizeToolName = (value: string | undefined) =>
  value?.trim().toLowerCase().replace(/[_-]+/g, " ");

const getToolName = (toolCall: VapiToolCall) =>
  toolCall.name ?? toolCall.function?.name;

const getToolArguments = (toolCall: VapiToolCall): ToolArguments =>
  toolCall.arguments ?? toolCall.function?.parameters ?? {};

const getStringValue = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";

const formatMatches = (
  matches: Awaited<ReturnType<typeof searchBookSegments>>,
) => {
  if (matches.length === 0) {
    return NO_INFORMATION_FOUND;
  }

  return matches
    .map(
      (match) =>
        `Segment ${match.segmentIndex}${match.pageNumber ? ` (Page ${match.pageNumber})` : ""}\n${match.content}`,
    )
    .join("\n\n");
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { message?: VapiToolCallsMessage };
    const message = body.message;

    if (message?.type !== "tool-calls") {
      return NextResponse.json(
        { error: "Expected a Vapi tool-calls payload." },
        { status: 400 },
      );
    }

    const toolCalls = message.toolCallList ?? [];
    const searchBookCalls = toolCalls.filter(
      (toolCall) => normalizeToolName(getToolName(toolCall)) === "search book",
    );

    const results = await Promise.all(
      searchBookCalls.map(async (toolCall) => {
        const parameters = getToolArguments(toolCall);
        const bookId = getStringValue(
          parameters.bookId ?? parameters.bookID ?? parameters.id,
        );
        const query = getStringValue(
          parameters.query ??
            parameters.topic ??
            parameters.question ??
            parameters.searchQuery,
        );
        const segmentNumber =
          parameters.segmentNumber ??
          parameters.segment_index ??
          parameters.segmentIndex ??
          parameters.segment;

        const matches = await searchBookSegments(bookId, query, segmentNumber);

        return {
          toolCallId: toolCall.id,
          result: formatMatches(matches),
        };
      }),
    );

    return NextResponse.json({ results });
  } catch (error) {
    console.error("Error handling Vapi search book tool call", error);

    return NextResponse.json(
      { error: "Failed to handle Vapi search book tool call." },
      { status: 500 },
    );
  }
}
