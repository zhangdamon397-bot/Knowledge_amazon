import { createEmbeddingProvider, toSqlVector } from "./providers.js";
import { query, queryOne } from "./db.js";
import { chunkSegments } from "./chunking.js";
import { parseDocument } from "./parsers.js";
import { LocalStorageService } from "./storage.js";

interface PendingJob {
  id: string;
  document_id: string;
  retry_count: number;
}

interface DocumentForIngestion {
  id: string;
  original_filename: string;
  storage_path: string;
  sensitivity: "public_internal" | "client_confidential" | "restricted";
  allow_cloud_processing: boolean;
}

const storage = new LocalStorageService();

export async function processNextJob(): Promise<boolean> {
  const job = await queryOne<PendingJob>(
    `UPDATE ingestion_jobs
     SET status = 'processing', started_at = now()
     WHERE id = (
       SELECT id FROM ingestion_jobs WHERE status = 'pending' ORDER BY created_at ASC LIMIT 1
     )
     RETURNING id, document_id, retry_count`
  );

  if (!job) {
    return false;
  }

  await processJob(job);
  return true;
}

export async function processJob(job: PendingJob): Promise<void> {
  try {
    const document = await queryOne<DocumentForIngestion>(
      `SELECT id, original_filename, storage_path, sensitivity, allow_cloud_processing
       FROM documents
       WHERE id = $1`,
      [job.document_id]
    );

    if (!document) {
      throw new Error(`Document not found: ${job.document_id}`);
    }

    await query("UPDATE documents SET status = 'processing', parse_error = NULL, updated_at = now() WHERE id = $1", [
      document.id
    ]);

    const embeddingProvider = createEmbeddingProvider();
    if (embeddingProvider.isCloud && !canUseCloud(document.sensitivity, document.allow_cloud_processing)) {
      await query(
        `UPDATE documents
         SET status = 'waiting_private_processing',
             parse_error = 'Cloud processing is disabled by sensitivity policy',
             updated_at = now()
         WHERE id = $1`,
        [document.id]
      );
      await completeJob(job.id);
      return;
    }

    const file = await storage.read(document.storage_path);
    const segments = await parseDocument(file, document.original_filename);
    const meaningfulSegments = segments.filter((segment) => segment.text.trim().length >= 20);

    if (meaningfulSegments.length === 0) {
      await query(
        `UPDATE documents
         SET status = 'needs_ocr',
             parse_error = 'No meaningful selectable text was extracted. OCR may be required.',
             updated_at = now()
         WHERE id = $1`,
        [document.id]
      );
      await completeJob(job.id);
      return;
    }

    const chunks = chunkSegments(meaningfulSegments);
    await query("DELETE FROM document_chunks WHERE document_id = $1", [document.id]);

    for (const chunk of chunks) {
      const inserted = await queryOne<{ id: string }>(
        `INSERT INTO document_chunks
          (document_id, chunk_index, content, source_label, token_count, content_hash, embedding_status)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending')
         RETURNING id`,
        [document.id, chunk.chunkIndex, chunk.content, chunk.sourceLabel, chunk.tokenCount, chunk.contentHash]
      );

      if (!inserted) {
        throw new Error("Failed to insert document chunk");
      }

      const embedding = await embeddingProvider.embed(chunk.content);
      await query(
        `INSERT INTO embeddings (chunk_id, provider, model, embedding)
         VALUES ($1, $2, $3, $4::vector)`,
        [inserted.id, embeddingProvider.name, embeddingProvider.model, toSqlVector(embedding)]
      );
      await query("UPDATE document_chunks SET embedding_status = 'embedded' WHERE id = $1", [inserted.id]);
    }

    await query("UPDATE documents SET status = 'indexed', updated_at = now() WHERE id = $1", [document.id]);
    await completeJob(job.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown ingestion error";
    await query(
      `UPDATE ingestion_jobs
       SET status = 'failed', error_message = $2, retry_count = retry_count + 1, ended_at = now()
       WHERE id = $1`,
      [job.id, message]
    );
    await query("UPDATE documents SET status = 'failed', parse_error = $2, updated_at = now() WHERE id = $1", [
      job.document_id,
      message
    ]);
  }
}

export function canUseCloud(
  sensitivity: "public_internal" | "client_confidential" | "restricted",
  allowCloudProcessing: boolean
): boolean {
  if (sensitivity === "public_internal") {
    return true;
  }

  if (sensitivity === "client_confidential") {
    return allowCloudProcessing;
  }

  return false;
}

async function completeJob(id: string): Promise<void> {
  await query("UPDATE ingestion_jobs SET status = 'completed', ended_at = now() WHERE id = $1", [id]);
}
