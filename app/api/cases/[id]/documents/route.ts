import { randomUUID } from "node:crypto";

import { db } from "@/db";
import { documentRecord } from "@/db/schema";
import { getAuthorizedSession } from "@/lib/access";
import { findOwnedCase, listCaseDocuments } from "@/lib/cases/repository";
import { extractDocumentText } from "@/lib/documents/extract";
import {
  deleteOriginalFile,
  persistOriginalFile,
} from "@/lib/documents/storage";
import { validateUpload } from "@/lib/documents/validation";

export const maxDuration = 300;

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const session = await getAuthorizedSession(request.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const ownedCase = await findOwnedCase(id, session.user.id);
  if (!ownedCase) {
    return Response.json({ error: "Case not found" }, { status: 404 });
  }

  const documents = await listCaseDocuments(id);
  return Response.json({ documents: documents.map(toPublicDocument) });
}

export async function POST(request: Request, context: RouteContext) {
  const session = await getAuthorizedSession(request.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: caseId } = await context.params;
  const ownedCase = await findOwnedCase(caseId, session.user.id);
  if (!ownedCase) {
    return Response.json({ error: "Case not found" }, { status: 404 });
  }

  const formData = await request.formData();
  const files = formData
    .getAll("files")
    .filter((value): value is File => value instanceof File);

  if (files.length === 0) {
    return Response.json({ error: "Add at least one file." }, { status: 400 });
  }
  if (files.length > 12) {
    return Response.json(
      { error: "Upload no more than 12 files at once." },
      { status: 400 },
    );
  }

  const documents = [];
  const failures: Array<{ name: string; error: string }> = [];

  for (const file of files) {
    let storageKey: string | null = null;
    try {
      const bytes = Buffer.from(await file.arrayBuffer());
      const extension = validateUpload(file, bytes);
      const documentId = randomUUID();
      const stored = await persistOriginalFile({
        ownerId: session.user.id,
        caseId,
        documentId,
        extension,
        bytes,
      });
      storageKey = stored.storageKey;

      const extraction = await extractDocumentText(bytes, extension);
      const [created] = await db
        .insert(documentRecord)
        .values({
          id: documentId,
          caseId,
          originalName: file.name.slice(0, 240),
          mediaType: file.type || "application/octet-stream",
          byteSize: file.size,
          storageKey: stored.storageKey,
          sha256: stored.sha256,
          extractionStatus: extraction.status,
          extractedText: extraction.text,
          extractedCharacters: extraction.characters,
          extractionMetadata: extraction.metadata,
          extractionError: extraction.error,
        })
        .returning();

      documents.push(toPublicDocument(created));
    } catch (error) {
      if (storageKey) await deleteOriginalFile(storageKey);
      failures.push({
        name: file.name,
        error: error instanceof Error ? error.message : "Upload failed.",
      });
    }
  }

  return Response.json(
    { documents, failures },
    { status: failures.length ? 207 : 201 },
  );
}

function toPublicDocument(document: typeof documentRecord.$inferSelect) {
  return {
    id: document.id,
    caseId: document.caseId,
    originalName: document.originalName,
    mediaType: document.mediaType,
    byteSize: document.byteSize,
    sha256: document.sha256,
    extractionStatus: document.extractionStatus,
    extractedCharacters: document.extractedCharacters,
    extractionMetadata: document.extractionMetadata,
    extractionError: document.extractionError,
    createdAt: document.createdAt,
    downloadUrl: `/api/documents/${document.id}`,
  };
}
