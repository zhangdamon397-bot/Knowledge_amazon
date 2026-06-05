import type { FastifyInstance } from "fastify";
import type { DocumentRecord, KnowledgeBase, User } from "@knowledge-amazon/shared";
import { authenticate, type AuthenticatedRequest, signToken, verifyPassword } from "./auth.js";
import { query, queryOne } from "./db.js";
import { askQuestion, confidenceLabel } from "./rag.js";
import { LocalStorageService } from "./storage.js";

const storage = new LocalStorageService();

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  app.post("/auth/login", async (request, reply) => {
    const body = request.body as { email?: string; password?: string };
    if (!body.email || !body.password) {
      return reply.code(400).send({ error: "Email and password are required" });
    }

    const userWithPassword = await queryOne<User & { password_hash: string }>(
      "SELECT id, name, email, role, password_hash FROM users WHERE email = $1 AND status = 'active'",
      [body.email]
    );

    if (!userWithPassword || !(await verifyPassword(body.password, userWithPassword.password_hash))) {
      return reply.code(401).send({ error: "Invalid email or password" });
    }

    const user: User = {
      id: userWithPassword.id,
      name: userWithPassword.name,
      email: userWithPassword.email,
      role: userWithPassword.role
    };

    return {
      token: signToken(user),
      user
    };
  });

  app.get("/me", { preHandler: authenticate }, async (request) => ({
    user: (request as AuthenticatedRequest).user
  }));

  app.get("/dashboard", { preHandler: authenticate }, async () => {
    const [summary] = await query<{
      knowledge_base_count: string;
      document_count: string;
      indexed_count: string;
      failed_count: string;
    }>(
      `SELECT
        (SELECT count(*) FROM knowledge_bases) AS knowledge_base_count,
        (SELECT count(*) FROM documents WHERE status <> 'purged') AS document_count,
        (SELECT count(*) FROM documents WHERE status = 'indexed') AS indexed_count,
        (SELECT count(*) FROM ingestion_jobs WHERE status = 'failed') AS failed_count`
    );

    return {
      knowledgeBaseCount: Number(summary.knowledge_base_count),
      documentCount: Number(summary.document_count),
      indexedCount: Number(summary.indexed_count),
      failedCount: Number(summary.failed_count)
    };
  });

  app.get("/knowledge-bases", { preHandler: authenticate }, async () => {
    const rows = await query<KnowledgeBaseRow>(
      `SELECT
        kb.id,
        kb.name,
        kb.type,
        kb.visibility,
        kb.sensitivity,
        kb.allow_cloud_processing,
        count(d.id) AS document_count,
        count(d.id) FILTER (WHERE d.status = 'indexed') AS indexed_count
       FROM knowledge_bases kb
       LEFT JOIN documents d ON d.knowledge_base_id = kb.id AND d.status <> 'purged'
       GROUP BY kb.id
       ORDER BY kb.created_at DESC`
    );

    return {
      knowledgeBases: rows.map(toKnowledgeBase)
    };
  });

  app.post("/knowledge-bases", { preHandler: authenticate }, async (request, reply) => {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "admin") {
      return reply.code(403).send({ error: "Only admins can create knowledge bases" });
    }

    const body = request.body as {
      name?: string;
      sensitivity?: string;
      allowCloudProcessing?: boolean;
    };

    if (!body.name) {
      return reply.code(400).send({ error: "Knowledge base name is required" });
    }

    const row = await queryOne<KnowledgeBaseRow>(
      `INSERT INTO knowledge_bases (name, sensitivity, allow_cloud_processing)
       VALUES ($1, $2, $3)
       RETURNING id, name, type, visibility, sensitivity, allow_cloud_processing, 0 AS document_count, 0 AS indexed_count`,
      [body.name, body.sensitivity ?? "public_internal", body.allowCloudProcessing ?? false]
    );

    return {
      knowledgeBase: row ? toKnowledgeBase(row) : null
    };
  });

  app.get("/knowledge-bases/:id/documents", { preHandler: authenticate }, async (request) => {
    const { id } = request.params as { id: string };
    const rows = await query<DocumentRow>(
      `SELECT id, knowledge_base_id, title, original_filename, file_type, tags, sensitivity,
              allow_cloud_processing, status, parse_error, created_at
       FROM documents
       WHERE knowledge_base_id = $1 AND status <> 'purged'
       ORDER BY created_at DESC`,
      [id]
    );

    return {
      documents: rows.map(toDocumentRecord)
    };
  });

  app.post("/documents/upload", { preHandler: authenticate }, async (request, reply) => {
    const user = (request as AuthenticatedRequest).user;
    if (user.role === "readonly") {
      return reply.code(403).send({ error: "Read-only users cannot upload documents" });
    }

    const parts = request.parts();
    const fields = new Map<string, string>();
    let fileBuffer: Buffer | null = null;
    let filename = "";
    let mimeType = "";

    for await (const part of parts) {
      if (part.type === "file") {
        filename = part.filename;
        mimeType = part.mimetype;
        fileBuffer = await part.toBuffer();
      } else {
        fields.set(part.fieldname, String(part.value));
      }
    }

    if (!fileBuffer || !filename) {
      return reply.code(400).send({ error: "File is required" });
    }

    const knowledgeBaseId = fields.get("knowledgeBaseId");
    if (!knowledgeBaseId) {
      return reply.code(400).send({ error: "knowledgeBaseId is required" });
    }

    const sensitivity = fields.get("sensitivity") ?? "public_internal";
    const allowCloudProcessing = fields.get("allowCloudProcessing") === "true";
    const stored = await storage.save(fileBuffer, filename);
    const document = await queryOne<{ id: string }>(
      `INSERT INTO documents
        (knowledge_base_id, uploaded_by, title, original_filename, file_type, storage_path, file_size,
         tags, sensitivity, allow_cloud_processing)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id`,
      [
        knowledgeBaseId,
        user.id,
        fields.get("title") || filename,
        filename,
        mimeType || filename.split(".").pop() || "unknown",
        stored.storagePath,
        stored.size,
        parseTags(fields.get("tags")),
        sensitivity,
        allowCloudProcessing
      ]
    );

    if (!document) {
      return reply.code(500).send({ error: "Failed to create document" });
    }

    await query("INSERT INTO ingestion_jobs (document_id) VALUES ($1)", [document.id]);

    return {
      documentId: document.id
    };
  });

  app.get("/documents/:id", { preHandler: authenticate }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const document = await queryOne<DocumentRow>(
      `SELECT id, knowledge_base_id, title, original_filename, file_type, tags, sensitivity,
              allow_cloud_processing, status, parse_error, created_at
       FROM documents
       WHERE id = $1 AND status <> 'purged'`,
      [id]
    );

    if (!document) {
      return reply.code(404).send({ error: "Document not found" });
    }

    return {
      document: toDocumentRecord(document)
    };
  });

  app.post("/documents/:id/soft-delete", { preHandler: authenticate }, async (request, reply) => {
    const user = (request as AuthenticatedRequest).user;
    if (user.role === "readonly") {
      return reply.code(403).send({ error: "Read-only users cannot delete documents" });
    }

    const { id } = request.params as { id: string };
    await query("UPDATE documents SET status = 'soft_deleted', deleted_at = now(), updated_at = now() WHERE id = $1", [
      id
    ]);
    return { ok: true };
  });

  app.post("/documents/:id/purge", { preHandler: authenticate }, async (request, reply) => {
    const user = (request as AuthenticatedRequest).user;
    if (user.role !== "admin") {
      return reply.code(403).send({ error: "Only admins can purge documents" });
    }

    const { id } = request.params as { id: string };
    const document = await queryOne<{ storage_path: string }>("SELECT storage_path FROM documents WHERE id = $1", [id]);
    if (document) {
      await storage.remove(document.storage_path);
    }
    await query("DELETE FROM document_chunks WHERE document_id = $1", [id]);
    await query("UPDATE documents SET status = 'purged', deleted_at = now(), updated_at = now() WHERE id = $1", [id]);
    return { ok: true };
  });

  app.get("/jobs", { preHandler: authenticate }, async () => {
    const jobs = await query(
      `SELECT j.id, j.document_id, d.title AS document_title, j.status, j.error_message,
              j.retry_count, j.started_at, j.ended_at, j.created_at
       FROM ingestion_jobs j
       JOIN documents d ON d.id = j.document_id
       ORDER BY j.created_at DESC
       LIMIT 100`
    );
    return { jobs };
  });

  app.post("/jobs/:id/retry", { preHandler: authenticate }, async (request, reply) => {
    const user = (request as AuthenticatedRequest).user;
    if (user.role === "readonly") {
      return reply.code(403).send({ error: "Read-only users cannot retry jobs" });
    }

    const { id } = request.params as { id: string };
    await query("UPDATE ingestion_jobs SET status = 'pending', error_message = NULL WHERE id = $1", [id]);
    return { ok: true };
  });

  app.post("/chat", { preHandler: authenticate }, async (request) => {
    const user = (request as AuthenticatedRequest).user;
    const body = request.body as {
      question: string;
      conversationId?: string;
      knowledgeBaseId?: string;
      clientId?: string;
      projectId?: string;
    };
    const answer = await askQuestion({
      userId: user.id,
      question: body.question,
      conversationId: body.conversationId,
      knowledgeBaseId: body.knowledgeBaseId,
      clientId: body.clientId,
      projectId: body.projectId
    });

    return {
      ...answer,
      confidenceLabel: confidenceLabel(answer.confidence)
    };
  });

  app.get("/conversations", { preHandler: authenticate }, async (request) => {
    const user = (request as AuthenticatedRequest).user;
    const conversations = await query(
      `SELECT id, title, knowledge_base_id, client_id, project_id, created_at, updated_at
       FROM conversations
       WHERE user_id = $1
       ORDER BY updated_at DESC
       LIMIT 50`,
      [user.id]
    );
    return { conversations };
  });
}

