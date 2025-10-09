-- Add resolvers metadata to company_cards
ALTER TABLE company_cards
ADD COLUMN IF NOT EXISTS resolvers JSONB DEFAULT '{}'::jsonb;

-- Add metadata and JSON-LD columns to pages
ALTER TABLE pages
ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS jsonld JSONB DEFAULT '[]'::jsonb;

COMMENT ON COLUMN company_cards.resolvers IS 'Tracks which resolver strategy won for each field';
COMMENT ON COLUMN pages.meta IS 'Parsed HTML metadata (title, description, og tags)';
COMMENT ON COLUMN pages.jsonld IS 'Parsed JSON-LD structured data blocks';