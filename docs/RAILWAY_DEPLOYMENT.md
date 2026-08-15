# Deploy Pactline on Railway and share it

This is the deployment guide for the current professional prototype. It uses three Railway resources:

```text
User → Pactline web service → PostgreSQL (accounts, cases, extracted text, runs)
                         │
                         ├→ Railway Volume (original uploaded files)
                         └→ configured LLM provider API
```

The app already includes email-and-password authentication, public-or-allowlisted access, durable case and document records, PDF/DOCX/XLSX/text extraction, a provider-neutral LangGraph workflow, database migrations, a health check, and a Docker image that can write safely to a Railway Volume.

## 1. What you need

1. A GitHub repository containing this project.
2. A Railway account.
3. An API key for OpenAI, Anthropic, or an OpenAI-compatible model endpoint.
4. A monitored contact email for the public privacy notice.

Generate the Better Auth signing secret locally and save it in a password manager:

```bash
openssl rand -base64 32
```

## 2. Create the Railway resources

1. Create a Railway project.
2. Select **Deploy from GitHub repo** and choose this repository. This creates the Pactline web service.
3. In the same project, choose **New → Database → PostgreSQL**.
4. On the web service, open **Variables → Add Reference Variable** and reference the Postgres service's `DATABASE_URL` as `DATABASE_URL`.
5. Add a **Volume** to the Pactline web service and set its mount path to `/data`.
6. In the Volume settings, enable scheduled backups appropriate for the pilot.

Do not attach the Volume to PostgreSQL. Railway manages the database's own storage. The `/data` Volume belongs to the Pactline web service and holds original uploaded documents.

Railway exposes the selected mount location through `RAILWAY_VOLUME_MOUNT_PATH`. Pactline uses that variable automatically. Its container entrypoint prepares the directory, gives the non-root application user access, and then drops root privileges before starting Next.js.

The committed `railway.toml` instructs Railway to build the root `Dockerfile`, run committed database migrations before deployment, check `/api/health`, and restart the service after failures. The pre-deploy migration only needs PostgreSQL; Railway Volumes are not available during pre-deploy commands.

## 3. Generate a domain

On the Pactline service, open **Settings → Networking → Generate Domain**. Copy the exact HTTPS origin, for example:

```text
https://pactline-production.up.railway.app
```

Do not include a trailing slash when assigning this value to `BETTER_AUTH_URL`.

For a public pilot, a custom domain is preferable because it gives users a stable, recognizable application identity and makes `BETTER_AUTH_URL` and email links look trustworthy. The Railway domain is adequate for initial testing.

Because sign-in is email-and-password (no OAuth provider), there is no third-party console setup for authentication — anyone visiting your domain can go to `/sign-up` and create an account directly. Skip straight to setting your Railway variables.

## 4. Set Railway variables

Add the following variables to the Pactline web service:

```dotenv
NODE_ENV=production

AUTH_ENABLED=true
ACCESS_MODE=public
ALLOWED_EMAILS=
BETTER_AUTH_URL=https://pactline-production.up.railway.app
BETTER_AUTH_SECRET=<output from openssl rand -base64 32>
PRIVACY_CONTACT_EMAIL=privacy@yourdomain.com

MAX_UPLOAD_MB=25

LLM_PROVIDER=openai
LLM_MODEL=<model available to your provider account>
OPENAI_API_KEY=<secret>
```

Do not manually set `RAILWAY_VOLUME_MOUNT_PATH`; Railway supplies it for the attached Volume. `UPLOAD_DIR` is only needed for local development.

Keep `DATABASE_URL` as a Railway reference variable rather than copying a public connection string. Never prefix database or model credentials with `NEXT_PUBLIC_`; that prefix is for values that may be bundled into browser code.

### OpenAI

```dotenv
LLM_PROVIDER=openai
LLM_MODEL=<OpenAI model ID>
OPENAI_API_KEY=<secret>
```

### Anthropic / Claude

```dotenv
LLM_PROVIDER=anthropic
LLM_MODEL=<Anthropic model ID>
ANTHROPIC_API_KEY=<secret>
```

### OpenAI-compatible endpoint

```dotenv
LLM_PROVIDER=openai-compatible
LLM_MODEL=<provider model ID>
LLM_BASE_URL=https://provider.example/v1
LLM_API_KEY=<secret>
```

The endpoint must support the structured-output/tool-calling behavior used by the LangGraph workflow. A provider with different semantics should receive a dedicated adapter in `lib/ai/provider.ts`.

## 5. Public access versus an allowlist

The requested initial configuration is:

```dotenv
AUTH_ENABLED=true
ACCESS_MODE=public
ALLOWED_EMAILS=
```

This means the application still requires a real account, but anyone who signs up with an email and password may create their own cases. Server-side ownership checks prevent one signed-in user from listing or downloading another user's cases and files.

If you later want a private pilot, switch to:

```dotenv
ACCESS_MODE=allowlist
ALLOWED_EMAILS=you@example.com,friend@example.com
```

The allowlist checks the email a person signs up with; it does not expose Railway, database, auth-secret, or LLM credentials to users. Your friend receives only the public application URL.

## 6. Deploy and verify

Trigger a deployment after the database, Volume, and variables are configured. Railway builds the standalone Next.js image and applies `drizzle/0000_*.sql` followed by `drizzle/0001_*.sql` before starting the new release.

