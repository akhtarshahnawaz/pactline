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

export const maxDuration = 300;

const StoredCaseRequestSchema = z.object({
  caseId: z.string().uuid(),
});

const encoder = new TextEncoder();

function sseFrame(event: string, data: unknown) {
  return encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

/**
 * The case analysis graph runs four specialists in parallel followed by a
 * synthesis step — five model calls, none of them instant. Rather than make
 * the client wait on one opaque response, this streams progress as each
 * step of `caseAnalysisGraph` completes, using LangGraph's built-in
 * `streamMode: "updates"` (no changes to lib/agents/case-graph.ts needed —
 * it yields each task's output the moment that task resolves).
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
  let persistedRunId: string | null = null;

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

  const runId = persistedRunId;
  const caseId = storedCaseId;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(sseFrame(event, data));
      const startedAt = Date.now();

      send("started", { runId, runtime });
      console.log(
        `Case analysis started${caseId ? ` for case ${caseId}` : ""} (run ${runId ?? "ad-hoc"})`,
      );

      try {
        let finalAnalysis: CaseAnalysis | null = null;

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
              findings: unknown[];
              risks: unknown[];
            };
            send("specialist", {
              role: specialist.role,
              confidence: specialist.confidence,
              findings: specialist.findings?.length ?? 0,
              risks: specialist.risks?.length ?? 0,
            });
          }

          if ("case_lead_synthesis" in update) {
            finalAnalysis = update.case_lead_synthesis as CaseAnalysis;
            send("synthesizing", {});
          }
        }

        if (!finalAnalysis) {
          throw new Error("The case team did not return a result.");
        }

        console.log(
          `Case analysis finished${caseId ? ` for case ${caseId}` : ""} in ${Date.now() - startedAt}ms`,
        );

        if (runId && caseId) {
          await db
            .update(agentRun)
            .set({
              status: "completed",
              result: finalAnalysis,
              completedAt: new Date(),
            })
            .where(eq(agentRun.id, runId));
          await db
            .update(caseRecord)
            .set({ status: "strategy", updatedAt: new Date() })
            .where(eq(caseRecord.id, caseId));
        }

        send("complete", { analysis: finalAnalysis, runtime, runId });
      } catch (error) {
        console.error("Case analysis failed", error);
        const message =
          error instanceof Error
            ? error.message.slice(0, 2_000)
            : "Analysis failed.";

        if (runId) {
          await db
            .update(agentRun)
            .set({ status: "failed", error: message, completedAt: new Date() })
            .where(eq(agentRun.id, runId));
        }
        if (caseId) {
          await db
            .update(caseRecord)
            .set({ status: "evidence", updatedAt: new Date() })
            .where(eq(caseRecord.id, caseId));
        }

        send("error", { error: "The analysis could not be completed." });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
