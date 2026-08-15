import "server-only";

import { auth } from "@/lib/auth";

export const isAuthenticationEnabled = process.env.AUTH_ENABLED === "true";
export const accessMode =
  process.env.ACCESS_MODE === "allowlist" ? "allowlist" : "public";

function allowedEmails() {
  return new Set(
    (process.env.ALLOWED_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isEmailAllowed(email: string) {
  if (accessMode === "public") {
    return true;
  }

  const allowlist = allowedEmails();
  return allowlist.has(email.toLowerCase());
}

export async function getAuthorizedSession(requestHeaders: Headers) {
  if (!isAuthenticationEnabled) {
    return { user: { id: "local-development", email: "local@pactline.test" } };
  }

  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session || !isEmailAllowed(session.user.email)) {
    return null;
  }

  return session;
}
