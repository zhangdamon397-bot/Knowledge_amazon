# Enterprise Knowledge Base Design

Date: 2026-06-05

Project root: `D:\codex\亚马逊项目`

## Decision

Build a new internal enterprise knowledge base from scratch. Prior attempts and historical architecture notes are references only, not inherited constraints.

The first version should be a real RAG knowledge base, not a visual-only prototype. It should ingest existing PDF, PPT/PPTX, Word, TXT, and Markdown materials, index them, answer questions from the indexed content, and show citations.

The architecture should follow enterprise-grade boundaries, but the first implementation should stay small: one deployable web application, one database, local file storage through an abstraction, and a worker process for ingestion.

## Goals

- Support internal team use only in version 1.
- Prioritize document ingestion and intelligent Q&A.
- Support real PDF and PPT/PPTX training materials from the first version.
- Preserve source citations for answers.
- Support a hybrid AI strategy: cloud AI services for normal internal content, with sensitivity fields and routing boundaries for future private processing.
- Use secure defaults for sensitive material: customer-confidential content is not sent to cloud AI unless an administrator explicitly enables it.
- Start on a local machine or LAN, then migrate to a cloud server when mature.
- Design boundaries so the system can evolve toward a heavier enterprise version without a full rewrite.

## Non-Goals

- Customer login or customer portal.
- Multi-company SaaS billing.
- Complex document approval workflows.
- Private model deployment in version 1.
- OCR for scanned PDFs in version 1.
- Image understanding for PPT screenshots or diagrams in version 1.
- Excel business-data analytics in the RAG pipeline.
- SSO, high availability, cluster deployment, or complete audit logging in version 1.
- Mixing structured business data such as ad tables and profit reports directly into document RAG.

## Product Scope

Version 1 includes:

- Knowledge base management.
- Document upload with metadata.
- Document parsing, chunking, embedding, and vector indexing.
- Question answering over selected knowledge-base scopes.
- Citation display under each answer.
- Lightweight client and project ownership fields.
- Sensitivity levels for future cloud/private processing decisions.
- Visible ingestion status and failure reasons.

Version 1 intentionally keeps management lightweight because the team and project count are still small.

## User Flow

1. A team member creates or selects a knowledge base.
2. The member uploads documents and chooses metadata:
   - Knowledge base
   - Client or project if applicable
   - Tags
   - Sensitivity level
   - Whether to index immediately
3. The system saves the original file and creates a document record.
4. The worker parses, chunks, embeds, and indexes the document.
5. The document status becomes indexed, failed, or waiting for OCR/private processing.
6. A team member asks a question in a selected scope.
7. The system retrieves relevant chunks, asks the LLM to answer from those chunks, and saves citations.
8. The UI shows the answer and citation sources.

## Architecture

Use a modular monolith for version 1. This keeps deployment simple while preserving boundaries for future enterprise growth.

Main modules:

- Web UI: document upload, knowledge-base management, ingestion status, chat, citations, and settings.
- Backend API: users, clients, projects, knowledge bases, documents, ingestion jobs, conversations, messages, citations, and model configuration.
- Database: PostgreSQL with pgvector.
- Storage service: local filesystem in version 1, replaceable with object storage later.
- Worker: asynchronous ingestion pipeline.
- Document parsers: file-type-specific text extraction.
- Embedding provider: cloud provider first, replaceable by private embedding service later.
- Vector search provider: pgvector first, replaceable by Qdrant or Milvus later.
- LLM provider: cloud chat model first, replaceable or routable later.
- RAG service: retrieval, context assembly, answer generation, and citation persistence.

Do not start with microservices. If the system later needs separation, split document processing and model calls first.

## Recommended Technology

