import {
  INSUFFICIENT_EVIDENCE_THRESHOLD,
  LOW_CONFIDENCE_THRESHOLD,
  TOP_K_CHUNKS,
  type ChatAnswer,
  type Citation
} from "@knowledge-amazon/shared";
import { query, queryOne } from "./db.js";
import { createChatProvider, createEmbeddingProvider, type RetrievedContext, toSqlVector } from "./providers.js";

export interface AskQuestionInput {
  userId: string;
  question: string;
  conversationId?: string;
  knowledgeBaseId?: string;
  clientId?: string;
  projectId?: string;
}

interface RetrievedChunk {
  chunk_id: string;
  document_id: string;
  content: string;
  source_label: string;
  document_title: string;
  relevance_score: number;
}

export async function askQuestion(input: AskQuestionInput): Promise<ChatAnswer> {
  const embeddingProvider = createEmbeddingProvider();
  const queryEmbedding = await embeddingProvider.embed(input.question);
  const chunks = await retrieveChunks(queryEmbedding, input);
  const confidence = chunks[0]?.relevance_score ?? 0;
  const insufficientEvidence = confidence < INSUFFICIENT_EVIDENCE_THRESHOLD;

  const conversationId =
    input.conversationId ??
    (
      await queryOne<{ id: string }>(
        `INSERT INTO conversations (user_id, title, knowledge_base_id, client_id, project_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [
          input.userId,
          input.question.slice(0, 80) || "新会话",
          input.knowledgeBaseId ?? null,
          input.clientId ?? null,
          input.projectId ?? null
        ]
      )
    )?.id;

  if (!conversationId) {
    throw new Error("Failed to create conversation");
  }

  await query("INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2)", [
    conversationId,
    input.question
  ]);

  const contexts: RetrievedContext[] = chunks.map((chunk) => ({
    content: chunk.content,
    sourceLabel: chunk.source_label,
    documentTitle: chunk.document_title,
    relevanceScore: chunk.relevance_score
  }));

  const chatProvider = createChatProvider();
  const answer = await chatProvider.answer(input.question, contexts, insufficientEvidence);

  const assistantMessage = await queryOne<{ id: string }>(
    `INSERT INTO messages (conversation_id, role, content, model, confidence, insufficient_evidence)
     VALUES ($1, 'assistant', $2, $3, $4, $5)
     RETURNING id`,
    [conversationId, answer, chatProvider.model, confidence, insufficientEvidence]
  );

  if (!assistantMessage) {
    throw new Error("Failed to save assistant message");
  }

  const citations: Citation[] = [];
  if (!insufficientEvidence) {
    for (const chunk of chunks.slice(0, 5)) {
      const citation = await queryOne<CitationRow>(
        `INSERT INTO citations (message_id, document_id, chunk_id, relevance_score, cited_text, source_label)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING document_id, chunk_id, relevance_score, cited_text, source_label`,
        [
          assistantMessage.id,
          chunk.document_id,
          chunk.chunk_id,
          chunk.relevance_score,
          chunk.content.slice(0, 600),
          chunk.source_label
        ]
      );

      if (citation) {
        citations.push(toCitation(citation, chunk.document_title));
      }
    }
  }

  return {
    conversationId,
    messageId: assistantMessage.id,
    answer,
    confidence,
    insufficientEvidence,
    citations
  };
}

async function retrieveChunks(vector: number[], input: AskQuestionInput): Promise<RetrievedChunk[]> {
  const filters = ["d.status = 'indexed'", "d.deleted_at IS NULL"];
  const values: unknown[] = [toSqlVector(vector), TOP_K_CHUNKS];

  if (input.knowledgeBaseId) {
    values.push(input.knowledgeBaseId);
    filters.push(`d.knowledge_base_id = $${values.length}`);
  }

  if (input.clientId) {
    values.push(input.clientId);
    filters.push(`d.client_id = $${values.length}`);
  }

  if (input.projectId) {
    values.push(input.projectId);
    filters.push(`d.project_id = $${values.length}`);
  }

  return query<RetrievedChunk>(
    `SELECT
       c.id AS chunk_id,
       d.id AS document_id,
       c.content,
       c.source_label,
       d.title AS document_title,
       1 - (e.embedding <=> $1::vector) AS relevance_score
     FROM embeddings e
     JOIN document_chunks c ON c.id = e.chunk_id
     JOIN documents d ON d.id = c.document_id
     WHERE ${filters.join(" AND ")}
     ORDER BY e.embedding <=> $1::vector
     LIMIT $2`,
    values
  );
}

interface CitationRow {
  document_id: string | null;
  chunk_id: string | null;
  relevance_score: string | number;
  cited_text: string;
  source_label: string;
}

function toCitation(row: CitationRow, documentTitle?: string): Citation {
  return {
    documentId: row.document_id,
    chunkId: row.chunk_id,
    relevanceScore: Number(row.relevance_score),
    citedText: row.cited_text,
    sourceLabel: row.source_label,
    documentTitle
  };
}

export function confidenceLabel(confidence: number): "insufficient" | "low" | "high" {
  if (confidence < INSUFFICIENT_EVIDENCE_THRESHOLD) {
    return "insufficient";
  }

  if (confidence < LOW_CONFIDENCE_THRESHOLD) {
    return "low";
  }

  return "high";
}
