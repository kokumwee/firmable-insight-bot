-- Create page_cache table for caching successful fetches
CREATE TABLE IF NOT EXISTS public.page_cache (
  url text PRIMARY KEY,
  fetched_at timestamp with time zone NOT NULL DEFAULT now(),
  html text NOT NULL,
  status integer NOT NULL,
  diagnostic jsonb DEFAULT '{}'::jsonb
);

-- Enable RLS
ALTER TABLE public.page_cache ENABLE ROW LEVEL SECURITY;

-- Allow public read/write access for the cache
CREATE POLICY "Allow public insert to page_cache"
  ON public.page_cache
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public read access to page_cache"
  ON public.page_cache
  FOR SELECT
  USING (true);

CREATE POLICY "Allow public update to page_cache"
  ON public.page_cache
  FOR UPDATE
  USING (true);

-- Add index for faster lookups by fetch time
CREATE INDEX IF NOT EXISTS idx_page_cache_fetched_at ON public.page_cache(fetched_at DESC);