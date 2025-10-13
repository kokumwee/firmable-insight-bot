-- Add clustering support to company_news
ALTER TABLE public.company_news
ADD COLUMN IF NOT EXISTS cluster_id text,
ADD COLUMN IF NOT EXISTS sources jsonb DEFAULT '[]'::jsonb;

-- Make quote nullable (already is, but explicit)
ALTER TABLE public.company_news
ALTER COLUMN quote DROP NOT NULL;

-- Add index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_company_news_url_deleted_published 
ON public.company_news(url, deleted, published_at DESC);