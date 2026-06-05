# Enterprise Knowledge Base Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first real internal enterprise knowledge base version from `docs/superpowers/specs/2026-06-05-enterprise-knowledge-base-design.md` and verify it against the listed acceptance criteria.

**Architecture:** Use a TypeScript monorepo with a modular Fastify API, a React + Vite web app, PostgreSQL + pgvector via Docker Compose, local file storage behind an interface, and a worker command for document ingestion. Keep cloud model calls behind provider interfaces and ship deterministic local development providers so the RAG flow, tests, and UI can run without external API keys.

**Tech Stack:** npm workspaces, TypeScript, Fastify, React + Vite, PostgreSQL + pgvector, `pg`, `tsx`, `vitest`, `pdf-parse`, `mammoth`, `jszip`, `bcryptjs`, `jsonwebtoken`, local filesystem storage, OpenAI-compatible optional provider hooks.

---

## Visual Direction

Use the generated concept as the primary UI direction:

`C:\Users\58217\.codex\generated_images\019e95f3-178e-7d43-bbe8-2d7b9c72f304\ig_02b9781232b61b96016a2260c9cd608191afe54ed2274f238d.png`

Implementation constraints:

- Build an internal tool, not a landing page.
- Use a left sidebar with 知识库, 文档, 智能问答, 任务队列, 设置.
- Keep the primary surface dense but readable: dashboard metrics, document table, chat panel, citation panel, and confidence indicator.
- Use white and neutral gray surfaces with restrained teal and amber accents.
- Use 6px to 8px radii, compact controls, lucide-style icons, and no decorative gradient blobs.

## File Structure

Create:

- `.gitignore`: ignore dependencies, env files, build output, uploaded files, and local worktrees.
- `.env.example`: local development environment variables.
- `package.json`: root workspace scripts.
- `tsconfig.base.json`: shared TypeScript defaults.
- `docker-compose.yml`: PostgreSQL + pgvector runtime.
- `database/init/001_schema.sql`: tables, enums, indexes, pgvector extension, seed data.
- `packages/shared/package.json`: shared package manifest.
- `packages/shared/src/types.ts`: API and domain types.
- `packages/shared/src/contracts.ts`: shared constants and validation helpers.
- `apps/api/package.json`: API package manifest.
- `apps/api/src/config.ts`: environment parsing.
- `apps/api/src/db.ts`: PostgreSQL pool and query helper.
- `apps/api/src/auth.ts`: password hashing, JWT signing, auth guard.
- `apps/api/src/storage.ts`: local storage service.
- `apps/api/src/parsers.ts`: PDF, PPTX, Word, TXT, Markdown text extraction.
- `apps/api/src/chunking.ts`: text chunking with source metadata.
- `apps/api/src/providers.ts`: embedding and chat providers.
- `apps/api/src/rag.ts`: retrieval, confidence, insufficient-evidence policy, answer generation, citations.
- `apps/api/src/ingestion.ts`: document processing pipeline.
- `apps/api/src/routes.ts`: API routes.
- `apps/api/src/server.ts`: Fastify app entrypoint.
- `apps/api/src/worker.ts`: CLI worker loop.
- `apps/api/test/rag.test.ts`: focused RAG tests.
- `apps/api/test/policy.test.ts`: sensitivity and deletion policy tests.
- `apps/web/package.json`: web app manifest.
- `apps/web/index.html`: Vite entry HTML.
- `apps/web/src/main.tsx`: React entrypoint.
- `apps/web/src/App.tsx`: app shell composition.
- `apps/web/src/api.ts`: API client.
- `apps/web/src/state.ts`: session and dashboard state hooks.
- `apps/web/src/styles.css`: visual system and responsive layout.
- `apps/web/src/components/AppShell.tsx`: sidebar and topbar.
- `apps/web/src/components/Dashboard.tsx`: metrics and recent activity.
- `apps/web/src/components/KnowledgeBaseView.tsx`: knowledge base and document management.
- `apps/web/src/components/ChatView.tsx`: question flow and citations.
- `apps/web/src/components/TaskQueue.tsx`: ingestion status.
- `apps/web/src/components/Settings.tsx`: model and sensitivity settings.
- `scripts/verify-rag.mjs`: end-to-end verification script with sample files.
- `README.md`: setup and verification instructions.

