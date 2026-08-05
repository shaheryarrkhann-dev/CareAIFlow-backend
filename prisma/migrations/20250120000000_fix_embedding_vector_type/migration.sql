-- Fix embedding column type conversion from TEXT to vector
-- Guarded: pdf_embeddings is created in a later migration in this repo.

-- Step 1: Ensure pgvector extension exists
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2: Convert TEXT embedding column to vector type (only if table exists)
DO $$
DECLARE
    col_type text;
BEGIN
    IF to_regclass('public.pdf_embeddings') IS NULL THEN
        RETURN;
    END IF;

    SELECT c.data_type INTO col_type
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'pdf_embeddings'
      AND c.column_name = 'embedding';

    IF col_type = 'text' THEN
        ALTER TABLE "pdf_embeddings"
        ADD COLUMN "embedding_temp" vector(1536);

        UPDATE "pdf_embeddings"
        SET "embedding_temp" =
            CASE
                WHEN embedding ~ '^\[.*\]$' THEN
                    (embedding::jsonb)::text::vector(1536)
                ELSE
                    NULL::vector(1536)
            END;

        ALTER TABLE "pdf_embeddings" DROP COLUMN "embedding";
        ALTER TABLE "pdf_embeddings" RENAME COLUMN "embedding_temp" TO "embedding";
        ALTER TABLE "pdf_embeddings" ALTER COLUMN "embedding" SET NOT NULL;
    END IF;
END $$;

-- Step 3: Ensure column exists and is correct type
DO $$
BEGIN
    IF to_regclass('public.pdf_embeddings') IS NULL THEN
        RETURN;
    END IF;
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'pdf_embeddings'
          AND column_name = 'embedding'
          AND udt_name = 'vector'
    ) THEN
        ALTER TABLE "pdf_embeddings" ADD COLUMN "embedding" vector(1536) NOT NULL;
    END IF;
END $$;

-- Step 4: Recreate vector index
DO $$
BEGIN
    IF to_regclass('public.pdf_embeddings') IS NULL THEN
        RETURN;
    END IF;
    DROP INDEX IF EXISTS "pdf_embeddings_embedding_ivfflat_idx";
    CREATE INDEX IF NOT EXISTS "pdf_embeddings_embedding_ivfflat_idx"
      ON "pdf_embeddings"
      USING ivfflat ("embedding" vector_l2_ops)
      WITH (lists = 100);
END $$;
