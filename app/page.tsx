"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { authClient } from "@/lib/auth-client";

type View = "Overview" | "Evidence" | "Strategy" | "Drafts";

type RuntimeStatus = {
  orchestrator: string;
  provider: string;
  model: string;
  configured: boolean;
  authentication?: string;
  access?: string;
};

type LiveAnalysis = {
  executiveSummary: string;
  recommendedPosition: string;
  confidence: number;
  draftResponse: string;
};

type StoredDocument = {
  id: string;
  originalName: string;
  mediaType: string;
  byteSize: number;
  sha256: string;
  extractionStatus: "ready" | "empty" | "unsupported" | "failed";
  extractedCharacters: number;
  extractionError: string | null;
  downloadUrl: string;
};

type CreatedCaseView = {
  id: string;
  title: string;
  subtitle: string;
  status: string;
};

const activeCase = {
  title: "Jazan voyage termination",
  subtitle: "Cargo insurance recovery · Claim 59252/C/26 + 59253/C/26",
  status: "Position challenged",
};

const pastCase = {
  title: "Red Sea surcharge dispute",
  subtitle: "14 × 20′ containers · Dammam",
  status: "Won · $50,100 recovered",
};

const evidence = [
  {
    type: "EMAIL THREAD",
    title: "Insurer correspondence",
    meta: "10 pages · 11 Aug 2026",
    note: "Preliminary denial, reservation of rights, and escalation request",
    facts: 9,
    color: "coral",
  },
  {
    type: "POLICY",
    title: "CIC marine cargo policies",
    meta: "2 policies · All Risks",
    note: "Section IV(2) Duty of the Insured identified as primary lever",
    facts: 7,
    color: "green",
  },
  {
    type: "BILL OF LADING",
    title: "SLGS262469 + SLGS262184",
    meta: "Shanghai → Jeddah",
    note: "Contracted destination conflicts with forced discharge at Jazan",
    facts: 12,
    color: "blue",
  },
  {
    type: "CARGO RECORD",
    title: "Chop roving 2400",
    meta: "166.4 MT · 8 × 20′ GP",
    note: "Heat exposure supports imminent physical-loss argument",
    facts: 5,
    color: "amber",
  },
];

const strategyRoutes = [
  {
    label: "PRIMARY POSITION",
    title: "Sue & labor / preservation expense",
    score: 82,
    description:
      "Frame emergency extraction and onward transit as reasonable measures taken to avert imminent physical loss—not as delay costs.",
    tags: ["Section IV(2)", "Physical peril", "Mitigation duty"],
    tone: "recommended",
  },
  {
    label: "FALLBACK",
    title: "Carrier recovery & commercial settlement",
    score: 61,
    description:
      "Preserve recourse against the carrier while using the documented destination failure to negotiate a cost-sharing resolution.",
    tags: ["B/L obligation", "Subrogation", "Cost share"],
    tone: "fallback",
  },
  {
    label: "AVOID AS LEAD",
    title: "Forwarding charges after sea peril",
    score: 34,
    description:
      "The adjuster has already narrowed this clause and argues that Red Sea security hazards are not a qualifying sea peril.",
    tags: ["Already rebutted", "High friction"],
    tone: "avoid",
  },
];

const defaultDraft = `Dear Wyne,

Thank you for setting out underwriters’ preliminary position. APS respectfully requests senior review of both claim files.

Our claim is not for commercial delay or loss of market. The expenses were incurred to discharge APS’s express duty under Section IV, Clause 2 to protect and preserve the insured cargo from an imminent physical loss.

The cargo—166.4 MT of fiberglass chop roving across eight 20′ containers—was involuntarily discharged at an unnominated port and left on exposed terminal tarmac. Under these conditions, container temperatures may exceed 60–65°C, creating a documented risk of binder softening, filament fusion, and irreversible physical damage.

APS therefore requests that CIC confirm in principle that reasonable emergency extraction, handling, and onward-transit costs incurred to avert that loss are recoverable. Please also keep both files active while the supporting thermal evidence and cost schedule are finalized.

All rights are reserved.`;

function Glyph({ children }: { children: React.ReactNode }) {
  return <span className="glyph" aria-hidden="true">{children}</span>;
}

