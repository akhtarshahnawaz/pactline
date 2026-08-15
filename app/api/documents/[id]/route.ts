import { and, eq } from "drizzle-orm";

import { db } from "@/db";
import { caseRecord, documentRecord } from "@/db/schema";
import { getAuthorizedSession } from "@/lib/access";
import { readOriginalFile } from "@/lib/documents/storage";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  const session = await getAuthorizedSession(request.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const [record] = await db
    .select({
      originalName: documentRecord.originalName,
      mediaType: documentRecord.mediaType,
      storageKey: documentRecord.storageKey,
    })
    .from(documentRecord)
    .innerJoin(caseRecord, eq(documentRecord.caseId, caseRecord.id))
    .where(
      and(eq(documentRecord.id, id), eq(caseRecord.ownerId, session.user.id)),
    )
    .limit(1);

  if (!record) {
    return Response.json({ error: "Document not found" }, { status: 404 });
  }

  try {
    const bytes = await readOriginalFile(record.storageKey);
    const asciiName = record.originalName
      .replace(/[^a-zA-Z0-9._ -]/g, "_")
      .slice(0, 180);
    return new Response(new Uint8Array(bytes), {
      headers: {
        "content-type": record.mediaType,
        "content-length": String(bytes.length),
        "content-disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(record.originalName)}`,
        "cache-control": "private, no-store",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error("Stored document could not be read", error);
    return Response.json(
      { error: "The stored document is temporarily unavailable." },
      { status: 503 },
    );
  }
}
