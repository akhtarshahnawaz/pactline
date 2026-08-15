"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";

export default function SignUpPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function signUp(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("Use a password with at least 8 characters.");
      return;
    }

    setLoading(true);
    const result = await authClient.signUp.email({
      name: name.trim() || email.trim(),
      email: email.trim(),
      password,
    });

    if (result.error) {
      setError(result.error.message || "The account could not be created.");
      setLoading(false);
      return;
    }

    router.push("/");
    router.refresh();
  }

  return (
    <main className="sign-in-shell">
      <section className="sign-in-card" aria-labelledby="sign-up-title">
        <div className="sign-in-brand" aria-hidden="true">
          P
        </div>
        <p className="sign-in-eyebrow">PACTLINE WORKSPACE</p>
        <h1 id="sign-up-title">Create your workspace.</h1>
        <p className="sign-in-copy">
          Set up your account to start building evidence-led negotiation cases.
        </p>
        <form className="auth-form" onSubmit={signUp}>
          <label className="field-label" htmlFor="name">NAME</label>
          <input
            id="name"
            type="text"
            autoComplete="name"
            required
            className="case-title-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Jordan Lee"
          />
          <label className="field-label" htmlFor="email">EMAIL</label>
          <input
            id="email"
            type="email"
            autoComplete="email"
            required
            className="case-title-input"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
          />
          <label className="field-label" htmlFor="password">PASSWORD</label>
          <input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            className="case-title-input"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 8 characters"
          />
          <button className="auth-button auth-submit" type="submit" disabled={loading}>
            {loading ? "Creating account…" : "Create account"}
          </button>
        </form>
        {error ? <p className="sign-in-error">{error}</p> : null}
        <p className="sign-in-note">
          Already have a workspace? <Link href="/sign-in">Sign in</Link>.
          By continuing, you agree to the workspace&apos;s <Link href="/privacy">privacy notice</Link>.
        </p>
      </section>
    </main>
  );
}
