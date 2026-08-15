# Pactline

Pactline is an evidence-first supply-chain negotiation workspace. Users create a case, add source material, run a specialist case team, compare positions, and edit a draft response without working inside a generic chat interface.

## How it works

```text
Browser → authenticated Next.js API → LangGraph case workflow
                                      ├─ contract specialist
                                      ├─ operations specialist
                                      ├─ risk specialist
                                      ├─ negotiation specialist
                                      └─ case-lead synthesis
                                               ↓
                                  strategy + actions + draft
```

LangGraph controls the workflow. LangChain's common chat-model interface keeps the graph independent from the configured model vendor. The provider registry currently supports:

- OpenAI through `@langchain/openai`
- Anthropic/Claude through `@langchain/anthropic`
- Any sufficiently OpenAI-compatible endpoint through a custom base URL

The browser never receives provider keys. Better Auth handles Google OAuth, Drizzle stores users, sessions, cases, extracted document text, and run results in PostgreSQL, and originals are persisted on an attached Railway Volume. Access can be public to any Google account or restricted by email allowlist.

## Current implementation

- Polished case cockpit with overview, evidence, strategy, drafts, outcomes, and intake surfaces
- Real `POST /api/cases/analyze` LangGraph workflow with parallel specialists and schema-validated output
- Durable case and document APIs with ownership checks, SHA-256 checksums, authenticated downloads, and reloadable case history
- Original-file storage on a Railway Volume (or `.data` locally) plus PDF, DOCX, XLSX, CSV, text, Markdown, JSON, XML, HTML, and EML extraction
- Runtime status at `GET /api/runtime`; it exposes provider/model names but never credentials
- Better Auth Google sign-in at `/sign-in`
- PostgreSQL schema and Drizzle migrations for users, sessions, cases, documents, and agent runs
- Docker and config-as-code deployment for Railway
- Liveness check at `GET /api/health`

OCR for image-only evidence, page-level citations, malware scanning, deletion/export controls, background jobs, quotas, and full audit/version history remain production workstreams in [PRODUCT_PLAN.md](./PRODUCT_PLAN.md).

## Local setup

Requirements: Node.js 22.13+ and PostgreSQL.

```bash
npm install
cp .env.example .env.local
npm run db:migrate
npm run dev
```

Open `http://localhost:3000`. Authentication is off by default for local UI development. Set `AUTH_ENABLED=true` only after PostgreSQL and Google OAuth are configured.

### Choose the model provider

OpenAI:

```dotenv
LLM_PROVIDER=openai
LLM_MODEL=<an OpenAI model available to your account>
OPENAI_API_KEY=<secret>
```

Claude:

```dotenv
LLM_PROVIDER=anthropic
LLM_MODEL=<an Anthropic model available to your account>
ANTHROPIC_API_KEY=<secret>
```

OpenAI-compatible endpoint:

```dotenv
LLM_PROVIDER=openai-compatible
LLM_MODEL=<provider model id>
LLM_BASE_URL=https://provider.example/v1
LLM_API_KEY=<secret>
```

Dedicated provider adapters should be added in [`lib/ai/provider.ts`](./lib/ai/provider.ts) when a provider has non-standard behavior or useful native features. Do not put provider branching inside the agent graph.

## Useful commands

```bash
npm run dev          # local Next.js server
npm run typecheck    # TypeScript validation
npm run lint         # ESLint
npm run build        # production build
npm run db:generate  # generate a migration after schema changes
npm run db:migrate   # apply committed migrations
npm test             # typecheck + production build
```

For the exact Railway web + PostgreSQL + Volume deployment, public Google OAuth setup, friend-access checklist, environment variables, Redis decision, and troubleshooting, see [Railway deployment](./docs/RAILWAY_DEPLOYMENT.md).
