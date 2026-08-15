"use client";

import Link from "next/link";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

export default function SignInPage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function signIn() {
    setLoading(true);
    setError("");

    const result = await authClient.signIn.social({
      provider: "google",
      callbackURL: "/",
    });

    if (result.error) {
      setError(result.error.message || "Google sign-in could not be started.");
      setLoading(false);
    }
  }

  return (
    <main className="sign-in-shell">
      <section className="sign-in-card" aria-labelledby="sign-in-title">
        <div className="sign-in-brand" aria-hidden="true">
          P
        </div>
        <p className="sign-in-eyebrow">PACTLINE WORKSPACE</p>
        <h1 id="sign-in-title">Make the next move with evidence.</h1>
        <p className="sign-in-copy">
          Sign in to your supply-chain decision workspace. The workspace
          operator controls the model provider and data policy.
        </p>
        <button
          className="google-sign-in"
          type="button"
          onClick={signIn}
          disabled={loading}
        >
          <span className="google-mark" aria-hidden="true">
            G
          </span>
          {loading ? "Opening Google…" : "Continue with Google"}
        </button>
        {error ? <p className="sign-in-error">{error}</p> : null}
        <p className="sign-in-note">
          Any Google account may join this prototype. By continuing, you agree
          to the workspace&apos;s <Link href="/privacy">privacy notice</Link>.
        </p>
      </section>
    </main>
  );
}