- Frontend: React + Vite.
- Backend: Node.js with Fastify or NestJS.
- Database: PostgreSQL + pgvector.
- Storage: local directory behind a `StorageService` interface.
- Background jobs: database-backed job table plus worker process in version 1.
- AI integration: provider abstractions for embedding and chat.
- Deployment: local machine or LAN first, then cloud server.
- Local runtime: Docker Compose should run PostgreSQL with pgvector for version 1.

Final package choices should be made during implementation planning after checking current library support and Windows compatibility.

## Core Data Model

### `users`

Internal users. Fields include name, email, role, status, and timestamps.

### `clients`

Client or organization boundary. Also supports an internal client-like record for internal training materials.

### `projects`

Specific project or business topic under a client.

### `knowledge_bases`

Knowledge-base records. Fields include name, type, client ownership, project ownership, visibility, sensitivity level, and timestamps.

### `documents`

Original uploaded documents. Fields include original filename, file type, storage path, size, uploader, knowledge base, client, project, tags, sensitivity level, parse status, index status, version, and timestamps.

### `document_chunks`

Searchable text chunks. Fields include document ID, chunk index, text content, page or slide information, section information, token count, embedding status, hash, and timestamps.

### `embeddings`

Vector records for chunks when using pgvector. Fields include chunk ID, provider, model, vector, and timestamps.

### `conversations`

Question-answer sessions. Fields include user ID, selected knowledge-base scope, client scope, project scope, title, and timestamps.

### `messages`

Conversation messages. Fields include conversation ID, role, question or answer text, model used, retrieval scope, and timestamps.

### `citations`

Answer citations. Fields include message ID, document ID, chunk ID, relevance score, cited text, page or slide information, and section information.

### `ingestion_jobs`

Document processing jobs. Fields include job type, document ID, status, error message, retry count, start time, end time, and timestamps.

### `model_providers`

Model configuration. Fields include provider, model type, model name, purpose, enabled status, and configuration references.

## Roles and Access

Version 1 uses minimal real login and simple internal roles:

- Admin: manage all knowledge bases, documents, settings, and users.
- Member: view, upload, ask questions, and manage allowed knowledge bases.
- Read-only: view and ask questions in allowed knowledge bases.

Every API request that reads documents, chunks, conversations, or citations must have a real authenticated user. Version 1 does not need customer users, field-level permissions, password reset, user invitation workflows, or SSO.

## Sensitivity Levels

Use sensitivity from the first version:

- `public_internal`: normal internal material, allowed to use cloud embedding and cloud chat.
- `client_confidential`: client material, access-limited; cloud embedding and cloud chat are disabled by default. An administrator must explicitly enable cloud processing at the knowledge-base or document level.
- `restricted`: high-sensitivity material; version 1 should not send it to cloud embedding or cloud chat.

Restricted documents may be stored and shown as waiting for private processing, but should not be indexed through cloud providers. Customer-confidential documents follow the same blocked-by-default behavior until an administrator opts in to cloud processing.

## Ingestion Pipeline

1. Save uploaded file through `StorageService`.
2. Create a `documents` record.
3. Create an `ingestion_jobs` record with `pending` status.
4. Worker claims the job and marks it `processing`.
5. Extract text by file type:
   - PDF: extract text and page information.
   - PPT/PPTX: extract slide text and slide numbers.
   - Word: extract body text and headings.
   - TXT/Markdown: read text directly.
6. If no meaningful text is extracted, mark the document as needing OCR or failed with a clear reason.
7. Chunk text by heading, page or slide, paragraph, and token size.
8. Store chunks in `document_chunks`.
9. Generate embeddings according to sensitivity policy.
10. Store vectors in pgvector.
11. Mark the document indexed.
12. On failure, save error reason and retry metadata.

## RAG Q&A Flow

1. User selects a retrieval scope:
   - All internal materials
   - A knowledge base
   - A client
   - A project