interface KnowledgeBaseRow {
  id: string;
  name: string;
  type: string;
  visibility: string;
  sensitivity: KnowledgeBase["sensitivity"];
  allow_cloud_processing: boolean;
  document_count: string | number;
  indexed_count: string | number;
}

interface DocumentRow {
  id: string;
  knowledge_base_id: string;
  title: string;
  original_filename: string;
  file_type: string;
  tags: string[];
  sensitivity: DocumentRecord["sensitivity"];
  allow_cloud_processing: boolean;
  status: DocumentRecord["status"];
  parse_error: string | null;
  created_at: Date | string;
}

function toKnowledgeBase(row: KnowledgeBaseRow): KnowledgeBase {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    visibility: row.visibility,
    sensitivity: row.sensitivity,
    allowCloudProcessing: row.allow_cloud_processing,
    documentCount: Number(row.document_count),
    indexedCount: Number(row.indexed_count)
  };
}

function toDocumentRecord(row: DocumentRow): DocumentRecord {
  return {
    id: row.id,
    knowledgeBaseId: row.knowledge_base_id,
    title: row.title,
    originalFilename: row.original_filename,
    fileType: row.file_type,
    tags: row.tags,
    sensitivity: row.sensitivity,
    allowCloudProcessing: row.allow_cloud_processing,
    status: row.status,
    parseError: row.parse_error,
    createdAt: new Date(row.created_at).toISOString()
  };
}

function parseTags(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}
