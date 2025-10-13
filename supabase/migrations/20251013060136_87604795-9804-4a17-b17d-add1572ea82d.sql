-- Create company news summaries cache table
CREATE TABLE IF NOT EXISTS public.company_news_summaries (
  url_key text PRIMARY KEY,
  company_name text,
  summary text,
  groups jsonb,
  sources text[],
  article_count int DEFAULT 0,
  generated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cns_generated_at ON public.company_news_summaries(generated_at DESC);

-- Enable RLS
ALTER TABLE public.company_news_summaries ENABLE ROW LEVEL SECURITY;

-- Allow public read/write (same pattern as other tables)
CREATE POLICY "Allow public read access to company_news_summaries"
  ON public.company_news_summaries FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert to company_news_summaries"
  ON public.company_news_summaries FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update to company_news_summaries"
  ON public.company_news_summaries FOR UPDATE
  USING (true);