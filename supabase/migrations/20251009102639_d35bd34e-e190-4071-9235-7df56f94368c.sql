-- Add path and page_type to chunks table for multi-page crawling
ALTER TABLE public.chunks 
ADD COLUMN IF NOT EXISTS path text,
ADD COLUMN IF NOT EXISTS page_type text;

-- Add index for faster queries by page_type
CREATE INDEX IF NOT EXISTS idx_chunks_page_type ON public.chunks(page_type);

-- Add index for url + path combination
CREATE INDEX IF NOT EXISTS idx_chunks_url_path ON public.chunks(url, path);