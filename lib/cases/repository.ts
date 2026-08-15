import "server-only";

import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { caseRecord, documentRecord, user } from "@/db/schema";

export type RequestUser = {
  id: string;
  email: string;
  name?: string | null;
};

export async function ensureUserRecord(requestUser: RequestUser) {
  await db
    .insert(user)
    .values({
      id: requestUser.id,
      email: requestUser.email,
      name: requestUser.name?.trim() || requestUser.email,
      emailVerified: true,
    })
    .onConflictDoNothing();
}

export async function findOwnedCase(caseId: string, ownerId: string) {
  const [record] = await db
    .select()
    .from(caseRecord)
    .where(and(eq(caseRecord.id, caseId), eq(caseRecord.ownerId, ownerId)))
    .limit(1);
  return record ?? null;
}

export async function listCaseDocuments(caseId: string) {
  return db
    .select()
    .from(documentRecord)
    .where(eq(documentRecord.caseId, caseId))
    .orderBy(desc(documentRecord.createdAt));
}