2. User asks a question.
3. System creates a query embedding.
4. System searches vectors only within the selected and authorized scope.
5. System retrieves top relevant chunks, initially top 5 to 8.
6. System builds an LLM prompt with:
   - Question
   - Retrieved chunks
   - Document titles
   - Page, slide, or section source information
   - Instruction to answer only from supplied sources
7. LLM generates the answer.
8. System saves the answer and citation records.
9. UI displays the answer and cited documents or chunks.
10. If retrieval relevance is too low, the system returns an insufficient-evidence response instead of asking the LLM to answer freely.
11. The UI shows a confidence indicator based on retrieval score so users can see whether an answer is strongly or weakly grounded.

## Pages

### Dashboard

Shows knowledge-base count, document count, indexed count, failed jobs, recent uploads, and recent Q&A.

### Knowledge Base List

Shows name, type, client or project ownership, document count, index status, and sensitivity level.

### Knowledge Base Detail

Shows document list, upload action, tag filters, status filters, failed retries, and document detail links.

### Document Detail

Shows metadata, parse status, index status, chunk count, errors, and citation history.

### Upload

Requires knowledge base, optional client or project, tags, sensitivity level, and immediate-index choice.

### Intelligent Q&A

Includes conversation list, chat area, scope selector, and citation display.

### Task Queue

Shows parsing, chunking, embedding, indexing, failed jobs, and retry actions.

### Settings

Stores model configuration, parsing configuration, and sensitivity handling rules.

## Error Handling

- Unsupported file type: reject with a clear message.
- Empty text extraction: mark as needing OCR or failed.
- Embedding provider failure: mark job failed and allow retry.
- LLM provider failure: show failure in chat without losing the question.
- Restricted document cloud attempt: block and show policy reason.
- Document deletion: use two-level deletion. Normal deletion is soft deletion and removes the document from future retrieval while preserving history. Admin purge physically removes the original file, chunks, and embeddings; historical citations should display that the source was deleted.

## Verification Criteria

Version 1 is successful when:

- A real PDF can be uploaded and reaches indexed status.
- A real PPTX can be uploaded and reaches indexed status when text is extractable.
- A question about indexed PDF/PPTX content returns an answer based on the document.
- The answer displays source document and page, slide, or chunk information.
- A question outside the uploaded materials returns an insufficient-evidence response.
- A low-confidence answer displays a confidence reminder based on retrieval score.
- A scanned PDF or unparseable document shows a visible failure or OCR-needed state.
- Soft-deleting a document removes it from future retrieval while preserving history; admin purge physically removes the file, chunks, and embeddings.
- A restricted document is not sent to cloud embedding or chat.
- A client-confidential document is not sent to cloud embedding or chat unless an administrator explicitly enables cloud processing.
- Restarting the application keeps documents, indexing status, and conversations.
- Version 1 runs locally with Docker Compose for PostgreSQL + pgvector.
- Version 1 uses minimal real login for admin, member, and read-only roles.
- Build, lint, and focused RAG checks pass.

## Evolution Path

### Version 1: Local Real RAG

Implement upload, parsing, chunking, vector indexing, Q&A, citations, lightweight ownership, and sensitivity policy.

### Version 2: LAN Team Use

Add stronger login, role management, batch upload, better retry controls, and backup workflow.

### Version 3: Cloud Server

Separate database, file storage, backend service, and worker deployment. Add HTTPS, backups, access control, and operational monitoring.

### Version 4: Enterprise Enhancements

Add audit logs, fine-grained permissions, model routing, private processing for sensitive materials, OCR, SSO, and alerting.

## Open Implementation Decisions

These decisions are intentionally left for the implementation plan:

- Fastify versus NestJS.
- Exact document parsing libraries for PDF, PPTX, and Word.
- Initial cloud model provider.
- Initial retrieval threshold values for insufficient-evidence and confidence display.

## Approval State

The product scope, architecture, data model, ingestion flow, Q&A flow, page structure, implementation boundary, and verification criteria were reviewed conversationally and approved before writing this spec.
