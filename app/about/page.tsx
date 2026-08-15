import Link from "next/link";

export default function AboutPage() {
  return (
    <main className="public-shell">
      <article className="public-page public-hero">
        <p className="sign-in-eyebrow">PACTLINE · NEGOTIATION OS</p>
        <h1>Turn scattered supply-chain evidence into a disciplined next move.</h1>
        <p>
          Pactline organizes contracts, correspondence, invoices, shipment
          records, and your case brief into an evidence-led strategy, action
          plan, and editable response draft.
        </p>
        <div className="public-actions">
          <Link className="public-primary" href="/sign-in">Continue with Google</Link>
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
