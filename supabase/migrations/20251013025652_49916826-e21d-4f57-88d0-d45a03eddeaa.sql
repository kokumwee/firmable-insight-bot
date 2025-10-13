-- Create table for company profile (single row per workspace)
CREATE TABLE public.my_company_profile (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text,
  industry text,
  description text,
  target_audience text,
  value_proposition text,
  tone text,
  keywords text[] DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.my_company_profile ENABLE ROW LEVEL SECURITY;

-- Allow public access (single workspace, no auth required for demo)
CREATE POLICY "Allow public read access to my_company_profile"
ON public.my_company_profile FOR SELECT USING (true);

CREATE POLICY "Allow public insert to my_company_profile"
ON public.my_company_profile FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow public update to my_company_profile"
ON public.my_company_profile FOR UPDATE USING (true);