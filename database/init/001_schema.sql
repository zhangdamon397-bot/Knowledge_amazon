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
VALUES ('Admin', 'admin@local.test', '$2b$10$K9LNgncSE/A5OVg2Aiv4A.arv.UsIaV0rswRiake4CVR91V3WqrQO', 'admin');

INSERT INTO clients (name, type)
VALUES ('内部资料', 'internal');

INSERT INTO knowledge_bases (name, type, visibility, sensitivity, allow_cloud_processing)
VALUES ('内部培训知识库', 'internal', 'internal', 'public_internal', true);

INSERT INTO model_providers (provider, model_type, model_name, purpose)
VALUES
  ('local', 'embedding', 'local-hash-64', 'development embeddings'),
  ('local', 'chat', 'local-extractive', 'development grounded answers');
