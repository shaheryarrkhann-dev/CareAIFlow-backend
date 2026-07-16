-- Fix embedding column type conversion from TEXT to vector
-- This migration handles the conversion of existing TEXT data to vector type

-- Step 1: Ensure pgvector extension exists
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2: Convert TEXT embedding column to vector type
-- Since PostgreSQL cannot auto-cast TEXT to vector, we need to:
-- 1. Create a temporary column with vector type
-- 2. Convert TEXT data to vector format (if possible)
-- 3. Drop old column and rename new one

DO $$
DECLARE
    col_type text;
BEGIN
    -- Check current column type
    SELECT data_type INTO col_type
    FROM information_schema.columns
    WHERE table_name = 'pdf_embeddings' 
    AND column_name = 'embedding';
    
    -- Only proceed if column is TEXT type
    IF col_type = 'text' THEN
        -- Add temporary vector column
        ALTER TABLE "pdf_embeddings" 
        ADD COLUMN "embedding_temp" vector(1536);
        
        -- Try to convert existing TEXT data to vector
        -- If data is JSON array format, convert it
        UPDATE "pdf_embeddings"
        SET "embedding_temp" = 
            CASE 
                WHEN embedding ~ '^\[.*\]$' THEN
                    -- Parse JSON array and convert to vector
                    (embedding::jsonb)::text::vector(1536)
                ELSE
                    -- If not JSON array, set to NULL (data will be lost)
                    NULL::vector(1536)
            END;
        
        -- Drop old TEXT column
        ALTER TABLE "pdf_embeddings" DROP COLUMN "embedding";
        
        -- Rename temp column to original name
        ALTER TABLE "pdf_embeddings" RENAME COLUMN "embedding_temp" TO "embedding";
        
        -- Make it NOT NULL (existing rows with NULL will need to be handled)
        ALTER TABLE "pdf_embeddings" ALTER COLUMN "embedding" SET NOT NULL;
    END IF;
END $$;

-- Step 3: Ensure column exists and is correct type
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'pdf_embeddings' 
        AND column_name = 'embedding'
        AND udt_name = 'vector'
    ) THEN
        -- Column doesn't exist or is wrong type, create it
        ALTER TABLE "pdf_embeddings" ADD COLUMN "embedding" vector(1536) NOT NULL;
    END IF;
END $$;

-- Step 4: Recreate vector index
DROP INDEX IF EXISTS "pdf_embeddings_embedding_ivfflat_idx";
CREATE INDEX IF NOT EXISTS "pdf_embeddings_embedding_ivfflat_idx"
  ON "pdf_embeddings"
  USING ivfflat ("embedding" vector_l2_ops)
  WITH (lists = 100);

