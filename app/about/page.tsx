import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="public-shell">
      <article className="public-page public-hero">
        <p className="sign-in-eyebrow">PACTLINE · NEGOTIATION OS</p>
        <h1>Turn scattered supply-chain evidence into a disciplined next move.</h1>
        <p>
          Pactline is a case workspace for supply-chain and cargo-insurance
          negotiations. You create a case, upload the contracts,
          correspondence, invoices, and shipment records involved, and a team
          of specialist AI agents reads that evidence to build a
          fact-checked strategy, a prioritized action plan, and an editable
          draft response &mdash; every claim in the output is tied back to the
          document it came from. It is decision support, not legal advice,
          and it never sends anything on your behalf without your review.
        </p>
        <p>
          <strong>Getting in:</strong> create a free account with your name,
          email, and a password &mdash; no third-party sign-in is required.
          Each account only ever sees its own cases and files.
        </p>
        <div className="public-actions">
          <Link className="public-primary" href="/sign-up">Create your workspace</Link>
          <Link href="/privacy">Read the privacy notice</Link>
        </div>
        <div className="public-principles">
          <div><strong>Originals preserved</strong><span>Uploaded files remain downloadable from the private case.</span></div>
          <div><strong>Provider neutral</strong><span>The operator can configure OpenAI, Claude, or a compatible model API.</span></div>
          <div><strong>Human controlled</strong><span>Pactline drafts and recommends; it does not send messages for you.</span></div>
        </div>
      </article>
    </main>
  );
}