## Implementation Decisions

- Use Fastify instead of NestJS for version 1 because the project is new, the API surface is focused, and Fastify keeps setup smaller.
- Use Docker Compose for PostgreSQL + pgvector on Windows.
- Use SQL migrations directly for version 1 instead of adding an ORM. The schema is explicit and pgvector operations stay transparent.
- Use deterministic local embedding and extractive local chat as the default development provider. Add OpenAI-compatible provider wiring as optional config. This keeps tests repeatable while preserving cloud-provider integration points.
- Set default insufficient-evidence threshold to `0.28` for local cosine similarity and default low-confidence threshold to `0.45`. These values are implementation defaults and can be tuned later.
- Implement minimal real login with seeded users. Do not mock auth.

---

### Task 1: Repository Runtime Foundation

**Files:**
- Create: `.gitignore`
- Create: `.env.example`
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `docker-compose.yml`
- Create: `README.md`

- [ ] **Step 1: Add ignore rules**

Create `.gitignore`:

```gitignore
node_modules/
dist/
coverage/
.env
.env.local
uploads/
.worktrees/
*.log
```

- [ ] **Step 2: Add environment template**

Create `.env.example`:

```dotenv
DATABASE_URL=postgres://postgres:postgres@localhost:5432/knowledge_amazon
JWT_SECRET=change-me-in-local-dev
UPLOAD_DIR=./uploads
MODEL_PROVIDER=local
EMBEDDING_PROVIDER=local
CHAT_PROVIDER=local
OPENAI_API_KEY=
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
OPENAI_CHAT_MODEL=gpt-4.1-mini
PORT=4000
```

- [ ] **Step 3: Add root workspace manifest**

Create `package.json`:

```json
{
  "name": "knowledge-amazon",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "workspaces": ["apps/*", "packages/*"],
  "scripts": {
    "dev": "npm-run-all --parallel dev:api dev:web",
    "dev:api": "npm --workspace apps/api run dev",
    "dev:web": "npm --workspace apps/web run dev",
    "worker": "npm --workspace apps/api run worker",
    "build": "npm --workspaces run build",
    "lint": "npm --workspaces run lint",
    "test": "npm --workspaces run test",
    "db:up": "docker compose up -d db",
    "db:down": "docker compose down",
    "verify:rag": "node scripts/verify-rag.mjs"
  },
  "devDependencies": {
    "npm-run-all": "^4.1.5",
    "typescript": "^5.8.3"
  }
}
```

- [ ] **Step 4: Add shared TypeScript config**

Create `tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  }
}
```

- [ ] **Step 5: Add PostgreSQL + pgvector Compose runtime**

Create `docker-compose.yml`:

```yaml
services:
  db:
    image: pgvector/pgvector:pg16
    container_name: knowledge_amazon_db
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: knowledge_amazon
    ports:
      - "5432:5432"
    volumes:
      - knowledge_amazon_pgdata:/var/lib/postgresql/data
      - ./database/init:/docker-entrypoint-initdb.d:ro
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d knowledge_amazon"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  knowledge_amazon_pgdata:
```

- [ ] **Step 6: Add README setup skeleton**

Create `README.md` with setup commands:

```markdown
# Knowledge Amazon

Internal enterprise knowledge base for document ingestion, RAG Q&A, citations, and sensitivity-aware processing.

## Local Setup

```powershell
Copy-Item .env.example .env
npm install
npm run db:up
npm run dev
```

API: `http://localhost:4000`