export default function Home() {
  const router = useRouter();
  const [view, setView] = useState<View>("Overview");
  const [caseMode, setCaseMode] = useState<"active" | "won">("active");
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [caseTitle, setCaseTitle] = useState("");
  const [caseBrief, setCaseBrief] = useState("");
  const [creatingCase, setCreatingCase] = useState(false);
  const [savedCases, setSavedCases] = useState<CreatedCaseView[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [storedDocuments, setStoredDocuments] = useState<StoredDocument[]>([]);
  const [draft, setDraft] = useState(defaultDraft);
  const [toast, setToast] = useState("");
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState([false, false, false]);
  const [runtime, setRuntime] = useState<RuntimeStatus>({
    orchestrator: "LangGraph",
    provider: "provider neutral",
    model: "",
    configured: false,
  });
  const [liveAnalysis, setLiveAnalysis] = useState<LiveAnalysis | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    fetch("/api/runtime")
      .then((response) => response.json())
      .then(async (value: RuntimeStatus) => {
        setRuntime(value);
        if (value.authentication !== "Google") return;

        const casesResponse = await fetch("/api/cases");
        if (!casesResponse.ok) return;
        const casesResult = await casesResponse.json();
        const restored: CreatedCaseView[] = (casesResult.cases ?? []).map(
          (item: { id: string; title: string; status: string }) => ({
            id: item.id,
            title: item.title,
            subtitle: "Persisted workspace case",
            status: formatCaseStatus(item.status),
          }),
        );
        setSavedCases(restored);

        const latest = restored[0];
        if (!latest) return;
        setActiveCaseId(latest.id);
        setCaseMode("active");
        const documentsResponse = await fetch(
          `/api/cases/${latest.id}/documents`,
        );
        if (documentsResponse.ok) {
          const documentsResult = await documentsResponse.json();
          setStoredDocuments(documentsResult.documents ?? []);
        }
      })
      .catch(() => undefined);

    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2400);
  };

  const runTeam = async () => {
    setRunning(true);

    try {
      const response = await fetch("/api/cases/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          activeCaseId
            ? { caseId: activeCaseId }
            : {
                brief:
                  "Eight containers of fiberglass chop roving contracted for Jeddah were forcibly discharged at Jazan. The insurer preliminarily denied emergency extraction and onward-transit costs. We need a defensible recovery and negotiation strategy without overstating the unverified thermal exposure claim.",
                objective:
                  "Preserve both insurance claims, maximize legitimate recovery, and prepare the next evidence-led response.",
                evidence: evidence.map((item, index) => ({
                  id: `evidence-${index + 1}`,
                  name: item.title,
                  text: `${item.meta}. ${item.note}`,
                })),
              },
        ),
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "Analysis failed");
      }

      setLiveAnalysis(result.analysis);
      setDraft(result.analysis.draftResponse);
      notify("LangGraph completed a fresh case analysis");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Analysis failed");
    } finally {
      setRunning(false);
    }
  };

  const copyDraft = async () => {
    try {
      await navigator.clipboard.writeText(draft);
      notify("Response copied to clipboard");
    } catch {
      notify("Draft is ready to copy");
    }
  };

  const openWorkspaceMenu = async () => {
    if (runtime.authentication !== "Google") {
      notify("Google sign-in is disabled for local development");
      return;
    }

    await authClient.signOut();
    router.push("/sign-in");
  };

  const openSavedCase = async (savedCase: CreatedCaseView) => {
    setCaseMode("active");
    setActiveCaseId(savedCase.id);
    setLiveAnalysis(null);
    setStoredDocuments([]);
    setView("Evidence");

    try {
      const response = await fetch(`/api/cases/${savedCase.id}/documents`);
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Evidence could not be loaded.");
      }
      setStoredDocuments(result.documents ?? []);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Evidence could not be loaded");
    }
  };

  const appendEvidence = async (files: File[]) => {
    if (!activeCaseId || files.length === 0) return;
    setCreatingCase(true);
    try {
      const formData = new FormData();
      files.forEach((file) => formData.append("files", file));
      const response = await fetch(`/api/cases/${activeCaseId}/documents`, {
        method: "POST",
        body: formData,
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "The files could not be stored.");
      }
      const added: StoredDocument[] = result.documents ?? [];
      setStoredDocuments((currentDocuments) => [
        ...currentDocuments,
        ...added,
      ]);
      notify(
        result.failures?.length
          ? `${added.length} stored · ${result.failures.length} need attention`
          : `${added.length} original file${added.length === 1 ? "" : "s"} stored safely`,
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "Upload failed");
    } finally {
      setCreatingCase(false);
    }
  };

  const createCase = async () => {
    if (caseTitle.trim().length < 3) {
      notify("Add a short case title");
      return;
    }
    if (caseBrief.trim().length < 30) {
      notify("Describe the case in at least 30 characters");
      return;
    }

    setCreatingCase(true);
    try {
      const caseResponse = await fetch("/api/cases", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: caseTitle.trim(),
          brief: caseBrief.trim(),
        }),
      });
      const caseResult = await caseResponse.json();
      if (!caseResponse.ok) {
        throw new Error(caseResult.error || "The case could not be created.");
      }

      let documents: StoredDocument[] = [];
      let failures: Array<{ name: string; error: string }> = [];
      if (uploadedFiles.length) {
        const formData = new FormData();
        uploadedFiles.forEach((file) => formData.append("files", file));
        const uploadResponse = await fetch(
          `/api/cases/${caseResult.case.id}/documents`,
          { method: "POST", body: formData },
        );
        const uploadResult = await uploadResponse.json();
        if (!uploadResponse.ok) {
          throw new Error(uploadResult.error || "The files could not be stored.");
        }
        documents = uploadResult.documents ?? [];
        failures = uploadResult.failures ?? [];
      }

      const ready = documents.filter(
        (document) => document.extractionStatus === "ready",
      ).length;
      const savedCase = {
        id: caseResult.case.id,
        title: caseResult.case.title,
        subtitle: `${documents.length} stored file${documents.length === 1 ? "" : "s"} · ${ready} text-ready`,
        status: failures.length ? "Evidence needs review" : "Evidence preserved",
      };
      setSavedCases((currentCases) => [
        savedCase,
        ...currentCases.filter((item) => item.id !== savedCase.id),
      ]);
      setActiveCaseId(caseResult.case.id);
      setStoredDocuments(documents);
      setLiveAnalysis(null);
      setNewCaseOpen(false);
      setUploadedFiles([]);
      setCaseTitle("");
      setCaseBrief("");
      setCaseMode("active");
      setView("Evidence");
      notify(
        failures.length
          ? `${documents.length} files stored · ${failures.length} need attention`
          : `${documents.length} original files stored safely`,
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "Case creation failed");
    } finally {
      setCreatingCase(false);
    }
  };

  const current =
    caseMode === "won"
      ? pastCase
      : activeCaseId
        ? savedCases.find((item) => item.id === activeCaseId) ?? activeCase
        : activeCase;

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-row">
          <div className="brand-mark" aria-hidden="true"><i /><i /><i /></div>
          <div><strong>Pactline</strong><span>NEGOTIATION OS</span></div>
        </div>

        <button className="new-case" onClick={() => setNewCaseOpen(true)}>
          <span>＋</span> New case
          <kbd>N</kbd>
        </button>

        <nav className="main-nav" aria-label="Main navigation">
          <p>WORKSPACE</p>
          <button onClick={() => notify("Inbox is clear")}><Glyph>⌁</Glyph> Inbox <em>2</em></button>
          <button className="selected"><Glyph>▣</Glyph> Cases</button>
          <button onClick={() => notify("Playbooks will learn from every outcome")}><Glyph>⌘</Glyph> Playbooks</button>
          <button onClick={() => notify("Knowledge base is connected to this case")}><Glyph>◇</Glyph> Knowledge</button>
          <button onClick={() => notify("Outcomes tracks recovered value")}><Glyph>↗</Glyph> Outcomes</button>
        </nav>

        <div className="case-list">
          <div className="case-list-title"><span>RECENT CASES</span><button aria-label="More case options">•••</button></div>
          {savedCases.slice(0, 4).map((savedCase, index) => <button key={savedCase.id} className={caseMode === "active" && activeCaseId === savedCase.id ? "case active" : "case"} onClick={() => openSavedCase(savedCase)}>
            <span className="case-icon alert">{index === 0 ? "NEW" : "SC"}</span>
            <span><strong>{savedCase.title}</strong><small>{savedCase.status}</small></span>
          </button>)}
          <button className={caseMode === "active" && !activeCaseId ? "case active" : "case"} onClick={() => { setCaseMode("active"); setActiveCaseId(null); setStoredDocuments([]); setLiveAnalysis(null); setView("Overview"); }}>
            <span className="case-icon alert">JZ</span>
            <span><strong>Jazan voyage termination</strong><small>Position challenged · 2h</small></span>
          </button>
          <button className={caseMode === "won" ? "case active" : "case"} onClick={() => { setCaseMode("won"); setLiveAnalysis(null); setView("Overview"); }}>
            <span className="case-icon win">RS</span>
            <span><strong>Red Sea surcharge</strong><small>$50,100 recovered · Won</small></span>
          </button>
        </div>

        <div className="sidebar-foot">
          <div className="workspace-avatar">AP</div>
          <div><strong>APS Workspace</strong><span>Decision support</span></div>
          <button aria-label={runtime.authentication === "Google" ? "Sign out" : "Workspace settings"} onClick={openWorkspaceMenu}>{runtime.authentication === "Google" ? "↪" : "⌄"}</button>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="case-heading">
            <div className={`status-orb ${caseMode === "won" ? "won" : ""}`}>{caseMode === "won" ? "✓" : "!"}</div>
            <div>
              <div className="eyebrow"><span>{caseMode === "won" ? "CLOSED CASE" : "ACTIVE CASE"}</span><b>•</b>{current.status}</div>
              <h1>{current.title}</h1>
              <p>{current.subtitle}</p>
            </div>
          </div>
          <div className="top-actions">
            <button
              className={`runtime-badge ${runtime.configured ? "ready" : ""}`}
              onClick={() =>
                notify(
                  `${runtime.orchestrator} · ${runtime.provider} · ${runtime.model}`,
                )
              }
            >
              <i />
              {runtime.orchestrator} · {runtime.provider}
            </button>
            <button className="icon-button" aria-label="Search" onClick={() => notify("Search opened")}>⌕</button>
            <button className="icon-button notification" aria-label="Notifications" onClick={() => notify("2 case updates")}>♢<i /></button>
            {caseMode === "active" && <button className="run-button" onClick={runTeam} disabled={running}><span>{running ? "◌" : "✦"}</span>{running ? "Analyzing…" : "Run case team"}</button>}
          </div>
        </header>

        <nav className="case-tabs" aria-label="Case sections">
          {(["Overview", "Evidence", "Strategy", "Drafts"] as View[]).map((item) => (
            <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>{item}{item === "Evidence" && <span>{activeCaseId ? storedDocuments.length : 4}</span>}{item === "Drafts" && <span>2</span>}</button>
          ))}
        </nav>

        {caseMode === "won" ? (
          <WonCase onOpen={() => { setCaseMode("active"); setView("Overview"); }} />
        ) : (
          <>
            {view === "Overview" && <Overview done={done} setDone={setDone} goTo={setView} notify={notify} analysis={liveAnalysis} runtime={runtime} />}
            {view === "Evidence" && <Evidence notify={notify} documents={activeCaseId ? storedDocuments : []} isStoredCase={Boolean(activeCaseId)} onAddEvidence={appendEvidence} uploading={creatingCase} />}
            {view === "Strategy" && <Strategy goTo={setView} />}
            {view === "Drafts" && <Drafts draft={draft} setDraft={setDraft} onCopy={copyDraft} notify={notify} />}
          </>
        )}
      </section>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        <button className="active"><Glyph>▣</Glyph><span>Cases</span></button>
        <button onClick={() => setView("Evidence")}><Glyph>◇</Glyph><span>Evidence</span></button>
        <button className="mobile-new" onClick={() => setNewCaseOpen(true)}>＋</button>
        <button onClick={() => setView("Strategy")}><Glyph>⌘</Glyph><span>Strategy</span></button>
        <button onClick={() => setView("Drafts")}><Glyph>✎</Glyph><span>Drafts</span></button>
      </nav>

      {newCaseOpen && (
        <div className="modal-backdrop" onMouseDown={() => setNewCaseOpen(false)}>
          <section className="new-case-modal" role="dialog" aria-modal="true" aria-labelledby="new-case-title" onMouseDown={(e) => e.stopPropagation()}>
            <button className="modal-close" aria-label="Close" onClick={() => setNewCaseOpen(false)}>×</button>
            <div className="modal-kicker">NEW CASE</div>
            <h2 id="new-case-title">What needs to be resolved?</h2>
            <p>Describe the situation in plain language. Your case team will structure the facts, identify missing evidence, and build the first strategy.</p>
            <label className="field-label" htmlFor="case-title">CASE TITLE</label>
            <input id="case-title" className="case-title-input" value={caseTitle} onChange={(event) => setCaseTitle(event.target.value)} placeholder="Example: Retrospective carrier surcharge" />
            <label className="field-label" htmlFor="case-brief">CASE BRIEF</label>
            <textarea id="case-brief" value={caseBrief} onChange={(event) => setCaseBrief(event.target.value)} placeholder="Example: Our carrier has added a retrospective surcharge to 14 containers already on the water…" />
            <label className="upload-zone">
              <input type="file" multiple accept=".pdf,.docx,.xlsx,.csv,.txt,.md,.json,.xml,.html,.eml,.png,.jpg,.jpeg" onChange={(e) => setUploadedFiles(Array.from(e.target.files || []))} />
              <span className="upload-icon">⇧</span>
              <strong>{uploadedFiles.length ? `${uploadedFiles.length} file${uploadedFiles.length > 1 ? "s" : ""} ready` : "Add contracts, emails, invoices or shipment files"}</strong>
              <small>{uploadedFiles.length ? uploadedFiles.map((file) => file.name).join(" · ") : "PDF, DOCX, XLSX, CSV, text and images · up to 25 MB each"}</small>
            </label>
            <div className="privacy-note"><span>⌾</span><p><strong>Persisted before analysis.</strong> Originals are hashed and stored on the attached volume; extracted text and processing status are recorded in PostgreSQL.</p></div>
            <button className="create-case" onClick={createCase} disabled={creatingCase}>{creatingCase ? "Storing and processing…" : "Create case"} <span>{creatingCase ? "◌" : "→"}</span></button>
          </section>
        </div>
      )}

      <div className={`toast ${toast ? "show" : ""}`} role="status">✓ {toast}</div>
    </main>
  );
}

