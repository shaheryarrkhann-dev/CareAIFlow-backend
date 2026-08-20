-- Enable pgvector extension (requires superuser privileges once per DB)
CREATE EXTENSION IF NOT EXISTS vector;

-- Create table to store PDF chunk embeddings with tenant isolation
-- Note: using TEXT ids to align with existing schema; Prisma will interact via $executeRaw
CREATE TABLE IF NOT EXISTS "pdf_embeddings" (
  "id" TEXT PRIMARY KEY,
  "tenantId" TEXT NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "fileName" TEXT,
  "content" TEXT NOT NULL,
  -- Using dimension 1536 (OpenAI text-embedding-3-small). Adjust if you switch models.
  "embedding" vector(1536) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Helpful indexes
CREATE INDEX IF NOT EXISTS "pdf_embeddings_tenantId_idx" ON "pdf_embeddings"("tenantId");

-- IVF Flat index for fast ANN within tenant; requires pgvector >= 0.4.0
-- You may tune "lists" based on data size (e.g., 100, 1000)
CREATE INDEX IF NOT EXISTS "pdf_embeddings_embedding_ivfflat_idx"
  ON "pdf_embeddings"
  USING ivfflat ("embedding" vector_l2_ops)
  WITH (lists = 100);


