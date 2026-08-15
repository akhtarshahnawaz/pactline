import { getSafeRuntimeDescriptor } from "@/lib/ai/provider";
import { accessMode, isAuthenticationEnabled } from "@/lib/access";

export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    ...getSafeRuntimeDescriptor(),
    authentication: isAuthenticationEnabled ? "email" : "Disabled for local setup",
    access: accessMode,
  });
}
