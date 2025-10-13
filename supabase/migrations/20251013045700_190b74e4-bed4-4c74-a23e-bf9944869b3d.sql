-- Add url_key to customers table
ALTER TABLE public.customers ADD COLUMN IF NOT EXISTS url_key text;

-- Populate url_key for existing rows
UPDATE public.customers
SET url_key = regexp_replace(regexp_replace(url, '^https?://(www\.)?', ''), '/.*$', '')
WHERE url_key IS NULL AND url IS NOT NULL;

-- Add index for url_key lookups
CREATE INDEX IF NOT EXISTS idx_customers_url_key ON public.customers(url_key);

-- Ensure outreach_tasks has all required columns
ALTER TABLE public.outreach_tasks
  ADD COLUMN IF NOT EXISTS customer_id uuid,
  ADD COLUMN IF NOT EXISTS recommended_at date,
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'open',
  ADD COLUMN IF NOT EXISTS reason_code text,
  ADD COLUMN IF NOT EXISTS priority int,
  ADD COLUMN IF NOT EXISTS news_cluster_ids text[];

-- Create unique index for one task per customer per day
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'uniq_outreach_customer_day'
  ) THEN
    CREATE UNIQUE INDEX uniq_outreach_customer_day
    ON public.outreach_tasks (customer_id, recommended_at);
  END IF;
END$$;

-- Add url_key to company_news if not exists
ALTER TABLE public.company_news ADD COLUMN IF NOT EXISTS url_key text;

-- Create index for company_news lookups
CREATE INDEX IF NOT EXISTS idx_company_news_urlkey_date 
ON public.company_news(url_key, deleted, published_at DESC);