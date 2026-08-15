# Pactline — Supply-chain negotiation agent

## 1. Product promise

Pactline turns a messy supply-chain problem—contracts, policies, emails, bills of lading, invoices, freight notices, spreadsheets, and a plain-language explanation—into an organized case with a defensible strategy, a prioritized action plan, and ready-to-send communication.

The product is a case cockpit, not a chat product. Conversation can support clarification, but the durable objects are facts, evidence, arguments, risks, actions, drafts, decisions, and outcomes.

## 2. Evidence from the two design-partner cases

### Case A: retrospective Red Sea surcharge — won

- Carrier advisory added an emergency charge to cargo already afloat.
- Fourteen 20-foot containers were covered by a purchase order with fixed freight and marine-insurance line items.
- The useful reasoning sequence was: classify the freight agreement, separate carrier obligations from the intermediary relationship, identify insurer recovery for cargo interruption, and prepare for likely rejection grounds.
- Outcome: USD 50,100 recovered.

### Case B: forced voyage termination at Jazan — active

- Two insured shipments, eight 20-foot containers, 166.4 MT of fiberglass chop roving, contracted Shanghai-to-Jeddah voyage, approximately USD 141,000 total insured value.
- Carrier involuntarily discharged the containers at Jazan because of Red Sea security and operational hazards.
- Adjuster preliminarily denied COD, customs, storage/demurrage, re-nomination, and onward-freight costs under the “port of distress following a sea peril” theory.
- Stronger position: extraordinary sue-and-labor / preservation costs incurred under the insured’s duty to avert imminent physical loss.
- Critical evidence gap: an independent technical basis for the asserted 60–65°C container temperature and the cargo’s binder-degradation threshold.

## 3. Core user journey

1. Create a case with a plain-language brief and files.
2. Intake agent classifies the matter, entities, dates, money, obligations, and desired outcome.
3. Document agent extracts clauses and shipment facts with source-level citations.
4. Case lead builds an issue tree and asks only the questions that materially change the strategy.
5. Contract, operations, risk, and negotiation agents independently test positions.
6. Case lead compares routes, names the recommended position, confidence, evidence gaps, fallback, concession ladder, and walk-away point.
7. User executes prioritized actions and produces a response from the approved strategy.
8. The outcome is recorded and distilled into a reusable playbook.

## 4. Product surfaces

| Surface | Purpose | Minimum useful version |
|---|---|---|
| Case intake | Capture problem and documents | Brief, multi-file upload, target outcome, urgency |
| Overview | Decision cockpit | Recommendation, confidence, value at risk, route/timeline, next actions |
| Evidence room | Make reasoning auditable | Document groups, extracted facts, source links, verified/assumed/disputed states |
| Strategy | Compare viable positions | Primary route, fallback, avoid route, counterarguments, concession ladder |
| Response studio | Turn strategy into action | Editable drafts, tone control, factuality check, copy/export |
| Outcomes | Prove value and learn | Recovered/saved amount, cycle time, decision log, playbook extraction |
| Playbooks | Compound company knowledge | Reusable issue patterns, clause tests, evidence checklists, response structures |

## 5. Agent architecture

### Orchestrator: Case lead

- Owns the issue tree, task plan, synthesis, confidence, and final recommendation.
- Never invents facts; separates verified facts, inferences, assumptions, and advice.
- Resolves disagreement between specialist agents and shows material dissent.

### Specialist agents

- **Intake analyst:** extracts parties, scope, objective, deadlines, exposures, and document inventory.
- **Document analyst:** parses contracts and operational documents; returns clause/fact citations and OCR confidence.
- **Contract analyst:** identifies obligations, exceptions, notice rules, precedence, governing law, and counterparty defenses.
- **Operations analyst:** reconstructs shipment/event timeline and operational alternatives.
- **Risk modeler:** quantifies exposure, scenario ranges, time sensitivity, and evidence gaps.
- **Negotiation strategist:** designs anchors, BATNA, concession ladder, likely objections, and escalation path.
- **Negotiation writer:** drafts only from an approved position and checks every factual assertion against the evidence graph.
- **Red-team reviewer:** argues the counterparty case and flags overclaiming, missing proof, and legal-risk language.

### Shared agent output contract

Every agent returns structured JSON:

