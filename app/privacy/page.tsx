import Link from "next/link";

export default function PrivacyPage() {
  const contact = process.env.PRIVACY_CONTACT_EMAIL;

  return (
    <main className="public-shell">
      <article className="public-page policy-page">
        <p className="sign-in-eyebrow">PACTLINE PROTOTYPE</p>
        <h1>Privacy notice</h1>
        <p className="policy-updated">Last updated 14 August 2026</p>

        <h2>What the workspace stores</h2>
        <p>
          Pactline stores the name, email address, and profile image supplied by
          Google at sign-in; case titles and descriptions; original uploaded
          files; extracted document text and processing metadata; and completed
          case-analysis results.
        </p>

        <h2>Why the data is processed</h2>
        <p>
          The information is used to authenticate you, preserve your cases,
          extract useful text from evidence, generate decision-support analysis
          and drafts, and operate and secure the prototype.
        </p>

        <h2>Where processing occurs</h2>
        <p>
          Account and case metadata are stored in PostgreSQL. Original files are
          stored on the application&apos;s attached Railway Volume. Relevant case
          text is sent to the model provider configured by the workspace
          operator when you run the case team. Do not upload data that you are
          not authorized to process or disclose.
        </p>

        <h2>Retention and your choices</h2>
        <p>
          This prototype retains case material until the workspace operator
          deletes it or applies a retention policy. You may ask the operator for
          access, correction, export, or deletion. Google sign-in can also be
          disconnected from your Google Account settings.
        </p>

        <h2>Important limitation</h2>
        <p>
          Pactline provides operational and negotiation decision support, not
          legal advice. Review every factual statement and draft before relying
          on it or sending it externally.
        </p>

        <h2>Contact</h2>
        <p>
          {contact ? <>For privacy requests, email <a href={`mailto:${contact}`}>{contact}</a>.</> : <>Contact the workspace operator who gave you access. Before public launch, the operator must configure a monitored privacy contact address.</>}
        </p>

        <div className="public-actions">
          <Link className="public-primary" href="/sign-in">Return to sign in</Link>
          <Link href="/about">About Pactline</Link>
        </div>
      </article>
    </main>
  );
}