Web: `http://localhost:5173`

## Verification

```powershell
npm run build
npm run lint
npm run test
npm run verify:rag
```
```

- [ ] **Step 7: Install dependencies**

Run:

```powershell
npm install
```

Expected: `package-lock.json` is created and dependencies install without errors.

- [ ] **Step 8: Commit foundation**

Run:

```powershell
git add .gitignore .env.example package.json package-lock.json tsconfig.base.json docker-compose.yml README.md
git commit -m "chore: add project runtime foundation"
```

---

### Task 2: Database Schema and Seed Data

**Files:**
- Create: `database/init/001_schema.sql`

- [ ] **Step 1: Write schema migration**

Create `database/init/001_schema.sql` with:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('admin', 'member', 'readonly');
CREATE TYPE sensitivity_level AS ENUM ('public_internal', 'client_confidential', 'restricted');
CREATE TYPE document_status AS ENUM ('uploaded', 'processing', 'indexed', 'failed', 'needs_ocr', 'waiting_private_processing', 'soft_deleted', 'purged');
CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed');
CREATE TYPE message_role AS ENUM ('user', 'assistant');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role user_role NOT NULL DEFAULT 'member',
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'client',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid REFERENCES clients(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE knowledge_bases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL DEFAULT 'internal',
  client_id uuid REFERENCES clients(id),
  project_id uuid REFERENCES projects(id),
  visibility text NOT NULL DEFAULT 'internal',
  sensitivity sensitivity_level NOT NULL DEFAULT 'public_internal',
  allow_cloud_processing boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_base_id uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE CASCADE,
  client_id uuid REFERENCES clients(id),
  project_id uuid REFERENCES projects(id),
  uploaded_by uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  original_filename text NOT NULL,
  file_type text NOT NULL,
  storage_path text NOT NULL,
  file_size bigint NOT NULL,
  tags text[] NOT NULL DEFAULT '{}',
  sensitivity sensitivity_level NOT NULL DEFAULT 'public_internal',
  allow_cloud_processing boolean NOT NULL DEFAULT false,
  status document_status NOT NULL DEFAULT 'uploaded',
  parse_error text,
  version integer NOT NULL DEFAULT 1,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chunk_index integer NOT NULL,
  content text NOT NULL,
  source_label text NOT NULL,
  token_count integer NOT NULL,
  content_hash text NOT NULL,
  embedding_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(document_id, chunk_index)
);

CREATE TABLE embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id uuid NOT NULL UNIQUE REFERENCES document_chunks(id) ON DELETE CASCADE,
  provider text NOT NULL,
  model text NOT NULL,
  embedding vector(64) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ingestion_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  job_type text NOT NULL DEFAULT 'ingest_document',
  status job_status NOT NULL DEFAULT 'pending',
  error_message text,
  retry_count integer NOT NULL DEFAULT 0,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  title text NOT NULL,
  knowledge_base_id uuid REFERENCES knowledge_bases(id),
  client_id uuid REFERENCES clients(id),
  project_id uuid REFERENCES projects(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role message_role NOT NULL,
  content text NOT NULL,
  model text,
  confidence numeric,
  insufficient_evidence boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE citations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  document_id uuid REFERENCES documents(id) ON DELETE SET NULL,
  chunk_id uuid REFERENCES document_chunks(id) ON DELETE SET NULL,
  relevance_score numeric NOT NULL,
  cited_text text NOT NULL,
  source_label text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE model_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  model_type text NOT NULL,
  model_name text NOT NULL,
  purpose text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_documents_kb_status ON documents(knowledge_base_id, status);
CREATE INDEX idx_chunks_document ON document_chunks(document_id);
CREATE INDEX idx_embeddings_vector ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);
CREATE INDEX idx_jobs_status ON ingestion_jobs(status, created_at);

INSERT INTO users (name, email, password_hash, role)
VALUES
  ('Admin', 'admin@local.test', '$2a$10$xGcw0qXTPZQlZltqXug/W.Ef4mOQwVKOMwtrM4z7LprlONk8vt5fK', 'admin');

INSERT INTO clients (name, type) VALUES ('内部资料', 'internal');

INSERT INTO knowledge_bases (name, type, visibility, sensitivity, allow_cloud_processing)
VALUES ('内部培训知识库', 'internal', 'internal', 'public_internal', true);

INSERT INTO model_providers (provider, model_type, model_name, purpose)
VALUES
  ('local', 'embedding', 'local-hash-64', 'development embeddings'),
  ('local', 'chat', 'local-extractive', 'development grounded answers');
```

