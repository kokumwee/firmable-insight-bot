-- Create shortlist table for saved companies
CREATE TABLE IF NOT EXISTS public.shortlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL UNIQUE,
  name TEXT,
  industry JSONB,
  company_size JSONB,
  hq_location JSONB,
  usp JSONB,
  offerings_bulleted JSONB,
  target_audience_list JSONB,
  contacts JSONB,
  tone_summary TEXT,
  keywords_top JSONB,
  avg_confidence TEXT,
  icp_fit TEXT,
  tags TEXT[],
  notes TEXT,
  analyzed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create index on url for faster lookups
CREATE INDEX IF NOT EXISTS idx_shortlist_url ON public.shortlist(url);

-- Create index on created_at for sorting
CREATE INDEX IF NOT EXISTS idx_shortlist_created_at ON public.shortlist(created_at DESC);

-- Create shortlist_history table for audit trail
CREATE TABLE IF NOT EXISTS public.shortlist_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  shortlist_url TEXT NOT NULL,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index on shortlist_url for history lookups
CREATE INDEX IF NOT EXISTS idx_shortlist_history_url ON public.shortlist_history(shortlist_url);

-- Enable RLS
ALTER TABLE public.shortlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shortlist_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for shortlist (public access for now)
CREATE POLICY "Allow public read access to shortlist"
ON public.shortlist
FOR SELECT
USING (true);

CREATE POLICY "Allow public insert to shortlist"
ON public.shortlist
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Allow public update to shortlist"
ON public.shortlist
FOR UPDATE
USING (true);

CREATE POLICY "Allow public delete from shortlist"
ON public.shortlist
FOR DELETE
USING (true);

-- RLS policies for shortlist_history
CREATE POLICY "Allow public read access to shortlist_history"
ON public.shortlist_history
FOR SELECT
USING (true);

CREATE POLICY "Allow public insert to shortlist_history"
ON public.shortlist_history
FOR INSERT
WITH CHECK (true);

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_shortlist_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_shortlist_updated_at
BEFORE UPDATE ON public.shortlist
FOR EACH ROW
EXECUTE FUNCTION public.update_shortlist_updated_at();