function Overview({ done, setDone, goTo, notify, analysis, runtime }: { done: boolean[]; setDone: (v: boolean[]) => void; goTo: (v: View) => void; notify: (m: string) => void; analysis: LiveAnalysis | null; runtime: RuntimeStatus }) {
  const actions = [
    ["Today", "Commission independent thermal evidence", "Support 60–65°C exposure and binder degradation risk"],
    ["Today", "Send reservation-of-rights follow-up", "Keep both files active while evidence is assembled"],
    ["Next", "Build a segregated cost schedule", "Separate preservation costs from delay, storage and demurrage"],
  ];
  return (
    <div className="overview-grid content-view">
      <div className="overview-main">
        <section className="hero-card">
          <div className="hero-copy">
            <div className="section-kicker"><span>✦</span> CASE TEAM RECOMMENDATION</div>
            <h2>{analysis ? analysis.recommendedPosition : <>Reframe the claim around <em>preventing physical loss.</em></>}</h2>
            <p>{analysis?.executiveSummary ?? "Do not lead with extra forwarding costs. Establish that forced discharge exposed stable cargo to a new, external heat peril—and that removal was a policy-mandated preservation measure."}</p>
            <div className="confidence"><span>CONFIDENCE</span><div><i style={{ width: `${Math.round((analysis?.confidence ?? .82) * 100)}%` }} /></div><strong>{Math.round((analysis?.confidence ?? .82) * 100)}%</strong><small>{(analysis?.confidence ?? .82) >= .75 ? "High" : "Review"}</small></div>
            <div className="hero-buttons">
              <button className="primary" onClick={() => goTo("Strategy")}>View full strategy <span>→</span></button>
              <button onClick={() => goTo("Drafts")}><span>✎</span> Draft response</button>
            </div>
          </div>
          <div className="route-visual" aria-label="Shipment route from Shanghai to Jeddah, interrupted at Jazan">
            <div className="route-label origin"><span />Shanghai<small>ORIGIN</small></div>
            <div className="route-line"><i /><b /><em /></div>
            <div className="route-label disruption"><span>!</span>Jazan<small>FORCED DISCHARGE</small></div>
            <div className="route-line muted"><i /></div>
            <div className="route-label destination"><span />Jeddah<small>CONTRACTED PORT</small></div>
            <div className="cargo-chip"><span>▦</span><div><strong>8 × 20′ GP</strong><small>166.4 MT chop roving</small></div></div>
          </div>
        </section>

        <section className="metric-row">
          <div><span>VALUE AT RISK</span><strong>$141.0k</strong><small>Across 2 policies</small></div>
          <div><span>CARGO EXPOSURE</span><strong>60–65°C</strong><small>Estimated container temp.</small></div>
          <div><span>TIME SINCE DENIAL</span><strong>3 days</strong><small>Response window open</small></div>
          <div><span>KEY LEVER</span><strong>§ IV(2)</strong><small>Duty of the Insured</small></div>
        </section>

        <section className="action-section">
          <div className="section-heading"><div><span>PRIORITY ACTIONS</span><h3>What moves the position now</h3></div><button onClick={() => notify("Action owner menu opened")}>Assign owner <span>＋</span></button></div>
          <div className="action-list">
            {actions.map((action, index) => (
              <button className={done[index] ? "action done" : "action"} key={action[1]} onClick={() => { const next = [...done]; next[index] = !next[index]; setDone(next); }}>
                <span className="check">{done[index] ? "✓" : index + 1}</span>
                <span className={`due ${index === 2 ? "next" : ""}`}>{action[0]}</span>
                <span className="action-copy"><strong>{action[1]}</strong><small>{action[2]}</small></span>
                <span className="arrow">→</span>
              </button>
            ))}
          </div>
        </section>
      </div>

      <aside className="insight-rail">
        <section className="team-card">
          <div className="rail-heading"><div><span className="live-dot" />CASE TEAM</div><small>{runtime.orchestrator} · {runtime.provider}</small></div>
          <div className="agent-list">
            <div><span className="agent-avatar lead">CL</span><p><strong>Case lead</strong><small>Synthesized position</small></p><i>✓</i></div>
            <div><span className="agent-avatar contract">CA</span><p><strong>Contract analyst</strong><small>Mapped 3 policy clauses</small></p><i>✓</i></div>
            <div><span className="agent-avatar risk">RM</span><p><strong>Risk modeler</strong><small>Quantified exposure</small></p><i>✓</i></div>
            <div><span className="agent-avatar writer">NW</span><p><strong>Negotiation writer</strong><small>Prepared 2 responses</small></p><i>✓</i></div>
          </div>
          <button onClick={() => notify("Analysis trace opened")}>View analysis trace <span>↗</span></button>
        </section>

        <section className="argument-card">
          <div className="rail-heading"><div>ARGUMENT MAP</div><button onClick={() => goTo("Strategy")}>Open</button></div>
          <div className="argument-flow">
            <div className="their-position"><span>THEIR POSITION</span><p>Security hazard ≠ sea peril; extra costs excluded</p></div>
            <div className="flow-arrow">↓</div>
            <div className="our-pivot"><span>OUR PIVOT</span><p>Expense was necessary to avert insured physical loss</p></div>
            <div className="flow-arrow">↓</div>
            <div className="proof-needed"><span>PROOF NEEDED</span><p>Thermal thresholds + segregated mitigation costs</p></div>
          </div>
        </section>

        <section className="watch-card">
          <span className="watch-icon">!</span>
          <div><strong>Do not overstate certainty</strong><p>60–65°C is currently an estimate. Obtain a technical declaration before repeating it as fact.</p></div>
        </section>
      </aside>
    </div>
  );
}

