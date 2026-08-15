import { and, desc, eq } from "drizzle-orm";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { z, ZodError } from "zod";

import { db } from "@/db";
import { agentRun } from "@/db/schema";
import {
  assertModelConfiguration,
  createChatModel,
  ModelConfigurationError,
} from "@/lib/ai/provider";
import { getAuthorizedSession } from "@/lib/access";
import { findOwnedCase, listCaseDocuments } from "@/lib/cases/repository";

const AskSchema = z.object({
  question: z.string().min(3).max(1_000),
});

type RouteContext = { params: Promise<{ id: string }> };

/**
 * Answers a question about one case, grounded only in that case's brief,
 * evidence, and its most recent completed analysis — so a user who doesn't
 * trust or understand a recommendation can ask about it directly instead of
 * taking the written output on faith.
 */
export async function POST(request: Request, context: RouteContext) {
  const session = await getAuthorizedSession(request.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const ownedCase = await findOwnedCase(id, session.user.id);
  if (!ownedCase) {
    return Response.json({ error: "Case not found" }, { status: 404 });
  }

  let question: string;
  try {
    ({ question } = AskSchema.parse(await request.json()));
    assertModelConfiguration();
  } catch (error) {
    if (error instanceof ZodError) {
      return Response.json(
        { error: "Ask a question between 3 and 1,000 characters." },
        { status: 400 },
      );
    }
    if (error instanceof ModelConfigurationError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    return Response.json({ error: "The question could not be sent." }, { status: 400 });
  }

  try {
    const [documents, [latestRun]] = await Promise.all([
      listCaseDocuments(id),
      db
        .select({ result: agentRun.result })
        .from(agentRun)
        .where(and(eq(agentRun.caseId, id), eq(agentRun.status, "completed")))
        .orderBy(desc(agentRun.completedAt))
        .limit(1),
    ]);

    const evidenceText = documents
      .filter((document) => document.extractionStatus === "ready" && document.extractedText)
      .slice(0, 10)
      .map(
        (document) =>
          `SOURCE: ${document.originalName}\n${document.extractedText!.slice(0, 20_000)}`,
      )
      .join("\n\n");

    const context = [
      `CASE BRIEF\n${ownedCase.brief}`,
      ownedCase.objective ? `OBJECTIVE\n${ownedCase.objective}` : "",
      evidenceText ? `EVIDENCE\n${evidenceText}` : "EVIDENCE\nNone uploaded yet.",
      latestRun?.result
        ? `MOST RECENT CASE-TEAM ANALYSIS (JSON)\n${JSON.stringify(latestRun.result)}`
        : "MOST RECENT CASE-TEAM ANALYSIS\nNo analysis has been run yet.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const model = createChatModel();
    const response = await model.invoke([
      new SystemMessage(
        [
          "You are answering one question from the user about their own case, so they can understand or double-check what the case team produced — you are not the case team itself.",
          "Answer using only the case brief, evidence, and analysis given below. Never invent facts, figures, contract terms, or sources that are not present in that material.",
          "If the material does not cover the question, say so plainly rather than guessing.",
          "When your answer relies on a specific finding or document, name it.",
          "Keep the answer conversational and to the point — a few sentences unless the question genuinely needs more.",
          "This is decision support, not legal advice; say so if the question is really asking for a legal guarantee.",
        ].join(" "),
      ),
      new HumanMessage(`${context}\n\nQUESTION\n${question}`),
    ]);

    const answer =
      typeof response.content === "string"
        ? response.content
        : Array.isArray(response.content)
          ? response.content
              .map((part) => (typeof part === "object" && part !== null && "text" in part ? String(part.text) : ""))
              .join("")
          : "";

    return Response.json({ answer: answer.trim() || "I don't have an answer for that from the case material." });
  } catch (error) {
    console.error("Case question failed", error);
    if (error instanceof ModelConfigurationError) {
      return Response.json({ error: error.message }, { status: 503 });
    }
    return Response.json({ error: "The question could not be answered right now." }, { status: 500 });
  }
}