Verify in this order:

1. Open `https://<your-domain>/api/health`; expect `{"status":"ok","service":"pactline"}`.
2. Open `https://<your-domain>/about` and `https://<your-domain>/privacy` while signed out.
3. Open the root URL and confirm it redirects to `/sign-in`.
4. Go to `/sign-up` and create an account with an email and password.
5. Create a case, add a small PDF or DOCX, and wait for the Evidence room.
6. Confirm the file shows a checksum, extraction state, and authenticated download link.
7. Refresh the browser and confirm the saved case and its evidence reappear.
8. Select **Run case team**, confirm the configured model responds, then open **Drafts**.
9. Sign out and create a second account to verify public sign-up and per-user case isolation.

After a successful check, send your friend only:

```text
https://pactline-production.up.railway.app
```

They select **Create a workspace account**; no Railway access is needed.

## 7. What happens to an uploaded file

The current request path is intentionally simple:

1. The API validates authentication, case ownership, extension, size, and basic file signature.
2. The original bytes are written atomically to the attached Volume under an opaque document ID and with owner-only file permissions.
3. Pactline calculates a SHA-256 checksum.
4. It extracts machine-readable text from PDF, DOCX, XLSX, CSV, text, Markdown, JSON, XML, HTML, or EML. JPG/PNG originals are preserved, but OCR is not yet enabled.
5. PostgreSQL records the original filename, storage key, checksum, size, extraction status, extracted text, and case relationship.
6. A saved-case analysis loads only that user's ready extracted evidence into the LangGraph case team.

The Volume is the system of record for original file bytes; PostgreSQL is the system of record for ownership and processing metadata. If the web service is redeployed, both survive. If the user refreshes the browser, the UI reloads saved cases and evidence from PostgreSQL.

Important operational limits:

- Railway permits one Volume per service, and Volume-backed services cannot use replicas in the usual stateless way.
- Volume deployments can have a short period of downtime while the mount moves to the new deployment.
- A Volume is persistent storage, not a backup. Enable Railway Volume backups and periodically test restoration.
- This prototype allows up to 12 files per upload request and defaults to 25 MB per file.
- Malware scanning, OCR, document versioning, deletion/export UI, storage quotas, retention automation, and page-level citations are still production work.

## 8. Why Redis and a worker are not required yet

Redis is not needed to preserve documents. The attached Volume and PostgreSQL already provide persistence.

Today, upload extraction and LangGraph analysis run inside the Pactline web service request:

```text
Browser → Next.js request → save original → extract text → PostgreSQL
Browser → Next.js request → LangGraph/model → save run result → response
```

For a small prototype with modest PDFs and a few concurrent users, this is easier to deploy, cheaper, and fully usable. If extraction fails, Pactline still records the original for supported upload paths and shows the processing status. The user can download it again.

A worker becomes valuable when work should continue independently of the browser request or web deployment—for example OCR on hundreds of pages, malware scanning, embeddings, large spreadsheet normalization, retries, or many simultaneous analyses. Redis is commonly used as the queue between the web service and that worker:

```text
Browser → web service → queue → worker
              │                   ├→ Volume/object storage
              └───────────────────└→ PostgreSQL status/results
```

Redis is then responsible for job delivery, retry scheduling, concurrency, and progress—not permanent file storage. A PostgreSQL-backed queue is also reasonable at smaller scale and avoids another service.

Add a worker when measurements show one of these conditions:

| Signal | Recommended change |
|---|---|
| Small files finish reliably in the request | Keep the current web + Postgres + Volume setup |
| Frequent timeouts or users closing long uploads | Add a durable PostgreSQL queue and worker |
| OCR, malware scanning, high concurrency, scheduled retries | Add a dedicated worker and Redis or a managed queue |
| Multiple web replicas or larger production scale | Move originals to object storage and keep workers stateless |

## 9. Troubleshooting

- **Sign-up or sign-in fails with no clear message**: confirm `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` are set and `DATABASE_URL` is reachable; Better Auth needs the database to create the account/session rows.
- **Upload returns a permissions error**: confirm a Volume is attached to the Pactline service and mounted at `/data`; do not override `RAILWAY_VOLUME_MOUNT_PATH`.
- **Uploaded files vanish after redeploy**: the service is writing to its ephemeral filesystem, usually because no Volume is attached. Attach one and verify the runtime variable is present.
- **Case loads but download is missing**: check Railway logs for Volume mount or path errors and confirm the matching PostgreSQL document row exists.
- **Analysis says no model is configured**: verify `LLM_PROVIDER`, `LLM_MODEL`, and the corresponding provider API key.
- **Build succeeds but deployment migration fails**: verify the `DATABASE_URL` reference and PostgreSQL service status. Do not edit a migration that was already applied; generate a new migration.

## 10. Production boundary

This is a working professional prototype, not yet a compliance-certified multi-tenant SaaS. Before inviting untrusted public traffic, add rate limits and per-user storage/model quotas, deletion and export controls, malware scanning, monitored audit logs, legal terms, an operator-reviewed privacy policy, incident procedures, and billing-abuse protection. Start by sharing the URL with known users even though `ACCESS_MODE=public` makes the login technically open.
