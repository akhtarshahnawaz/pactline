import { NextRequest, NextResponse } from "next/server";

import {
  getAuthorizedSession,
  isAuthenticationEnabled,
} from "@/lib/access";

export async function proxy(request: NextRequest) {
  if (!isAuthenticationEnabled) {
    return NextResponse.next();
  }

  const session = await getAuthorizedSession(request.headers);
  if (session) {
    return NextResponse.next();
  }

  const signInUrl = new URL("/sign-in", request.url);
  signInUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: [
    "/((?!api/auth|api/health|about|privacy|sign-in|_next/static|_next/image|favicon.ico|og.png).*)",
  ],
};
