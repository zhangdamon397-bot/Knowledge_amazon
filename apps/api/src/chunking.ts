import { createHash } from "node:crypto";
import type { ParsedSegment } from "./parsers.js";

export interface TextChunk {
  chunkIndex: number;
  content: string;
  sourceLabel: string;
  tokenCount: number;
  contentHash: string;
}

const MAX_CHARS = 1200;

export function chunkSegments(segments: ParsedSegment[]): TextChunk[] {
  const chunks: TextChunk[] = [];

  for (const segment of segments) {
    const paragraphs = segment.text
      .split(/\n{2,}/)
      .map((part) => part.trim())
      .filter(Boolean);

    let buffer = "";
    for (const paragraph of paragraphs.length > 0 ? paragraphs : [segment.text]) {
      if ((buffer + "\n\n" + paragraph).trim().length > MAX_CHARS && buffer.trim()) {
        chunks.push(toChunk(chunks.length, buffer, segment.sourceLabel));
        buffer = paragraph;
      } else {
        buffer = `${buffer}\n\n${paragraph}`.trim();
      }
    }

    if (buffer.trim()) {
      chunks.push(toChunk(chunks.length, buffer, segment.sourceLabel));
    }
  }

  return chunks;
}

function toChunk(chunkIndex: number, content: string, sourceLabel: string): TextChunk {
  return {
    chunkIndex,
    content,
    sourceLabel,
    tokenCount: countTokens(content),
    contentHash: createHash("sha256").update(content).digest("hex")
  };
}

function countTokens(content: string): number {
  return content.split(/\s+/).filter(Boolean).length;
}
