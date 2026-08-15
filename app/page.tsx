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

type SpecialistOutput = {
  role: string;
  findings: { claim: string; status: string; sourceIds: string[]; confidence: number }[];
  risks: string[];
  openQuestions: string[];
  recommendations: string[];
  confidence: number;
};

type CaseAnalysis = {
  executiveSummary: string;
  recommendedPosition: string;
  confidence: number;
  alternatives: { name: string; whenToUse: string; tradeoffs: string }[];
  priorityActions: { action: string; owner: string; timing: string; reason: string }[];
  evidenceGaps: string[];
  draftResponse: string;
  specialistOutputs: SpecialistOutput[];
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

const specialistRoles = ["contract", "operations", "risk", "negotiation"] as const;

// What's actually happening on "Run case team," made visible instead of a
// black-box spinner. "streaming" is a live run watched in this tab (specialist
// completions arrive over SSE as they happen). "recovering" is what shows if
// you reload mid-run: the original stream is gone, but the run kept going on
// the server, so this polls until it lands instead of just looking empty.
type RunState =
  | { kind: "idle" }
  | { kind: "streaming"; stage: "specialists" | "synthesizing"; specialists: Record<string, { confidence: number }> }
  | { kind: "recovering" };

function Glyph({ children }: { children: React.ReactNode }) {
  return <span className="glyph" aria-hidden="true">{children}</span>;
}

function initials(title: string) {
  const letters = title
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? "")
    .join("");
  return letters || "?";
}

function roleLabel(role: string) {
  const labels: Record<string, string> = {
    contract: "Contract analyst",
    operations: "Operations analyst",
    risk: "Risk modeler",
    negotiation: "Negotiation strategist",
  };
  return labels[role] ?? role.charAt(0).toUpperCase() + role.slice(1);
}

function roleAvatarClass(role: string) {
  if (role === "negotiation") return "writer";
  if (["contract", "risk"].includes(role)) return role;
  return "contract";
}

function runButtonLabel(runState: RunState) {
  if (runState.kind === "recovering") return "Reconnecting…";
  if (runState.kind === "streaming") {
    return runState.stage === "synthesizing" ? "Synthesizing…" : "Analyzing…";
  }
  return "Run case team";
}

/** Parses a fetch Response body shaped as Server-Sent Events. */
async function consumeEventStream(
  response: Response,
  onEvent: (event: string, data: Record<string, unknown>) => void,
) {
  if (!response.body) throw new Error("The server did not return a stream.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const rawEvent = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      boundary = buffer.indexOf("\n\n");

      let eventName = "message";
      const dataLines: string[] = [];
      for (const line of rawEvent.split("\n")) {
        if (line.startsWith("event:")) eventName = line.slice(6).trim();
        else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
      }
      if (dataLines.length === 0) continue;
      try {
        onEvent(eventName, JSON.parse(dataLines.join("\n")));
      } catch {
        // Ignore a malformed frame rather than aborting the whole stream.
      }
    }
  }
}

