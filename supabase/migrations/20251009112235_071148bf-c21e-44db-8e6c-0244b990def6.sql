-- Create pages table for tracking crawled pages
CREATE TABLE IF NOT EXISTS public.pages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  origin TEXT NOT NULL,
  path TEXT NOT NULL,
  page_type TEXT NOT NULL,
  status_code INTEGER,
  content_hash TEXT,
  content_len INTEGER,
  blocked BOOLEAN DEFAULT false,
  fetched_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Add index on url for fast lookups
CREATE INDEX IF NOT EXISTS idx_pages_url ON public.pages(url);

-- Add index on origin for filtering by domain
CREATE INDEX IF NOT EXISTS idx_pages_origin ON public.pages(origin);

-- Add index on page_type for filtering
CREATE INDEX IF NOT EXISTS idx_pages_page_type ON public.pages(page_type);

-- Add new columns to chunks table if they don't exist
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'chunks' 
                 AND column_name = 'page_id') THEN
    ALTER TABLE public.chunks ADD COLUMN page_id UUID REFERENCES public.pages(id);
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                 WHERE table_schema = 'public' 
                 AND table_name = 'chunks' 
                 AND column_name = 'source_url') THEN
    ALTER TABLE public.chunks ADD COLUMN source_url TEXT;
  END IF;
END $$;

-- Add index on page_id for joins
CREATE INDEX IF NOT EXISTS idx_chunks_page_id ON public.chunks(page_id);

-- Enable RLS on pages table
ALTER TABLE public.pages ENABLE ROW LEVEL SECURITY;

-- Allow public read access to pages
CREATE POLICY "Allow public read access to pages"
ON public.pages FOR SELECT
USING (true);

-- Allow public insert to pages
CREATE POLICY "Allow public insert to pages"
ON public.pages FOR INSERT
WITH CHECK (true);

-- Allow public update to pages
CREATE POLICY "Allow public update to pages"
ON public.pages FOR UPDATE
USING (true);