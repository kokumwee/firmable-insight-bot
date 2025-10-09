-- Create unverified_suggestions table
CREATE TABLE public.unverified_suggestions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  url TEXT NOT NULL,
  field TEXT NOT NULL,
  suggestion TEXT NOT NULL,
  rationale TEXT NOT NULL,
  confidence TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index on url for faster lookups
CREATE INDEX idx_unverified_suggestions_url ON public.unverified_suggestions(url);

-- Enable Row Level Security
ALTER TABLE public.unverified_suggestions ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (consistent with other tables)
CREATE POLICY "Allow public read access to unverified_suggestions"
ON public.unverified_suggestions
FOR SELECT
USING (true);

CREATE POLICY "Allow public insert to unverified_suggestions"
ON public.unverified_suggestions
FOR INSERT
WITH CHECK (true);