export default function Home() {
  const router = useRouter();
  const [view, setView] = useState<View>("Overview");
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [caseTitle, setCaseTitle] = useState("");
  const [caseBrief, setCaseBrief] = useState("");
  const [creatingCase, setCreatingCase] = useState(false);
  const [savedCases, setSavedCases] = useState<CreatedCaseView[]>([]);
  const [activeCaseId, setActiveCaseId] = useState<string | null>(null);
  const [storedDocuments, setStoredDocuments] = useState<StoredDocument[]>([]);
  const [draft, setDraft] = useState("");
  const [toast, setToast] = useState("");
  const [runState, setRunState] = useState<RunState>({ kind: "idle" });
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [runtime, setRuntime] = useState<RuntimeStatus>({
    orchestrator: "LangGraph",
    provider: "provider neutral",
    model: "",
    configured: false,
  });
  const [liveAnalysis, setLiveAnalysis] = useState<CaseAnalysis | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const notify = (message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3600);
  };

  const stopPolling = () => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  };

  const pollCase = (caseId: string) => {
    stopPolling();
    setRunState({ kind: "recovering" });
    let attempts = 0;
    pollTimer.current = setInterval(async () => {
      attempts += 1;
      try {
        const response = await fetch(`/api/cases/${caseId}`);
        if (response.ok) {
          const result = await response.json();
          if (result.runStatus === "completed") {
            stopPolling();
            setRunState({ kind: "idle" });
            if (result.analysis) {
              setLiveAnalysis(result.analysis);
              setDraft(result.analysis.draftResponse ?? "");
              notify("The case analysis finished while you were away");
            }
            return;
          }
          if (result.runStatus === "failed") {
            stopPolling();
            setRunState({ kind: "idle" });
            notify("The last analysis attempt failed. You can run the case team again.");
            return;
          }
        }
      } catch {
        // A transient network hiccup shouldn't stop polling; just retry.
      }
      if (attempts >= 90) {
        stopPolling();
        setRunState({ kind: "idle" });
        notify("Still no result after several minutes — you can try running the case team again.");
      }
    }, 4000);
  };

  const loadCase = async (caseId: string) => {
    stopPolling();
    setRunState({ kind: "idle" });
    setLiveAnalysis(null);
    setStoredDocuments([]);
    setDraft("");
    try {
      const [documentsResponse, caseResponse] = await Promise.all([
        fetch(`/api/cases/${caseId}/documents`),
        fetch(`/api/cases/${caseId}`),
      ]);
      if (documentsResponse.ok) {
        const documentsResult = await documentsResponse.json();
        setStoredDocuments(documentsResult.documents ?? []);
      }
      if (caseResponse.ok) {
        const caseResult = await caseResponse.json();
        if (caseResult.analysis) {
          setLiveAnalysis(caseResult.analysis);
          setDraft(caseResult.analysis.draftResponse ?? "");
        }
        if (caseResult.runStatus === "running") {
          pollCase(caseId);
        }
      }
    } catch (error) {
      notify(error instanceof Error ? error.message : "The case could not be loaded");
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch("/api/runtime");
        const value: RuntimeStatus = await response.json();
        setRuntime(value);
        if (value.authentication !== "email") return;

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
        if (latest) {
          setActiveCaseId(latest.id);
          await loadCase(latest.id);
        }
      } catch {
        // Runtime status is best-effort; keep defaults on failure.
      } finally {
        setLoadingInitial(false);
      }
    })();

    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
      stopPolling();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runTeam = async () => {
    if (!activeCaseId) return;
    stopPolling();
    setRunState({ kind: "streaming", stage: "specialists", specialists: {} });

    try {
      const response = await fetch("/api/cases/analyze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ caseId: activeCaseId }),
      });

      if (!response.ok) {
        const result = await response.json().catch(() => ({}) as { error?: string });
        throw new Error(result.error || "Analysis failed");
      }

      let streamError = "";

      await consumeEventStream(response, (event, data) => {
        if (event === "specialist" && typeof data.role === "string") {
          const role = data.role;
          const confidence = typeof data.confidence === "number" ? data.confidence : 0;
          setRunState((prev) =>
            prev.kind === "streaming"
              ? { kind: "streaming", stage: "specialists", specialists: { ...prev.specialists, [role]: { confidence } } }
              : prev,
          );
        } else if (event === "synthesizing") {
          setRunState((prev) =>
            prev.kind === "streaming"
              ? { kind: "streaming", stage: "synthesizing", specialists: prev.specialists }
              : prev,
          );
        } else if (event === "complete" && data.analysis) {
          const analysis = data.analysis as CaseAnalysis;
          setLiveAnalysis(analysis);
          setDraft(analysis.draftResponse ?? "");
          setSavedCases((current) =>
            current.map((item) =>
              item.id === activeCaseId ? { ...item, status: formatCaseStatus("strategy") } : item,
            ),
          );
        } else if (event === "error" && typeof data.error === "string") {
          streamError = data.error;
        }
      });

      if (streamError) throw new Error(streamError);
      notify("LangGraph completed a fresh case analysis");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Analysis failed");
    } finally {
      setRunState({ kind: "idle" });
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
    if (runtime.authentication !== "email") {
      notify("Sign-in is disabled for local development");
      return;
    }

    await authClient.signOut();
    router.push("/sign-in");
  };

  const openSavedCase = async (savedCase: CreatedCaseView) => {
    setActiveCaseId(savedCase.id);
    setView("Overview");
    await loadCase(savedCase.id);
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
      const savedCase: CreatedCaseView = {
        id: caseResult.case.id,
        title: caseResult.case.title,
        subtitle: documents.length
          ? `${documents.length} stored file${documents.length === 1 ? "" : "s"} · ${ready} text-ready`
          : "No evidence uploaded yet",
        status: failures.length ? "Evidence needs review" : "Evidence preserved",
      };
      setSavedCases((currentCases) => [
        savedCase,
        ...currentCases.filter((item) => item.id !== savedCase.id),
      ]);
      setActiveCaseId(caseResult.case.id);
      setStoredDocuments(documents);
      setLiveAnalysis(null);
      setDraft("");
      setNewCaseOpen(false);
      setUploadedFiles([]);
      setCaseTitle("");
      setCaseBrief("");
      setView("Overview");
      notify(
        failures.length
          ? `${documents.length} files stored · ${failures.length} need attention`
          : documents.length
            ? `${documents.length} original files stored safely`
            : "Case created",
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : "Case creation failed");
    } finally {
      setCreatingCase(false);
    }
  };

  const current = activeCaseId
    ? savedCases.find((item) => item.id === activeCaseId)
    : undefined;
  const hasWorkspace = Boolean(activeCaseId && current);
  const isClosed = current?.status.toLowerCase().includes("closed") ?? false;
  const analyzing = runState.kind !== "idle";

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
          <button className="selected"><Glyph>▣</Glyph> Cases</button>
          <button className="soon" title="Not built yet" onClick={() => notify("Inbox isn't built yet — cases are the only workspace object right now.")}><Glyph>⌁</Glyph> Inbox<span className="soon-tag">Soon</span></button>
          <button className="soon" title="Not built yet" onClick={() => notify("Playbooks isn't built yet — the plan is to turn closed cases into reusable, checkable patterns.")}><Glyph>⌘</Glyph> Playbooks<span className="soon-tag">Soon</span></button>
          <button className="soon" title="Not built yet" onClick={() => notify("Knowledge isn't built yet — the plan is a shared clause and evidence library across your cases.")}><Glyph>◇</Glyph> Knowledge<span className="soon-tag">Soon</span></button>
          <button className="soon" title="Not built yet" onClick={() => notify("Outcomes isn't built yet — the plan is to track recovered value and cycle time across closed cases.")}><Glyph>↗</Glyph> Outcomes<span className="soon-tag">Soon</span></button>
        </nav>

        <div className="case-list">
          <div className="case-list-title">
            <span>RECENT CASES</span>
          </div>
          {savedCases.length === 0 ? (
            <p style={{ padding: "6px 9px", fontSize: 11, lineHeight: 1.5, color: "#7fa094" }}>
              {loadingInitial ? "Loading…" : "No cases yet. Create your first one."}
            </p>
          ) : (
            savedCases.slice(0, 8).map((savedCase) => (
              <button
                key={savedCase.id}
                className={activeCaseId === savedCase.id ? "case active" : "case"}
                onClick={() => openSavedCase(savedCase)}
              >
                <span className={`case-icon ${savedCase.status.toLowerCase().includes("closed") ? "win" : "alert"}`}>
                  {initials(savedCase.title)}
                </span>
                <span><strong>{savedCase.title}</strong><small>{savedCase.status}</small></span>
              </button>
            ))
          )}
        </div>

        <div className="sidebar-foot">
          <div className="workspace-avatar">{initials(runtime.model || "PL")}</div>
          <div><strong>Your workspace</strong><span>Decision support</span></div>
          <button aria-label={runtime.authentication === "email" ? "Sign out" : "Workspace settings"} onClick={openWorkspaceMenu}>{runtime.authentication === "email" ? "↪" : "⌄"}</button>
        </div>
      </aside>

      <section className="workspace">
        {hasWorkspace && current ? (
          <>
            <header className="topbar">
              <div className="case-heading">
                <div className={`status-orb ${isClosed ? "won" : ""}`}>{isClosed ? "✓" : "!"}</div>
                <div>
                  <div className="eyebrow"><span>{isClosed ? "CLOSED CASE" : "ACTIVE CASE"}</span><b>•</b>{current.status}</div>
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
                <button className="icon-button" aria-label="Search" onClick={() => notify("Search isn't built yet.")}>⌕</button>
                <button className="icon-button notification" aria-label="Notifications" onClick={() => notify("You're all caught up")}>♢</button>
                <button className="run-button" onClick={runTeam} disabled={analyzing}><span>{analyzing ? "◌" : "✦"}</span>{runButtonLabel(runState)}</button>
              </div>
            </header>

            <nav className="case-tabs" aria-label="Case sections">
              {(["Overview", "Evidence", "Strategy", "Drafts"] as View[]).map((item) => (
                <button key={item} className={view === item ? "active" : ""} onClick={() => setView(item)}>
                  {item}
                  {item === "Evidence" && storedDocuments.length > 0 && <span>{storedDocuments.length}</span>}
                  {item === "Drafts" && liveAnalysis && <span>1</span>}
                </button>
              ))}
            </nav>

            {view === "Overview" && (
              <Overview
                key={activeCaseId}
                analysis={liveAnalysis}
                documents={storedDocuments}
                runState={runState}
                onRun={runTeam}
                goTo={setView}
              />
            )}
            {view === "Evidence" && (
              <Evidence
                key={activeCaseId}
                documents={storedDocuments}
                onAddEvidence={appendEvidence}
                uploading={creatingCase}
              />
            )}
            {view === "Strategy" && (
              <Strategy
                key={activeCaseId}
                analysis={liveAnalysis}
                runState={runState}
                onRun={runTeam}
                goTo={setView}
              />
            )}
            {view === "Drafts" && (
              <Drafts
                key={activeCaseId}
                analysis={liveAnalysis}
                draft={draft}
                setDraft={setDraft}
                onCopy={copyDraft}
                notify={notify}
                runState={runState}
                onRun={runTeam}
              />
            )}
          </>
        ) : (
          <EmptyWorkspace onCreate={() => setNewCaseOpen(true)} loading={loadingInitial} />
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

function EmptyWorkspace({ onCreate, loading }: { onCreate: () => void; loading: boolean }) {
  return (
    <div className="workspace-empty">
      <span className="empty-icon" aria-hidden="true">＋</span>
      <h2>{loading ? "Loading your workspace…" : "Your workspace is empty."}</h2>
      <p>
        {loading
          ? "Checking for saved cases."
          : "Create a case and add the contracts, correspondence, or shipment records involved. The case team builds its strategy only from what you give it."}
      </p>
      {!loading && <button onClick={onCreate}>＋ New case</button>}
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
  actionLabel,
  onAction,
  actionDisabled,
}: {
  icon: string;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
  actionDisabled?: boolean;
}) {
  return (
    <section className="stored-empty">
      <span>{icon}</span>
      <h3>{title}</h3>
      <p>{body}</p>
      {actionLabel && onAction && (
        <button
          className={`evidence-upload ${actionDisabled ? "disabled" : ""}`}
          style={{ marginTop: 16 }}
          onClick={onAction}
          disabled={actionDisabled}
        >
          {actionLabel}
        </button>
      )}
    </section>
  );
}

/** The live "what's happening" view: real per-specialist progress while
 * watching (kind: "streaming"), or a recovery notice after a refresh
 * (kind: "recovering"). Never shown for kind: "idle". */
function RunProgress({ runState, compact }: { runState: RunState; compact?: boolean }) {
  if (runState.kind === "idle") return null;

  if (runState.kind === "recovering") {
    return (
      <div className={`run-progress ${compact ? "compact" : ""}`}>
        <span className="run-progress-spinner" aria-hidden="true">◌</span>
        <div className="run-progress-body">
          <strong>Reconnecting to a run already in progress…</strong>
          <small>You reloaded mid-analysis — the case team kept working on the server. Checking back every few seconds.</small>
        </div>
      </div>
    );
  }

  return (
    <div className={`run-progress ${compact ? "compact" : ""}`}>
      <span className="run-progress-spinner" aria-hidden="true">◌</span>
      <div className="run-progress-body">
        <strong>{runState.stage === "synthesizing" ? "Case lead is combining the specialists' work…" : "Four specialists are reading your evidence…"}</strong>
        <small>Each one works independently, then the case lead resolves any disagreement into one recommendation.</small>
        <ul className="run-progress-steps">
          {specialistRoles.map((role) => {
            const done = Boolean(runState.specialists[role]);
            return (
              <li key={role} className={done ? "done" : runState.stage === "specialists" ? "active" : "pending"}>
                <span>{done ? "✓" : "○"}</span>{roleLabel(role)}
              </li>
            );
          })}
          <li className={runState.stage === "synthesizing" ? "active" : "pending"}>
            <span>○</span>Case lead synthesis
          </li>
        </ul>
      </div>
    </div>
  );
}

function Overview({
  analysis,
  documents,
  runState,
  onRun,
  goTo,
}: {
  analysis: CaseAnalysis | null;
  documents: StoredDocument[];
  runState: RunState;
  onRun: () => void;
  goTo: (v: View) => void;
}) {
  const [done, setDone] = useState<Set<number>>(new Set());
  const analyzing = runState.kind !== "idle";

  if (!analysis) {
    return (
      <div className="content-view single-column">
        {analyzing ? (
          <RunProgress runState={runState} />
        ) : (
          <EmptyState
            icon="✦"
            title="No strategy yet."
            body="Run the case team once your evidence is in place. The case lead synthesizes a recommended position, priority actions, and a draft response from what the specialists find in your documents."
            actionLabel="Run case team"
            onAction={onRun}
            actionDisabled={documents.length === 0}
          />
        )}
      </div>
    );
  }

  const toggle = (index: number) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });

  const readyDocs = documents.filter((document) => document.extractionStatus === "ready").length;
  const risks = analysis.specialistOutputs.flatMap((specialist) => specialist.risks);
  const team = [
    { role: "lead", label: "Case lead", note: "Combined the specialists' work into one recommendation", confidence: analysis.confidence },
    ...analysis.specialistOutputs.map((specialist) => ({
      role: specialist.role,
      label: roleLabel(specialist.role),
      note: `${specialist.findings.length} finding${specialist.findings.length === 1 ? "" : "s"} · ${specialist.risks.length} risk${specialist.risks.length === 1 ? "" : "s"}`,
      confidence: specialist.confidence,
    })),
  ];
  const positionIsLong = analysis.recommendedPosition.length > 90;

  return (
    <div className="overview-grid content-view">
      <div className="overview-main">
        {analyzing && <RunProgress runState={runState} compact />}
        <section className="hero-card no-visual">
          <div className="hero-copy">
            <div className="section-kicker"><span>✦</span> CASE TEAM RECOMMENDATION</div>
            <h2 className={positionIsLong ? "long" : ""}>{analysis.recommendedPosition}</h2>
            <p>{analysis.executiveSummary}</p>
            <div className="confidence"><span>CONFIDENCE</span><div><i style={{ width: `${Math.round(analysis.confidence * 100)}%` }} /></div><strong>{Math.round(analysis.confidence * 100)}%</strong><small>{analysis.confidence >= .75 ? "High" : "Review"}</small></div>
            <p className="confidence-note">How sure the case team is in this specific recommendation, based only on the evidence you gave it — not a guarantee of outcome.</p>
            <div className="hero-buttons">
              <button className="primary" onClick={() => goTo("Strategy")}>View full strategy <span>→</span></button>
              <button onClick={() => goTo("Drafts")}><span>✎</span> Draft response</button>
            </div>
          </div>
        </section>

        <section className="metric-row">
          <div><span>EVIDENCE USED</span><strong>{readyDocs}</strong><small>Text-ready documents</small></div>
          <div><span>PRIORITY ACTIONS</span><strong>{analysis.priorityActions.length}</strong><small>Recommended next steps</small></div>
          <div><span>ALTERNATIVES</span><strong>{analysis.alternatives.length}</strong><small>Other routes considered</small></div>
          <div><span>EVIDENCE GAPS</span><strong>{analysis.evidenceGaps.length}</strong><small>Open before you commit</small></div>
        </section>

        {analysis.priorityActions.length > 0 && (
          <section className="action-section">
            <div className="section-heading"><div><span>PRIORITY ACTIONS</span><h3>What moves the position now</h3></div></div>
            <div className="action-list">
              {analysis.priorityActions.map((action, index) => (
                <button className={done.has(index) ? "action done" : "action"} key={index} onClick={() => toggle(index)}>
                  <span className="check">{done.has(index) ? "✓" : index + 1}</span>
                  <span className="due">{action.timing}</span>
                  <span className="action-copy"><strong>{action.action}</strong><small>{action.reason}</small></span>
                  <span className="arrow">→</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </div>

      <aside className="insight-rail">
        <section className="team-card">
          <div className="rail-heading"><div><span className="live-dot" />CASE TEAM</div></div>
          <p className="rail-note">Four AI specialists independently review your evidence from different angles; the case lead resolves any disagreement into one recommendation. The percentage is each one&apos;s confidence in their own findings.</p>
          <div className="agent-list">
            {team.map((member) => (
              <div key={member.role}>
                <span className={`agent-avatar ${roleAvatarClass(member.role)}`}>{member.label.slice(0, 2).toUpperCase()}</span>
                <p><strong>{member.label}</strong><small>{member.note}</small></p>
                <i>{Math.round(member.confidence * 100)}%</i>
              </div>
            ))}
          </div>
        </section>

        {analysis.evidenceGaps.length > 0 && (
          <section className="argument-card">
            <div className="rail-heading"><div>EVIDENCE GAPS</div></div>
            <p className="rail-note">Things the case team couldn&apos;t verify from what you uploaded — closing these strengthens the position.</p>
            <div className="argument-flow">
              {analysis.evidenceGaps.slice(0, 3).map((gap, index) => (
                <div className="proof-needed" key={index}><span>GAP {index + 1}</span><p>{gap}</p></div>
              ))}
            </div>
          </section>
        )}

        {risks.length > 0 && (
          <section className="watch-card">
            <span className="watch-icon">!</span>
            <div><strong>Risk flagged by the case team</strong><p>{risks[0]}</p></div>
          </section>
        )}
      </aside>
    </div>
  );
}

function Evidence({
  documents,
  onAddEvidence,
  uploading,
}: {
  documents: StoredDocument[];
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
      <div className="page-intro">
        <div>
          <span className="section-kicker"><b>◇</b> EVIDENCE ROOM</span>
          <h2>Every claim tied to its source.</h2>
          <p>Original files remain downloadable while extracted text is available to the case team.</p>
        </div>
        <label className={`evidence-upload ${uploading ? "disabled" : ""}`}>
          <input type="file" multiple disabled={uploading} accept=".pdf,.docx,.xlsx,.csv,.txt,.md,.json,.xml,.html,.eml,.png,.jpg,.jpeg" onChange={(event) => { onAddEvidence(Array.from(event.target.files ?? [])); event.target.value = ""; }} />
          {uploading ? "Processing…" : "＋ Add evidence"}
        </label>
      </div>
      {documents.length === 0 ? (
        <section className="stored-empty">
          <span>⇧</span>
          <h3>No files in this case yet.</h3>
          <p>Add the contracts, correspondence, invoices, or shipment records the case team should use.</p>
        </section>
      ) : (
        <>
          <section className="stored-documents" aria-labelledby="stored-documents-title">
            <div className="stored-documents-heading"><div><span>PERSISTED EVIDENCE</span><h3 id="stored-documents-title">Originals secured. Processing visible.</h3></div><small>{documents.length} FILE{documents.length === 1 ? "" : "S"}</small></div>
            <div className="stored-document-list">
              {documents.map((document) => <article key={document.id}>
                <span className={`stored-status ${document.extractionStatus}`}>{document.extractionStatus === "ready" ? "✓" : document.extractionStatus === "failed" ? "!" : "•"}</span>
                <div><strong>{document.originalName}</strong><small>{formatBytes(document.byteSize)} · {document.extractionStatus === "ready" ? `${document.extractedCharacters.toLocaleString()} characters extracted` : document.extractionError ?? "Original stored"}</small></div>
                <code>{document.sha256.slice(0, 10)}</code>
                <a href={document.downloadUrl}>Download ↓</a>
              </article>)}
            </div>
          </section>
          <div className="evidence-summary">
            <div><span>{documents.length}</span><p><strong>Originals persisted</strong><small>{formatBytes(storedBytes)} on durable storage</small></p></div>
            <div><span>{ready}</span><p><strong>Text-ready files</strong><small>Available to the agent workflow</small></p></div>
            <div><span>{needsAttention}</span><p><strong>Needs attention</strong><small>Unsupported, empty, or failed extraction</small></p></div>
          </div>
        </>
      )}
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
    intake: "Case created",
    analyzing: "Case team analyzing",
    evidence: "Evidence preserved",
    strategy: "Strategy ready",
    closed: "Closed",
  };
  return labels[status] ?? "Workspace case";
}

function Strategy({
  analysis,
  runState,
  onRun,
  goTo,
}: {
  analysis: CaseAnalysis | null;
  runState: RunState;
  onRun: () => void;
  goTo: (v: View) => void;
}) {
  const analyzing = runState.kind !== "idle";

  if (!analysis) {
    return (
      <div className="content-view single-column">
        {analyzing ? (
          <RunProgress runState={runState} />
        ) : (
          <EmptyState
            icon="⌘"
            title="No positions to compare yet."
            body="Once the case team runs, you'll see the recommended position scored against every alternative it considered."
            actionLabel="Run case team"
            onAction={onRun}
          />
        )}
      </div>
    );
  }

  const score = Math.round(analysis.confidence * 100);

  return (
    <div className="strategy-view content-view single-column">
      <div className="page-intro">
        <div>
          <span className="section-kicker"><b>⌘</b> POSITION DESIGN</span>
          <h2>The recommended position, and what else the team weighed.</h2>
          <p>Scored by the case team against the evidence available when it ran. &ldquo;Alternative&rdquo; routes were considered and set aside — read why below before assuming the top choice is the only option.</p>
        </div>
        <button className="solid" onClick={() => goTo("Drafts")}>Draft from strategy →</button>
      </div>
      {analyzing && <RunProgress runState={runState} compact />}
      <div className="strategy-routes">
        <article className="strategy-route recommended">
          <div className="route-top"><span>RECOMMENDED</span><div className="route-score"><strong>{score}</strong><small>/100</small></div></div>
          <h3>{analysis.recommendedPosition}</h3>
          <p>{analysis.executiveSummary}</p>
          <div className="score-bar"><i style={{ width: `${score}%` }} /></div>
        </article>
        {analysis.alternatives.map((alternative, index) => (
          <article className="strategy-route fallback" key={index}>
            <div className="route-top"><span>ALTERNATIVE</span></div>
            <h3>{alternative.name}</h3>
            <p>{alternative.whenToUse}</p>
            <div className="route-tradeoff"><span>TRADEOFF</span>{alternative.tradeoffs}</div>
          </article>
        ))}
      </div>

      <div className="strategy-lower">
        <section className="fact-table">
          <div className="table-title"><div><span>EVIDENCE GAPS</span><h3>Close these before you commit</h3></div></div>
          {analysis.evidenceGaps.length === 0 ? (
            <div className="fact-row"><span>No open evidence gaps reported by the case team.</span><span /><span /></div>
          ) : analysis.evidenceGaps.map((gap, index) => (
            <div className="fact-row" key={index}><span>{gap}</span><span /><b className="needs-proof">Open</b></div>
          ))}
        </section>
        <section className="counterparty-card">
          <span>TEAM READ</span>
          <h3>How confident each specialist is.</h3>
          <p>Confidence and risk count from each independent specialist pass — a low number here is a reason to review that angle yourself, not a bug.</p>
          {analysis.specialistOutputs.map((specialist, index) => (
            <div key={index}><span>{roleLabel(specialist.role)}</span><strong>{Math.round(specialist.confidence * 100)}% confidence · {specialist.risks.length} risk{specialist.risks.length === 1 ? "" : "s"} flagged</strong></div>
          ))}
        </section>
      </div>
    </div>
  );
}

function Drafts({
  analysis,
  draft,
  setDraft,
  onCopy,
  notify,
  runState,
  onRun,
}: {
  analysis: CaseAnalysis | null;
  draft: string;
  setDraft: (v: string) => void;
  onCopy: () => void;
  notify: (m: string) => void;
  runState: RunState;
  onRun: () => void;
}) {
  const analyzing = runState.kind !== "idle";

  if (!analysis) {
    return (
      <div className="content-view single-column">
        {analyzing ? (
          <RunProgress runState={runState} />
        ) : (
          <EmptyState
            icon="✎"
            title="No draft yet."
            body="A draft response is generated from the case team's approved strategy, with every factual claim checked against your evidence."
            actionLabel="Run case team"
            onAction={onRun}
          />
        )}
      </div>
    );
  }

  const wordCount = draft.trim() ? draft.trim().split(/\s+/).length : 0;

  return (
    <div className="draft-view content-view">
      <aside className="draft-list">
        <div className="draft-list-head"><span>1 DRAFT</span></div>
        <button className="active"><span className="draft-status">READY</span><strong>Recommended response</strong><small>Generated from the approved strategy</small></button>
      </aside>
      <section className="editor-card">
        <header>
          <div><span>DRAFT RESPONSE</span><h2>Response drafted by the case team</h2></div>
          <div><button onClick={onCopy}>Copy</button><button className="send" onClick={() => notify("Export isn't built yet — copy the text for now.")}>Export ↗</button></div>
        </header>
        <textarea aria-label="Draft response" value={draft} onChange={(e) => setDraft(e.target.value)} />
        <footer><div><span className="quality-dot" />Drafted from the approved strategy — read it before sending; nothing is sent for you</div><span>{wordCount} words</span></footer>
      </section>
      <aside className="draft-guidance">
        <div className="rail-heading"><div>WRITER NOTES</div></div>
        {analysis.evidenceGaps.slice(0, 2).map((gap, index) => (
          <div className="guidance-item warning" key={`gap-${index}`}><span>!</span><p><strong>Evidence gap</strong><small>{gap}</small></p></div>
        ))}
        {analysis.priorityActions[0] && (
          <div className="guidance-item neutral"><span>→</span><p><strong>Suggested next step</strong><small>{analysis.priorityActions[0].action}</small></p></div>
        )}
        {analysis.evidenceGaps.length === 0 && (
          <div className="guidance-item good"><span>✓</span><p><strong>No open evidence gaps</strong><small>The case team did not flag anything unresolved.</small></p></div>
        )}
      </aside>
    </div>
  );
}