```json
{
  "findings": [{"claim": "...", "status": "verified|inferred|assumed|disputed", "source_ids": ["..."]}],
  "risks": [{"description": "...", "severity": "low|medium|high", "mitigation": "..."}],
  "open_questions": [{"question": "...", "decision_impact": "..."}],
  "recommendations": [{"action": "...", "rationale": "...", "priority": 1}],
  "confidence": 0.0
}
```

## 6. Data model

- **Workspace:** members, permissions, organization knowledge.
- **Case:** title, category, status, objective, owner, urgency, currencies, financial exposure.
- **Party:** role, organization, contacts, leverage, communication history.
- **Document:** type, version, checksum, extraction status, page/block coordinates, access rules.
- **Fact:** normalized statement, value, unit, date, status, confidence, source spans.
- **Clause:** normalized obligation/right/exclusion, document span, applicability, interpretation notes.
- **Issue:** question to resolve, competing positions, dependencies, status.
- **Strategy:** primary position, alternatives, BATNA, target, floor, concessions, confidence.
- **Action:** owner, deadline, rationale, dependency, completion evidence.
- **Draft:** audience, channel, tone, linked strategy, factual assertions, approval status.
- **Outcome:** recovered/saved amount, terms, cycle time, lessons, reusable-playbook candidates.
- **Audit event:** actor, action, input version, model/tool version, timestamp.

## 7. Safety and trust requirements

- Cite every contractual, financial, timeline, and technical claim to a file location.
- Never present inferred legal interpretation as fact; label the product “decision support, not legal advice.”
- Require explicit user approval before sending communication or changing an external system.
- Detect privileged, personal, export-controlled, and commercially sensitive content; use workspace-scoped retrieval.
- Keep immutable document versions and a full audit trail of agent conclusions and draft changes.
- Show uncertainty and material specialist disagreement instead of averaging it away.
- Treat calculation units, currencies, date formats, and container counts as typed fields with validation.

## 8. Delivery plan and parallel agent assignments

### Phase 0 — Design-partner definition (2–3 days)

**Agent: Product researcher**

- Convert both cases into sanitized gold-standard case packs.
- Interview 3–5 supply-chain managers about intake, escalation, approvals, and evidence handling.
- Deliver jobs-to-be-done, terminology, success measures, and a ranked risk register.

**Agent: Domain analyst**

- Create a taxonomy for carrier surcharge, cargo claim, supplier failure, purchase-order dispute, demurrage, quality claim, and contract-renewal cases.
- Deliver required-document and deadline checklists for each type.

Exit: 10 realistic evaluation cases, agreed scope, and documented human approval boundaries.

### Phase 1 — Auditable case analysis MVP (2–3 weeks)

**Agent: Frontend owner**

- Implement intake, overview, evidence room, strategy, action list, and response studio.
- Use this prototype as the interaction specification.

**Agent: Backend owner**

- Implement workspace/case/document/fact/strategy/draft APIs, object storage, relational database, and job queue.
- Add document versioning and audit events from day one.

**Agent: Document intelligence owner**

- Build PDF/DOCX/XLSX/email ingestion, OCR fallback, layout-aware chunks, tables, and page/block citations.
- Return extraction confidence and never discard the original document.

**Agent: Agent-runtime owner**

- Implement the case-lead graph, structured output contract, specialist isolation, retries, trace storage, and red-team pass.
- Keep tools read-only in Phase 1.

Exit: a user can create a case, upload evidence, receive an auditable strategy, edit a cited response, and record an outcome.

### Phase 2 — Evaluation and reliability (1–2 weeks)

**Agent: Evaluation owner**

- Create per-task tests for extraction accuracy, citation correctness, issue spotting, numerical consistency, hallucination rate, strategy usefulness, and draft factuality.
- Run adversarial cases with missing pages, conflicting versions, scanned tables, multiple currencies, and ambiguous Incoterms.

**Agent: Security owner**

- Threat-model document upload, prompt injection in files, tenant isolation, sensitive-data leakage, audit integrity, and authorization.

Exit: no unsupported high-stakes claim in the gold set; every material recommendation is traceable; tenant-isolation tests pass.

### Phase 3 — Design-partner pilot (3–4 weeks)

**Agent: Pilot operator**