The seeded admin password is `admin123456`.

- [ ] **Step 2: Verify schema can start**

Run:

```powershell
npm run db:down
npm run db:up
```

Expected: container `knowledge_amazon_db` becomes healthy and initializes schema.

- [ ] **Step 3: Commit schema**

Run:

```powershell
git add database/init/001_schema.sql
git commit -m "feat: add knowledge base database schema"
```

---

### Task 3: Shared Types and API Foundation

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/contracts.ts`
- Create: `apps/api/package.json`
- Create: `apps/api/tsconfig.json`
- Create: `apps/api/src/config.ts`
- Create: `apps/api/src/db.ts`
- Create: `apps/api/src/server.ts`

- [ ] **Step 1: Add shared package**

Create `packages/shared/package.json`:

```json
{
  "name": "@knowledge-amazon/shared",
  "version": "0.1.0",
  "type": "module",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "lint": "tsc -p tsconfig.json --noEmit",
    "test": "vitest run --passWithNoTests"
  },
  "devDependencies": {
    "typescript": "^5.8.3",
    "vitest": "^3.2.4"
  }
}
```

Create `packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "declaration": true
  },
  "include": ["src"]
}
```

- [ ] **Step 2: Add shared domain types**

Create `packages/shared/src/types.ts`:

```ts
export type UserRole = "admin" | "member" | "readonly";
export type SensitivityLevel = "public_internal" | "client_confidential" | "restricted";
export type DocumentStatus =
  | "uploaded"
  | "processing"
  | "indexed"
  | "failed"
  | "needs_ocr"
  | "waiting_private_processing"
  | "soft_deleted"
  | "purged";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  type: string;
  visibility: string;
  sensitivity: SensitivityLevel;
  allowCloudProcessing: boolean;
  documentCount: number;
  indexedCount: number;
}

export interface DocumentRecord {
  id: string;
  knowledgeBaseId: string;
  title: string;
  originalFilename: string;
  fileType: string;
  tags: string[];
  sensitivity: SensitivityLevel;
  allowCloudProcessing: boolean;
  status: DocumentStatus;
  parseError?: string | null;
  createdAt: string;
}

export interface Citation {
  documentId: string | null;
  chunkId: string | null;
  relevanceScore: number;
  citedText: string;
  sourceLabel: string;
  documentTitle?: string;
}

