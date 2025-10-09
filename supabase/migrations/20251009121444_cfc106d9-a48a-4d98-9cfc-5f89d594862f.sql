-- Create engagement_insights table
CREATE TABLE IF NOT EXISTS public.engagement_insights (
  url TEXT PRIMARY KEY,
  brand_voice JSONB,
  key_messages JSONB,
  outreach_guidance JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.engagement_insights ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access to engagement_insights"
  ON public.engagement_insights
  FOR SELECT
  USING (true);

-- Allow public insert
CREATE POLICY "Allow public insert to engagement_insights"
  ON public.engagement_insights
  FOR INSERT
  WITH CHECK (true);

-- Allow public update
CREATE POLICY "Allow public update to engagement_insights"
  ON public.engagement_insights
  FOR UPDATE
  USING (true);