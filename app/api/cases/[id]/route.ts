import { and, desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { agentRun } from "@/db/schema";
import { getAuthorizedSession } from "@/lib/access";
import { findOwnedCase } from "@/lib/cases/repository";

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

  // The most recent run of any status, polled by the client while a run is
  // active (or after a reload mid-run) instead of relying on a stream.
  const [latestRun] = await db
    .select({ status: agentRun.status, progress: agentRun.progress })
    .from(agentRun)
    .where(eq(agentRun.caseId, id))
    .orderBy(desc(agentRun.startedAt))
    .limit(1);

  // Separately, the most recent *completed* run's result — kept independent
  // of the query above so a failed re-run doesn't hide a previous success.
  const [latestCompleted] = await db
    .select({ result: agentRun.result })
    .from(agentRun)
    .where(and(eq(agentRun.caseId, id), eq(agentRun.status, "completed")))
    .orderBy(desc(agentRun.completedAt))
    .limit(1);

  return Response.json({
    case: ownedCase,
    analysis: latestCompleted?.result ?? null,
    runStatus: latestRun?.status ?? null,
    runProgress: latestRun?.progress ?? null,
  });
}
