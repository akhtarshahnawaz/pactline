import { randomUUID } from "node:crypto";

import { eq } from "drizzle-orm";
import { z, ZodError } from "zod";

import { db } from "@/db";
import { agentRun, caseRecord } from "@/db/schema";
import { caseAnalysisGraph } from "@/lib/agents/case-graph";
import { CaseInputSchema, type CaseAnalysis, type CaseInput } from "@/lib/agents/schemas";
import {
  assertModelConfiguration,
  getSafeRuntimeDescriptor,
  ModelConfigurationError,
} from "@/lib/ai/provider";
import { getAuthorizedSession } from "@/lib/access";
import { findOwnedCase, listCaseDocuments } from "@/lib/cases/repository";

const StoredCaseRequestSchema = z.object({
  caseId: z.string().uuid(),
});

export type AnalysisProgress = {
  stage: "specialists" | "synthesizing";
  specialists: Record<string, { confidence: number }>;
};

/**
 * The case analysis graph runs four specialists in parallel followed by a
 * synthesis step — five model calls, none of them instant. This used to
 * stream progress over Server-Sent Events, but that response never reached
 * the browser once deployed (a proxy/edge layer between Railway and the
 * client buffers it), so progress is instead written to the database as
 * each step of `caseAnalysisGraph` completes, and the client polls for it —
 * ordinary request/response, nothing that depends on a stream surviving
 * infrastructure we don't control.
 *
 * This handler validates everything, creates the run row, and returns
 * immediately; the actual analysis keeps running in this same long-lived
 * process (this is a persistent Docker service, not a serverless function,
 * so an un-awaited async task here keeps executing after the response is
 * sent).
 */
export async function POST(request: Request) {
  const session = await getAuthorizedSession(request.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let input: CaseInput;
  let storedCaseId: string | null = null;

  try {
    const body: unknown = await request.json();

    if (typeof body === "object" && body !== null && "caseId" in body) {
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
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        { error: "Invalid case input", issues: error.issues },
        { status: 400 },
      );
    }
    if (error instanceof ModelConfigurationError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    console.error("Case analysis request rejected", error);
    return Response.json(
      { error: "The analysis could not be started." },
      { status: 500 },
    );
  }

  const runtime = getSafeRuntimeDescriptor();

  // The ad-hoc (no persisted case) path has nowhere to poll a result from,
  // so it still runs the analysis inline and returns the full result.
  if (!storedCaseId) {
    try {
      const analysis = await caseAnalysisGraph.invoke(input);
      return Response.json({ analysis, runtime, runId: null });
    } catch (error) {
      console.error("Ad-hoc case analysis failed", error);
      if (error instanceof ModelConfigurationError) {
        return Response.json({ error: error.message }, { status: 503 });
      }
      return Response.json(
        { error: "The analysis could not be completed." },
        { status: 500 },
      );
    }
  }

  const caseId = storedCaseId;
  const runId = randomUUID();

  await db.insert(agentRun).values({
    id: runId,
    caseId,
    provider: runtime.provider,
    model: runtime.model,
    status: "running",
  });
  await db
    .update(caseRecord)
    .set({ status: "analyzing", updatedAt: new Date() })
    .where(eq(caseRecord.id, caseId));

  // Deliberately not awaited: this keeps running after the response below
  // is sent. The client learns about it by polling GET /api/cases/[id].
  void runAnalysisInBackground({ runId, caseId, input });

  console.log(`Case analysis started for case ${caseId} (run ${runId})`);

  return Response.json({ runId, runtime }, { status: 202 });
}

async function runAnalysisInBackground({
  runId,
  caseId,
  input,
}: {
  runId: string;
  caseId: string;
  input: CaseInput;
}) {
  const startedAt = Date.now();

  try {
    let finalAnalysis: CaseAnalysis | null = null;
    const progress: AnalysisProgress = { stage: "specialists", specialists: {} };

    const graphStream = await caseAnalysisGraph.stream(input, {
      streamMode: "updates",
    });

    for await (const chunk of graphStream) {
      if (!chunk || typeof chunk !== "object") continue;
      const update = chunk as Record<string, unknown>;

      if ("supply_chain_specialist" in update) {
        const specialist = update.supply_chain_specialist as {
          role: string;
          confidence: number;
        };
        progress.specialists[specialist.role] = { confidence: specialist.confidence };
        await db
          .update(agentRun)
          .set({ progress })
          .where(eq(agentRun.id, runId));
      }

      if ("case_lead_synthesis" in update) {
        finalAnalysis = update.case_lead_synthesis as CaseAnalysis;
        progress.stage = "synthesizing";
        await db
          .update(agentRun)
          .set({ progress })
          .where(eq(agentRun.id, runId));
      }
    }

    if (!finalAnalysis) {
      throw new Error("The case team did not return a result.");
    }

    console.log(
      `Case analysis finished for case ${caseId} in ${Date.now() - startedAt}ms`,
    );

    await db
      .update(agentRun)
      .set({
        status: "completed",
        result: finalAnalysis,
        progress: null,
        completedAt: new Date(),
      })
      .where(eq(agentRun.id, runId));
    await db
      .update(caseRecord)
      .set({ status: "strategy", updatedAt: new Date() })
      .where(eq(caseRecord.id, caseId));
  } catch (error) {
    console.error("Case analysis failed", error);
    const message =
      error instanceof Error
        ? error.message.slice(0, 2_000)
        : "Analysis failed.";

    await db
      .update(agentRun)
      .set({ status: "failed", error: message, progress: null, completedAt: new Date() })
      .where(eq(agentRun.id, runId));
    await db
      .update(caseRecord)
      .set({ status: "evidence", updatedAt: new Date() })
      .where(eq(caseRecord.id, caseId));
  }
}
