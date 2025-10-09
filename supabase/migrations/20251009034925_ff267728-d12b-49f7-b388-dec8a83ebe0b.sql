-- Create company_cards table
CREATE TABLE IF NOT EXISTS public.company_cards (
  url TEXT PRIMARY KEY,
  name TEXT,
  industry JSONB,
  company_size JSONB,
  hq_location JSONB,
  usp JSONB,
  offerings JSONB,
  target_audience JSONB,
  contacts JSONB,
  analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  analysis_json JSONB
);

-- Create chunks table
CREATE TABLE IF NOT EXISTS public.chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  chunk_id TEXT NOT NULL,
  text TEXT NOT NULL,
  text_offset INT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chunks_url ON public.chunks(url);

-- Create chat_logs table
CREATE TABLE IF NOT EXISTS public.chat_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  url TEXT NOT NULL,
  ts TIMESTAMPTZ DEFAULT NOW(),
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  text TEXT NOT NULL,
  citations JSONB,
  guardrail TEXT
);

CREATE INDEX IF NOT EXISTS idx_chat_logs_url ON public.chat_logs(url);

-- Enable RLS on all tables (public access for demo purposes)
ALTER TABLE public.company_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_logs ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (no authentication required)
CREATE POLICY "Allow public read access to company_cards" ON public.company_cards FOR SELECT USING (true);
CREATE POLICY "Allow public insert to company_cards" ON public.company_cards FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update to company_cards" ON public.company_cards FOR UPDATE USING (true);

CREATE POLICY "Allow public read access to chunks" ON public.chunks FOR SELECT USING (true);
CREATE POLICY "Allow public insert to chunks" ON public.chunks FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete from chunks" ON public.chunks FOR DELETE USING (true);

CREATE POLICY "Allow public read access to chat_logs" ON public.chat_logs FOR SELECT USING (true);
CREATE POLICY "Allow public insert to chat_logs" ON public.chat_logs FOR INSERT WITH CHECK (true);