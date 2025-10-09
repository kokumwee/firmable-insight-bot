-- Create market_neighbors table to cache neighbor suggestions
CREATE TABLE IF NOT EXISTS public.market_neighbors (
  url text PRIMARY KEY,
  neighbors jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.market_neighbors ENABLE ROW LEVEL SECURITY;

-- Allow public read access
CREATE POLICY "Allow public read access to market_neighbors"
  ON public.market_neighbors
  FOR SELECT
  USING (true);

-- Allow public insert
CREATE POLICY "Allow public insert to market_neighbors"
  ON public.market_neighbors
  FOR INSERT
  WITH CHECK (true);

-- Allow public update
CREATE POLICY "Allow public update to market_neighbors"
  ON public.market_neighbors
  FOR UPDATE
  USING (true);