export interface ChatAnswer {
  conversationId: string;
  messageId: string;
  answer: string;
  confidence: number;
  insufficientEvidence: boolean;
  citations: Citation[];
}
```

Create `packages/shared/src/contracts.ts`:

```ts
export const INSUFFICIENT_EVIDENCE_THRESHOLD = 0.28;
export const LOW_CONFIDENCE_THRESHOLD = 0.45;
export const TOP_K_CHUNKS = 8;
export const SUPPORTED_EXTENSIONS = [".pdf", ".pptx", ".ppt", ".docx", ".txt", ".md"] as const;
```

- [ ] **Step 3: Add API package foundation**

Create `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/src/config.ts`, `apps/api/src/db.ts`, and `apps/api/src/server.ts` with a Fastify health route and typed PostgreSQL pool.

- [ ] **Step 4: Run API build**

Run:

```powershell
npm install
npm --workspace apps/api run build
```

Expected: TypeScript build succeeds.

- [ ] **Step 5: Commit API foundation**

Run:

```powershell
git add packages/shared apps/api
git commit -m "feat: add API foundation"
```

---

### Task 4: Auth, Storage, Parsing, and Ingestion

**Files:**
- Create: `apps/api/src/auth.ts`
- Create: `apps/api/src/storage.ts`
- Create: `apps/api/src/parsers.ts`
- Create: `apps/api/src/chunking.ts`
- Create: `apps/api/src/providers.ts`
- Create: `apps/api/src/ingestion.ts`
- Create: `apps/api/src/worker.ts`
- Modify: `apps/api/src/server.ts`

- [ ] **Step 1: Implement minimal real login**

Implement `apps/api/src/auth.ts` with bcrypt password comparison, JWT signing, and a Fastify auth guard. The guard must reject missing or invalid tokens for document, chunk, conversation, citation, and settings routes.

- [ ] **Step 2: Implement local storage service**

Implement `apps/api/src/storage.ts` with:

```ts
export interface StoredFile {
  storagePath: string;
  size: number;
}

export interface StorageService {
  save(buffer: Buffer, filename: string): Promise<StoredFile>;
  read(storagePath: string): Promise<Buffer>;
  remove(storagePath: string): Promise<void>;
}
```

Use `UPLOAD_DIR` and UUID-prefixed filenames.

- [ ] **Step 3: Implement parsers**

Implement `apps/api/src/parsers.ts` to return:

```ts
export interface ParsedSegment {
  text: string;
  sourceLabel: string;
}
```

PDF parser extracts page text; PPTX parser extracts slide text from zipped XML; DOCX parser uses `mammoth`; TXT and Markdown read UTF-8 text.

- [ ] **Step 4: Implement chunking**

Implement `apps/api/src/chunking.ts` with deterministic chunking by segment, paragraph, and max character size. Preserve `sourceLabel`.

- [ ] **Step 5: Implement providers**

Implement `apps/api/src/providers.ts` with:

- `LocalEmbeddingProvider`: deterministic 64-dimension normalized vector from token hashes.
- `LocalChatProvider`: extractive answer from retrieved chunks with a clear "资料不足" response when instructed.
- Optional OpenAI-compatible provider selected by env variables.

- [ ] **Step 6: Implement ingestion pipeline**

Implement `apps/api/src/ingestion.ts` so a document job:

1. Marks document `processing`.
2. Blocks cloud processing for `restricted`.
3. Blocks cloud processing for `client_confidential` unless `allow_cloud_processing = true`.
4. Parses text.
5. Marks empty text as `needs_ocr`.
6. Stores chunks.
7. Stores embeddings.
8. Marks document `indexed`.
9. Saves failure reason on errors.

- [ ] **Step 7: Implement worker command**

Implement `apps/api/src/worker.ts` that processes pending jobs once with `--once`, and loops when no flag is provided.

- [ ] **Step 8: Commit ingestion foundation**

Run:

```powershell
git add apps/api/src
git commit -m "feat: add document ingestion pipeline"
```

---

### Task 5: API Routes and RAG Flow

**Files:**
- Create: `apps/api/src/routes.ts`
- Modify: `apps/api/src/server.ts`
- Create: `apps/api/src/rag.ts`
- Create: `apps/api/test/rag.test.ts`
- Create: `apps/api/test/policy.test.ts`

- [ ] **Step 1: Implement API routes**

Add authenticated routes:

- `POST /auth/login`
- `GET /me`
- `GET /dashboard`
- `GET /knowledge-bases`
- `POST /knowledge-bases`
- `GET /knowledge-bases/:id/documents`
- `POST /documents/upload`
- `GET /documents/:id`
- `POST /documents/:id/soft-delete`
- `POST /documents/:id/purge`
- `GET /jobs`
- `POST /jobs/:id/retry`
- `POST /chat`
- `GET /conversations`

- [ ] **Step 2: Implement RAG service**

Implement `apps/api/src/rag.ts`:

- Generate query embedding.
- Search top 8 chunks using cosine distance in pgvector.
- Filter by selected authorized scope.
- Return insufficient evidence when top score is below `INSUFFICIENT_EVIDENCE_THRESHOLD`.
- Return confidence score and low-confidence warning metadata.
- Persist user message, assistant message, and citations.

- [ ] **Step 3: Write focused RAG tests**

Create `apps/api/test/rag.test.ts` covering:

- In-scope question returns answer and citations.
- Out-of-scope question returns insufficient evidence.
- Soft-deleted document is not retrieved.

- [ ] **Step 4: Write sensitivity policy tests**

Create `apps/api/test/policy.test.ts` covering:

- `restricted` document is not embedded through cloud provider.
- `client_confidential` defaults to blocked cloud processing.
- `client_confidential` can be processed when admin explicitly enables cloud processing.

- [ ] **Step 5: Run API tests**

Run:

```powershell
npm --workspace apps/api run test
```

Expected: all API tests pass.

- [ ] **Step 6: Commit routes and RAG**

Run:

```powershell
git add apps/api/src apps/api/test
git commit -m "feat: add authenticated RAG API"
```

---

### Task 6: React Web App

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/vite.config.ts`
- Create: `apps/web/index.html`
- Create: `apps/web/src/main.tsx`
- Create: `apps/web/src/App.tsx`
- Create: `apps/web/src/api.ts`
- Create: `apps/web/src/state.ts`
- Create: `apps/web/src/styles.css`
- Create: `apps/web/src/components/AppShell.tsx`
- Create: `apps/web/src/components/Dashboard.tsx`
- Create: `apps/web/src/components/KnowledgeBaseView.tsx`
- Create: `apps/web/src/components/ChatView.tsx`
- Create: `apps/web/src/components/TaskQueue.tsx`
- Create: `apps/web/src/components/Settings.tsx`

