import path from "node:path";
import JSZip from "jszip";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

export interface ParsedSegment {
  text: string;
  sourceLabel: string;
}

export async function parseDocument(buffer: Buffer, filename: string): Promise<ParsedSegment[]> {
  const extension = path.extname(filename).toLowerCase();

  if (extension === ".pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      return splitPdfText(normalizeExtractedText(result.text));
    } finally {
      await parser.destroy();
    }
  }

  if (extension === ".pptx") {
    return parsePptx(buffer);
  }

  if (extension === ".ppt") {
    return [];
  }

  if (extension === ".docx") {
    const result = await mammoth.extractRawText({ buffer });
    return [{ text: normalizeExtractedText(result.value), sourceLabel: "document" }];
  }

  if (extension === ".txt" || extension === ".md") {
    return [{ text: normalizeExtractedText(buffer.toString("utf8")), sourceLabel: "document" }];
  }

  throw new Error(`Unsupported file type: ${extension}`);
}

function splitPdfText(text: string): ParsedSegment[] {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) {
    return [];
  }

  return normalized
    .split(/\n{3,}/)
    .map((part, index) => ({
      text: part.trim(),
      sourceLabel: `PDF section ${index + 1}`
    }))
    .filter((segment) => segment.text.length > 0);
}

async function parsePptx(buffer: Buffer): Promise<ParsedSegment[]> {
  const zip = await JSZip.loadAsync(buffer);
  const slideEntries = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    .sort((a, b) => slideNumber(a) - slideNumber(b));

  const segments: ParsedSegment[] = [];
  for (const entry of slideEntries) {
    const xml = await zip.files[entry].async("text");
    const text = normalizeExtractedText(extractXmlText(xml));
    if (text) {
      segments.push({
        text,
        sourceLabel: `slide ${slideNumber(entry)}`
      });
    }
  }
  return segments;
}

function slideNumber(entry: string): number {
  const match = entry.match(/slide(\d+)\.xml$/);
  return match ? Number(match[1]) : 0;
}

function extractXmlText(xml: string): string {
  const textNodes = [...xml.matchAll(/<a:t>(.*?)<\/a:t>/g)].map((match) => decodeXml(match[1]));
  return textNodes.join("\n").trim();
}

function normalizeExtractedText(text: string): string {
  let normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  let compacted = normalized.replace(/([\p{Script=Han}])\s+([\p{Script=Han}])/gu, "$1$2");
  while (compacted !== normalized) {
    normalized = compacted;
    compacted = normalized.replace(/([\p{Script=Han}])\s+([\p{Script=Han}])/gu, "$1$2");
  }

  return compacted;
}

function decodeXml(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}
