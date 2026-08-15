import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { z, ZodError } from "zod";

import { db } from "@/db";
import { agentRun, caseRecord } from "@/db/schema";
import { caseAnalysisGraph } from "@/lib/agents/case-graph";
import { CaseInputSchema, type CaseInput } from "@/lib/agents/schemas";
import {
  assertModelConfiguration,
  getSafeRuntimeDescriptor,
  ModelConfigurationError,
} from "@/lib/ai/provider";
import { getAuthorizedSession } from "@/lib/access";
import { findOwnedCase, listCaseDocuments } from "@/lib/cases/repository";

export const maxDuration = 300;

const StoredCaseRequestSchema = z.object({
  caseId: z.string().uuid(),
});

export async function POST(request: Request) {
  const session = await getAuthorizedSession(request.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let persistedRunId: string | null = null;
  let storedCaseId: string | null = null;

  try {
    const body: unknown = await request.json();
    let input: CaseInput;

    if (
      typeof body === "object" &&
      body !== null &&
      "caseId" in body
    ) {
      const storedRequest = StoredCaseRequestSchema.parse(body);
      const storedCase = await findOwnedCase(
        storedRequest.caseId,
        session.user.id,
      );
      if (!storedCase) {
        return Response.json({ error: "Case not found" }, { status: 404 });
      }

      const documents = await listCaseDocuments(storedCase.id);
      input = CaseInputSchema.parse({
        brief: storedCase.brief,
        objective: storedCase.objective ?? undefined,
        evidence: documents
          .filter(
            (document) =>
              document.extractionStatus === "ready" &&
              Boolean(document.extractedText),
          )
          .slice(0, 30)
          .map((document) => ({
            id: document.id,
            name: document.originalName,
            text: document.extractedText!.slice(0, 120_000),
          })),
      });
      storedCaseId = storedCase.id;
    } else {
      input = CaseInputSchema.parse(body);
    }

    assertModelConfiguration();
    const runtime = getSafeRuntimeDescriptor();

    if (storedCaseId) {
      persistedRunId = randomUUID();
      await db.insert(agentRun).values({
        id: persistedRunId,
        caseId: storedCaseId,
        provider: runtime.provider,
        model: runtime.model,
        status: "running",
      });
      await db
        .update(caseRecord)
        .set({ status: "analyzing", updatedAt: new Date() })
        .where(eq(caseRecord.id, storedCaseId));
    }

    const analysis = await caseAnalysisGraph.invoke(input);

    if (persistedRunId && storedCaseId) {
      await db
        .update(agentRun)
        .set({
          status: "completed",
          result: analysis,
          completedAt: new Date(),
        })
        .where(eq(agentRun.id, persistedRunId));
      await db
        .update(caseRecord)
        .set({ status: "strategy", updatedAt: new Date() })
        .where(eq(caseRecord.id, storedCaseId));
    }

    return Response.json({
      analysis,
      runtime,
      runId: persistedRunId,
    });
  } catch (error) {
    if (persistedRunId) {
      await db
        .update(agentRun)
        .set({
          status: "failed",
          error:
            error instanceof Error
              ? error.message.slice(0, 2_000)
              : "Analysis failed.",
          completedAt: new Date(),
        })
        .where(eq(agentRun.id, persistedRunId));
    }
    if (storedCaseId) {
      await db
        .update(caseRecord)
        .set({ status: "evidence", updatedAt: new Date() })
        .where(eq(caseRecord.id, storedCaseId));
    }

    if (error instanceof ZodError) {
      return Response.json(
        { error: "Invalid case input", issues: error.issues },
        { status: 400 },
      );
    }

    if (error instanceof ModelConfigurationError) {
      return Response.json({ error: error.message }, { status: 503 });
    }

    console.error("Case analysis failed", error);
    return Response.json(
      { error: "The analysis could not be completed." },
      { status: 500 },
    );
  }
}
