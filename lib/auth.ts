import "server-only";

import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";

import { db } from "@/db";
import * as schema from "@/db/schema";

const authEnabled = process.env.AUTH_ENABLED === "true";
const authBaseUrl =
  process.env.BETTER_AUTH_URL?.trim() || "http://localhost:3000";
const authSecret =
  process.env.BETTER_AUTH_SECRET ??
  "pactline-local-development-secret-change-me";

if (authEnabled && process.env.NODE_ENV === "production") {
  if (!process.env.BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET is required when AUTH_ENABLED=true.");
  }
}

export const auth = betterAuth({
  appName: "Pactline",
  baseURL: authBaseUrl,
  secret: authSecret,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    // No email provider is configured for this prototype, so verification
    // stays off and sign-up signs the user straight in.
    requireEmailVerification: false,
    autoSignIn: true,
  },
  trustedOrigins: [authBaseUrl],
});
