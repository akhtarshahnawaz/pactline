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

  const [latestRun] = await db
    .select({ result: agentRun.result, completedAt: agentRun.completedAt })
    .from(agentRun)
    .where(and(eq(agentRun.caseId, id), eq(agentRun.status, "completed")))
    .orderBy(desc(agentRun.completedAt))
    .limit(1);

  return Response.json({
    case: ownedCase,
    analysis: latestRun?.result ?? null,
  });
}
