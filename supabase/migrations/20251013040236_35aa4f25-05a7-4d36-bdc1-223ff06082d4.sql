-- Add url_key column to company_news for canonical URL matching
ALTER TABLE public.company_news ADD COLUMN IF NOT EXISTS url_key text;
CREATE INDEX IF NOT EXISTS idx_company_news_url_key ON public.company_news(url_key, deleted, published_at DESC);

-- Add url_key column to company_cards
ALTER TABLE public.company_cards ADD COLUMN IF NOT EXISTS url_key text;
CREATE INDEX IF NOT EXISTS idx_company_cards_url_key ON public.company_cards(url_key);

-- Create debug table for tracking dropped news items (24h TTL)
CREATE TABLE IF NOT EXISTS public.company_news_debug (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url_key text NOT NULL,
  stage text NOT NULL,
  title text,
  link text,
  publisher text,
  published_at_raw text,
  parsed_ok boolean,
  dropped_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Index for debug queries
CREATE INDEX IF NOT EXISTS idx_company_news_debug_url_key ON public.company_news_debug(url_key, created_at DESC);

-- Auto-delete debug entries older than 24 hours
CREATE OR REPLACE FUNCTION public.cleanup_old_news_debug()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.company_news_debug
  WHERE created_at < now() - interval '24 hours';
END;
$$;

-- Enable RLS on debug table
ALTER TABLE public.company_news_debug ENABLE ROW LEVEL SECURITY;

-- Allow public read/insert on debug table
CREATE POLICY "Allow public insert to company_news_debug" ON public.company_news_debug
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public read access to company_news_debug" ON public.company_news_debug
  FOR SELECT USING (true);