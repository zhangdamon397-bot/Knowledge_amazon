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