- [ ] **Step 1: Scaffold Vite React app**

Create the web package with React, Vite, TypeScript, and lucide-react.

- [ ] **Step 2: Implement API client and session state**

Implement login, token storage, authenticated fetch wrapper, and hooks for dashboard, knowledge bases, jobs, upload, and chat.

- [ ] **Step 3: Implement app shell**

Build the left sidebar, top search bar, current user area, and responsive main layout matching the generated concept direction.

- [ ] **Step 4: Implement dashboard**

Show knowledge-base count, document count, indexed count, failed jobs, recent uploads, and recent Q&A.

- [ ] **Step 5: Implement knowledge base and document management**

Show knowledge base list, document table, upload form, status chips, sensitivity chips, soft-delete action, purge action for admin, and retry action for failed jobs.

- [ ] **Step 6: Implement intelligent Q&A**

Show scope selector, question input, answer panel, insufficient-evidence state, confidence reminder, and citation list with document title and source label.

- [ ] **Step 7: Implement task queue and settings**

Show parsing/indexing jobs and model/sensitivity policy summaries.

- [ ] **Step 8: Run web build**

Run:

```powershell
npm --workspace apps/web run build
```

Expected: Vite build succeeds.

- [ ] **Step 9: Commit web app**

Run:

```powershell
git add apps/web
git commit -m "feat: add knowledge base web app"
```

---

### Task 7: End-to-End Verification Script

**Files:**
- Create: `scripts/verify-rag.mjs`
- Modify: `README.md`

- [ ] **Step 1: Add verification script**

Create `scripts/verify-rag.mjs` that:

