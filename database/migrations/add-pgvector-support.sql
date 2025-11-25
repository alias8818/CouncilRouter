-- Migration: Add pgvector support for negotiation_examples
-- This migration converts the JSONB embedding column to native VECTOR type
-- for improved performance on similarity searches

-- Prerequisites:
-- 1. Install pgvector extension: CREATE EXTENSION IF NOT EXISTS vector;
-- 2. Ensure PostgreSQL version >= 11

-- Step 1: Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Step 2: Add new VECTOR column
ALTER TABLE negotiation_examples
ADD COLUMN embedding_vector VECTOR(1536);

-- Step 3: Migrate existing JSONB embeddings to VECTOR format
-- This converts the JSONB array to native vector type
UPDATE negotiation_examples
SET embedding_vector = (
  SELECT ('['||string_agg(value::text, ',')||']')::vector
  FROM jsonb_array_elements_text(embedding)
)
WHERE embedding IS NOT NULL;

-- Step 4: Create vector similarity index (IVFFlat for large datasets)
-- Adjust 'lists' parameter based on your dataset size:
-- - Small (<10k rows): lists = rows / 1000
-- - Medium (10k-1M): lists = sqrt(rows)
-- - Large (>1M): lists = sqrt(rows) * 2
CREATE INDEX IF NOT EXISTS idx_negotiation_examples_embedding_vector
ON negotiation_examples
USING ivfflat (embedding_vector vector_cosine_ops)
WITH (lists = 100);

-- Step 5: Drop old JSONB column (optional - keep for backward compatibility if needed)
-- Uncomment the following line if you want to remove the JSONB column:
-- ALTER TABLE negotiation_examples DROP COLUMN embedding;

-- Step 6: Update application queries to use vector column
-- Application code should now query:
--   SELECT * FROM negotiation_examples
--   ORDER BY embedding_vector <=> $1::vector
--   LIMIT 5;
-- Instead of:
--   SELECT * FROM negotiation_examples
--   ORDER BY (1 - (embedding <-> $1::jsonb)) DESC
--   LIMIT 5;

-- Performance notes:
-- 1. IVFFlat index requires VACUUM ANALYZE after bulk inserts
-- 2. For exact nearest neighbor search, use: SET ivfflat.probes = lists;
-- 3. For faster approximate search, use: SET ivfflat.probes = 10;

-- Rollback instructions (if needed):
-- DROP INDEX IF EXISTS idx_negotiation_examples_embedding_vector;
-- ALTER TABLE negotiation_examples DROP COLUMN IF EXISTS embedding_vector;
-- DROP EXTENSION IF EXISTS vector;

COMMIT;
