import { randomUUID } from "node:crypto";

import { desc, eq } from "drizzle-orm";
import { z, ZodError } from "zod";

import { db } from "@/db";
import { caseRecord } from "@/db/schema";
import { getAuthorizedSession } from "@/lib/access";
import { ensureUserRecord } from "@/lib/cases/repository";

const CreateCaseSchema = z.object({
  title: z.string().min(3).max(160),
  brief: z.string().min(30).max(30_000),
  objective: z.string().max(4_000).optional(),
});

export async function GET(request: Request) {
  const session = await getAuthorizedSession(request.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  await ensureUserRecord(session.user);
  const cases = await db
    .select()
    .from(caseRecord)
    .where(eq(caseRecord.ownerId, session.user.id))
    .orderBy(desc(caseRecord.updatedAt));

  return Response.json({ cases });
}

export async function POST(request: Request) {
  const session = await getAuthorizedSession(request.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const input = CreateCaseSchema.parse(await request.json());
    await ensureUserRecord(session.user);

    const [created] = await db
      .insert(caseRecord)
      .values({
        id: randomUUID(),
        ownerId: session.user.id,
        title: input.title,
        brief: input.brief,
        objective: input.objective,
        status: "evidence",
      })
      .returning();

    return Response.json({ case: created }, { status: 201 });
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        { error: "Invalid case", issues: error.issues },
        { status: 400 },
      );
    }
    console.error("Case creation failed", error);
    return Response.json({ error: "The case could not be created." }, { status: 500 });
  }
}