1. Logs in as `admin@local.test`.
2. Creates or finds the internal knowledge base.
3. Uploads a generated TXT/Markdown sample and a generated PPTX-like fixture if library support is available.
4. Runs the worker once.
5. Asks an in-scope question and asserts citations exist.
6. Asks an out-of-scope question and asserts insufficient evidence.
7. Soft-deletes the document and asserts it is not retrieved.
8. Creates a restricted document and asserts cloud processing is blocked.

- [ ] **Step 2: Document manual PDF/PPTX verification**

Update `README.md` with a manual verification section:

```markdown
## Manual Acceptance Checks

1. Upload a real PDF and verify it reaches `indexed`.
2. Upload a real PPTX with selectable text and verify it reaches `indexed`.
3. Ask a question grounded in the uploaded files and verify citations.
4. Ask a question outside the files and verify insufficient-evidence response.
5. Upload a scanned PDF and verify it is marked as needing OCR or failed with a clear reason.
```

- [ ] **Step 3: Run full checks**

Run:

```powershell
npm run build
npm run lint
npm run test
npm run verify:rag
```

Expected: all checks pass. If Docker is unavailable, record the blocker and run unit-level checks that do not require PostgreSQL.

- [ ] **Step 4: Commit verification**

Run:

```powershell
git add scripts/verify-rag.mjs README.md
git commit -m "test: add RAG acceptance verification"
```

---

### Task 8: Browser QA and GitHub Push

**Files:**
- Modify only files needed to fix QA issues.

- [ ] **Step 1: Start local services**

Run:

```powershell
npm run db:up
npm run dev
```

Expected: API starts on `http://localhost:4000`; web starts on `http://localhost:5173`.

- [ ] **Step 2: Verify rendered frontend**

Use Browser plugin if available; otherwise use Playwright. The flow under test is: app loads -> login -> dashboard renders -> knowledge base documents render -> chat answer shows citations and confidence.

- [ ] **Step 3: Check desktop and mobile viewport**

Verify:

- No framework overlay.
- No blank shell.
- No relevant console errors.
- Sidebar, document table, chat, and citations remain readable.
- Mobile view does not overlap or clip primary controls.

- [ ] **Step 4: Compare against generated concept**

Compare latest screenshot with:

`C:\Users\58217\.codex\generated_images\019e95f3-178e-7d43-bbe8-2d7b9c72f304\ig_02b9781232b61b96016a2260c9cd608191afe54ed2274f238d.png`

Check at least:

- Sidebar labels and structure.
- Document status and sensitivity chips.
- Chat answer and citation panel.
- Neutral/teal/amber palette.
- Compact enterprise dashboard density.

- [ ] **Step 5: Commit QA fixes**

Run:

```powershell
git status --short
git add <changed-files>
git commit -m "fix: address first-pass QA issues"
```

Only commit if QA produced code changes.

- [ ] **Step 6: Push branch**

Run:

```powershell
git push -u origin <current-branch>
```

Expected: implementation branch is pushed to GitHub.

---

## Plan Self-Review

Spec coverage:

- Document upload, parsing, chunking, embeddings, vector indexing: Tasks 2, 4, 5, 7.
- Intelligent Q&A, citations, insufficient evidence, confidence: Tasks 5, 6, 7.
- Minimal real login and roles: Tasks 2, 4, 5, 6.
- Sensitivity defaults and restricted handling: Tasks 2, 4, 5, 7.
- Docker Compose PostgreSQL + pgvector: Tasks 1, 2, 7.
- Local-to-cloud boundaries: Tasks 1, 4, 5.
- UI pages: Task 6.
- Build, lint, tests, RAG checks, browser QA: Tasks 7 and 8.

Known implementation risks:

- Real PPT/PPTX text extraction can be fragile. Version 1 extracts slide XML text and reports clear failures for image-only slides.
- Real PDF parsing may not extract scanned content. Version 1 marks no-text documents as `needs_ocr`.
- Cloud model behavior is not required for offline verification because provider interfaces and policy tests prove routing. Manual cloud validation can be added when credentials are available.
