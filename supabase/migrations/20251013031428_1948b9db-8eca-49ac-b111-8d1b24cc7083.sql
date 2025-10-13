-- Create company_news table for storing news/updates about analyzed companies
CREATE TABLE public.company_news (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text NOT NULL,
  source text NOT NULL,
  title text NOT NULL,
  summary text NOT NULL,
  quote text,
  link text,
  published_at timestamptz NOT NULL,
  relevance numeric NOT NULL DEFAULT 0,
  reason text,
  deleted boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Add index on url for faster lookups
CREATE INDEX idx_company_news_url ON public.company_news(url);

-- Enable RLS
ALTER TABLE public.company_news ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access to company_news"
ON public.company_news
FOR SELECT
USING (true);

-- Allow public insert
CREATE POLICY "Allow public insert to company_news"
ON public.company_news
FOR INSERT
WITH CHECK (true);

-- Allow public update (for delete flag)
CREATE POLICY "Allow public update to company_news"
ON public.company_news
FOR UPDATE
USING (true);