- Onboard 2–3 supply-chain teams, observe real cases, and capture where users override the system.
- Track time-to-first-strategy, time-to-response, action completion, recovery/savings, and user trust.

**Agent: Learning-system owner**

- Convert closed cases into suggested playbooks only after human review.
- Add organization-specific clause libraries, approved wording, and outcome patterns.

Exit: at least 20 completed real cases, measurable cycle-time reduction, 3 referenceable wins, and a prioritized production roadmap.

### Phase 4 — Controlled integrations

- Add email and document-repository connectors for import first; outbound sending remains approval-gated.
- Add ERP/TMS data only for shipment lookup, cost validation, and evidence refresh.
- Add SSO, role-based approvals, retention policies, and region-specific data controls.

## 9. Recommended technical shape

- Responsive Next.js application with React/TypeScript, packaged as a standalone Docker service for Railway.
- Better Auth with Google OAuth, PostgreSQL-backed sessions, and server-side workspace authorization.
- PostgreSQL with Drizzle for users, cases, document metadata/text, and agent runs; a Railway Volume currently preserves original files. Move originals to object storage and add a durable background worker when measured scale, OCR, or reliability requirements justify it; choose Redis or a PostgreSQL-backed queue based on workload.
- Layout-aware document extraction plus OCR; page/block citations stored independently from embeddings.
- Hybrid retrieval: typed fact/metadata filters + semantic retrieval over evidence blocks.
- LangGraph orchestration with parallel specialist tasks, schema-validated outputs, model/tool versioning, and resumable jobs.
- A provider registry exposing the common LangChain chat-model interface. OpenAI, Anthropic, and OpenAI-compatible endpoints are configuration choices, never dependencies inside case logic.
- Streaming status events for agent progress; no fabricated “thinking” text.
- Email/Drive/SharePoint connectors only through explicit workspace authorization and least-privilege scopes.

## 10. Success measures

- Median time from upload to first auditable strategy under 10 minutes.
- More than 95% of material factual claims correctly cited.
- Zero uncited contract clause quotations in an approved draft.
- More than 60% reduction in time spent organizing a case and preparing the first response.
- Outcome value tracked for more than 80% of closed cases.
- Users accept or lightly edit the recommended action plan in more than 70% of cases.
- No external message is sent without explicit approval.

## 11. What this prototype includes—and what production still needs

This repository implements the product experience, a live LangGraph analysis route, a server-side LLM provider registry, PostgreSQL and Drizzle persistence, public-or-allowlisted Google OAuth, Railway Volume storage for originals, authenticated document APIs, and extraction for PDF, DOCX, XLSX, and common text formats. Production still needs malware scanning, OCR, page-level citations, deletion/export and retention controls, durable background jobs, complete audit/version history, quotas/rate limits, evaluation gates, tenant roles, and approved outbound integrations. Those workstreams should preserve the same evidence-first case model and provider-neutral graph boundary.

## 12. Implementation ownership map

The repository boundaries are intentionally narrow so additional agents can work without editing the same files:

| Owner | Primary files | Contract with other workstreams |
|---|---|---|
| Agent runtime | `lib/agents/*` | Accepts normalized case/evidence input; returns schema-valid strategy output |
| Provider integrations | `lib/ai/provider.ts` | Returns a LangChain `BaseChatModel`; never exposes keys or changes case prompts |
| Identity and access | `lib/auth.ts`, `lib/access.ts`, `proxy.ts`, `app/api/auth/*` | Returns a validated user/session; enforces workspace authorization server-side |
| Data platform | `db/*`, `drizzle/*` | Owns migrations and repository functions; avoids UI imports |
| API | `app/api/cases/*` | Validates input, authenticates, invokes the graph, persists lifecycle state |
| Product UI | `app/page.tsx`, `app/globals.css` | Consumes typed API results; does not call model providers directly |
| Document pipeline | `lib/documents/*` now; worker later | Persists originals and extracted text now; next adds normalized blocks with stable source coordinates |
| Deployment | `Dockerfile`, `railway.toml`, `docs/RAILWAY_DEPLOYMENT.md` | Keeps migrations, health checks, variables, and runtime instructions current |

Cross-workstream rule: change a shared schema first, update its consumers second, and add an evaluation fixture before changing agent behavior. Never place credentials in browser-visible variables or allow an agent to send an external message without an explicit user approval event.
