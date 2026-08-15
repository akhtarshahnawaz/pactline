import "server-only";

import mammoth from "mammoth";
import readExcelFile from "read-excel-file/node";
import { extractText as extractPdfText } from "unpdf";

const MAX_EXTRACTED_CHARACTERS = 240_000;

export type ExtractionResult = {
  status: "ready" | "empty" | "unsupported" | "failed";
  text: string | null;
  characters: number;
  metadata: Record<string, unknown>;
  error: string | null;
};

function normalizeText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

function finish(text: string, metadata: Record<string, unknown> = {}): ExtractionResult {
  const normalized = normalizeText(text);
  if (!normalized) {
    return {
      status: "empty",
      text: null,
      characters: 0,
      metadata,
      error: "The file was stored, but no machine-readable text was found.",
    };
  }

  const truncated = normalized.length > MAX_EXTRACTED_CHARACTERS;
  const retained = normalized.slice(0, MAX_EXTRACTED_CHARACTERS);
  return {
    status: "ready",
    text: retained,
    characters: retained.length,
    metadata: { ...metadata, truncated, originalCharacters: normalized.length },
    error: null,
  };
}

function stringifyCell(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (value === null || value === undefined) return "";
  return String(value).replace(/\t|\r?\n/g, " ");
}

export async function extractDocumentText(
  bytes: Buffer,
  extension: string,
): Promise<ExtractionResult> {
  try {
    if (extension === "pdf") {
      const result = await extractPdfText(new Uint8Array(bytes), {
        mergePages: true,
      });
      return finish(result.text, { pages: result.totalPages, format: "pdf" });
    }

    if (extension === "docx") {
      const result = await mammoth.extractRawText({ buffer: bytes });
      return finish(result.value, {
        format: "docx",
        warnings: result.messages.map((message) => message.message),
      });
    }

    if (extension === "xlsx") {
      const sheets = await readExcelFile(bytes);
      const text = sheets
        .map(
          (sheet) =>
            `SHEET: ${sheet.sheet}\n${sheet.data
              .map((row) => row.map(stringifyCell).join("\t"))
              .join("\n")}`,
        )
        .join("\n\n");
      return finish(text, { format: "xlsx", sheets: sheets.length });
    }

    if (["txt", "md", "csv", "json", "xml", "html", "eml"].includes(extension)) {
      return finish(bytes.toString("utf8"), { format: extension });
    }

    return {
      status: "unsupported",
      text: null,
      characters: 0,
      metadata: { format: extension },
      error: "The original file is stored, but text extraction is not enabled for this format.",
    };
  } catch (error) {
    return {
      status: "failed",
      text: null,
      characters: 0,
      metadata: { format: extension },
      error: error instanceof Error ? error.message.slice(0, 1_000) : "Extraction failed.",
    };
  }
}
