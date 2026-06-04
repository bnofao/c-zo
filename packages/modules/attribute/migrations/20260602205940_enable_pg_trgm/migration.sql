-- Custom SQL migration file, put your code below! --

-- Enable trigram matching. drizzle-kit does not manage extensions, so this
-- runs as its own migration ordered BEFORE the schema migration, whose GIN
-- trigram indexes (gin_trgm_ops) depend on it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;