function Evidence({
  notify,
  documents,
  isStoredCase,
  onAddEvidence,
  uploading,
}: {
  notify: (m: string) => void;
  documents: StoredDocument[];
  isStoredCase: boolean;
  onAddEvidence: (files: File[]) => void;
  uploading: boolean;
}) {
  const ready = documents.filter(
    (document) => document.extractionStatus === "ready",
  ).length;
  const needsAttention = documents.length - ready;
  const storedBytes = documents.reduce(
    (total, document) => total + document.byteSize,
    0,
  );

  return (
    <div className="evidence-view content-view single-column">
      <div className="page-intro"><div><span className="section-kicker"><b>◇</b> EVIDENCE ROOM</span><h2>Every claim tied to its source.</h2><p>{isStoredCase ? "Original files remain downloadable while extracted text is available to the case team." : "Case facts were extracted, cross-checked, and separated from assumptions."}</p></div>{isStoredCase ? <label className={`evidence-upload ${uploading ? "disabled" : ""}`}><input type="file" multiple disabled={uploading} accept=".pdf,.docx,.xlsx,.csv,.txt,.md,.json,.xml,.html,.eml,.png,.jpg,.jpeg" onChange={(event) => { onAddEvidence(Array.from(event.target.files ?? [])); event.target.value = ""; }} />{uploading ? "Processing…" : "＋ Add evidence"}</label> : <button onClick={() => notify("Create a persisted case to add your own evidence")}>＋ Add evidence</button>}</div>
      {isStoredCase && documents.length === 0 && <section className="stored-empty"><span>⇧</span><h3>No files in this case yet.</h3><p>Add the contracts, correspondence, invoices, or shipment records the case team should use.</p></section>}
      {documents.length > 0 && <section className="stored-documents" aria-labelledby="stored-documents-title">
        <div className="stored-documents-heading"><div><span>PERSISTED EVIDENCE</span><h3 id="stored-documents-title">Originals secured. Processing visible.</h3></div><small>{documents.length} FILE{documents.length === 1 ? "" : "S"}</small></div>
        <div className="stored-document-list">
          {documents.map((document) => <article key={document.id}>
            <span className={`stored-status ${document.extractionStatus}`}>{document.extractionStatus === "ready" ? "✓" : document.extractionStatus === "failed" ? "!" : "•"}</span>
            <div><strong>{document.originalName}</strong><small>{formatBytes(document.byteSize)} · {document.extractionStatus === "ready" ? `${document.extractedCharacters.toLocaleString()} characters extracted` : document.extractionError ?? "Original stored"}</small></div>
            <code>{document.sha256.slice(0, 10)}</code>
            <a href={document.downloadUrl}>Download ↓</a>
          </article>)}
        </div>
      </section>}
      {isStoredCase ? <div className="evidence-summary">
        <div><span>{documents.length}</span><p><strong>Originals persisted</strong><small>{formatBytes(storedBytes)} on durable storage</small></p></div>
        <div><span>{ready}</span><p><strong>Text-ready files</strong><small>Available to the agent workflow</small></p></div>
        <div><span>{needsAttention}</span><p><strong>Needs attention</strong><small>Unsupported, empty, or failed extraction</small></p></div>
      </div> : <>
      <div className="evidence-summary">
        <div><span>36</span><p><strong>Verified facts</strong><small>Across 4 evidence groups</small></p></div>
        <div><span>3</span><p><strong>Open questions</strong><small>Blocking confidence</small></p></div>
        <div><span>1</span><p><strong>Unsupported claim</strong><small>Needs thermal proof</small></p></div>
      </div>
      <div className="evidence-cards">
        {evidence.map((item) => <button key={item.title} onClick={() => notify(`${item.title}: ${item.facts} extracted facts`)}>
          <span className={`doc-thumb ${item.color}`}><i /><i /><i /></span>
          <span className="evidence-copy"><small>{item.type}</small><strong>{item.title}</strong><em>{item.meta}</em><p>{item.note}</p></span>
          <span className="fact-count"><strong>{item.facts}</strong><small>FACTS</small></span>
          <span className="card-arrow">→</span>
        </button>)}
      </div>
      <section className="fact-table">
        <div className="table-title"><div><span>CRITICAL FACTS</span><h3>What the strategy relies on</h3></div><button onClick={() => notify("Fact filters opened")}>Filter ▾</button></div>
        <div className="fact-row head"><span>FACT</span><span>SOURCE</span><span>STATUS</span></div>
        <div className="fact-row"><span>Contracted discharge port was Jeddah</span><span>Bills of lading</span><b>Verified</b></div>
        <div className="fact-row"><span>8 containers discharged at Jazan on 16 + 25 June</span><span>Carrier correspondence</span><b>Verified</b></div>
        <div className="fact-row"><span>Cargo may face irreversible damage at 60–65°C</span><span>Draft response only</span><b className="needs-proof">Needs proof</b></div>
        <div className="fact-row"><span>Policy requires reasonable loss-prevention measures</span><span>CIC policy § IV(2)</span><b>Verified</b></div>
      </section>
      </>}
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatCaseStatus(status: string) {
  const labels: Record<string, string> = {
    analyzing: "Case team analyzing",
    evidence: "Evidence preserved",
    strategy: "Strategy ready",
    closed: "Closed",
  };
  return labels[status] ?? "Workspace case";
}

function Strategy({ goTo }: { goTo: (v: View) => void }) {
  return (
    <div className="strategy-view content-view single-column">
      <div className="page-intro"><div><span className="section-kicker"><b>⌘</b> POSITION DESIGN</span><h2>Three routes. One disciplined lead.</h2><p>Each path is scored against policy language, available evidence, counterparty stance, and recoverable value.</p></div><button className="solid" onClick={() => goTo("Drafts")}>Draft from strategy →</button></div>
      <div className="strategy-routes">
        {strategyRoutes.map((route) => <article className={`strategy-route ${route.tone}`} key={route.title}>
          <div className="route-top"><span>{route.label}</span><div className="route-score"><strong>{route.score}</strong><small>/100</small></div></div>
          <h3>{route.title}</h3><p>{route.description}</p>
          <div className="score-bar"><i style={{ width: `${route.score}%` }} /></div>
          <div className="route-tags">{route.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
        </article>)}
      </div>
      <div className="strategy-lower">
        <section className="concession-ladder"><div className="table-title"><div><span>CONCESSION LADDER</span><h3>Know the walk-down before replying</h3></div></div>
          <div><span className="ladder-level l1">1</span><p><strong>Full preservation cost recovery</strong><small>Emergency extraction + handling + onward transit</small></p><b>OPEN</b></div>
          <div><span className="ladder-level l2">2</span><p><strong>Costs directly tied to physical preservation</strong><small>Exclude ordinary storage and documentation fees</small></p><b>FALLBACK</b></div>
          <div><span className="ladder-level l3">3</span><p><strong>Commercial cost share</strong><small>Without prejudice; preserve carrier recourse</small></p><b>FLOOR</b></div>
        </section>
        <section className="counterparty-card"><span>COUNTERPARTY READ</span><h3>Technically precise, procedurally open.</h3><p>The adjuster rejected one coverage theory but invited supporting documentation and kept both files active. Escalate through evidence, not rhetoric.</p><div><span>Likely objection</span><strong>“No insured physical damage occurred.”</strong></div><div><span>Prepared answer</span><strong>Mitigation expenses exist precisely because damage was prevented.</strong></div></section>
      </div>
    </div>
  );
}

function Drafts({ draft, setDraft, onCopy, notify }: { draft: string; setDraft: (v: string) => void; onCopy: () => void; notify: (m: string) => void }) {
  return (
    <div className="draft-view content-view">
      <aside className="draft-list"><div className="draft-list-head"><span>2 DRAFTS</span><button onClick={() => notify("New draft started")}>＋</button></div><button className="active"><span className="draft-status">READY</span><strong>Coverage re-evaluation</strong><small>Formal · Evidence-led</small></button><button><span className="draft-status muted">OPTION</span><strong>Without-prejudice settlement</strong><small>Commercial · Concise</small></button></aside>
      <section className="editor-card">
        <header><div><span>FORMAL RESPONSE</span><h2>Coverage re-evaluation request</h2></div><div><button onClick={onCopy}>Copy</button><button className="send" onClick={() => notify("Export options opened")}>Export ↗</button></div></header>
        <div className="draft-controls"><button>Formal ▾</button><button>Firm but collaborative ▾</button><span>Based on 12 cited facts</span></div>
        <textarea aria-label="Draft response" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <footer><div><span className="quality-dot" />All factual claims checked</div><span>{draft.split(/\s+/).length} words</span></footer>
      </section>
      <aside className="draft-guidance"><div className="rail-heading"><div>WRITER NOTES</div></div><div className="guidance-item good"><span>✓</span><p><strong>Strong framing</strong><small>Clearly separates mitigation expense from delay loss.</small></p></div><div className="guidance-item warning"><span>!</span><p><strong>Evidence gap</strong><small>Cite technical support before treating 60–65°C as established.</small></p></div><div className="guidance-item neutral"><span>→</span><p><strong>Suggested close</strong><small>Ask for agreement in principle before submitting the final cost schedule.</small></p></div><button onClick={() => notify("Draft refreshed with writer notes")}>✦ Apply suggestions</button></aside>
    </div>
  );
}

function WonCase({ onOpen }: { onOpen: () => void }) {
  return (
    <div className="won-view content-view single-column">
      <section className="win-hero"><span className="win-badge">✓ NEGOTIATION WON</span><h2>$50,100 <em>recovered.</em></h2><p>A retrospective emergency surcharge was successfully challenged by anchoring the response to the agreed freight terms, the shipment timeline, and the correct insurance pathway.</p><div className="win-metrics"><div><strong>14 × 20′</strong><span>containers protected</span></div><div><strong>100%</strong><span>target recovery</span></div><div><strong>Closed</strong><span>August 2026</span></div></div></section>
      <div className="outcome-grid"><section><span className="section-kicker"><b>↗</b> WHAT WORKED</span><h3>The outcome became a reusable playbook.</h3><div className="learning"><span>01</span><p><strong>Separate contractual exposure</strong><small>The fixed-freight agreement was tested before engaging with the carrier’s broad advisory.</small></p></div><div className="learning"><span>02</span><p><strong>Route the loss correctly</strong><small>Cargo interruption costs were prepared as an insurance recovery, not conceded as freight.</small></p></div><div className="learning"><span>03</span><p><strong>Pre-empt rejection grounds</strong><small>The claim package addressed predictable insurer objections before they were raised.</small></p></div></section><section className="playbook-card"><div><span>NEW PLAYBOOK</span><b>LEARNED FROM THIS CASE</b></div><h3>Retrospective carrier surcharge defense</h3><p>Ready to reuse whenever a carrier applies a mid-voyage emergency or operational cost charge.</p><ul><li>Contract classification check</li><li>Effective-date and “cargo afloat” test</li><li>Carrier vs. insurer recovery map</li><li>Reservation-of-rights response</li></ul><button onClick={onOpen}>Use on active case <span>→</span></button></section></div>
    </div>
  );
}
