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

## Seed Login

- Email: `admin@local.test`
- Password: `admin123456`

## Manual Acceptance Checks

1. Upload a real PDF and verify it reaches `indexed`.
2. Upload a real PPTX with selectable text and verify it reaches `indexed`.
3. Ask a question grounded in the uploaded files and verify citations.
4. Ask a question outside the files and verify an insufficient-evidence response.
5. Upload a scanned PDF and verify it is marked as needing OCR or failed with a clear reason.
6. Mark a document as `client_confidential` and verify cloud processing stays disabled unless explicitly enabled.
7. Soft-delete a document and verify it no longer appears in retrieval.
