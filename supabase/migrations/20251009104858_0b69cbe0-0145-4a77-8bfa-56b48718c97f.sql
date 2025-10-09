-- Create user_icp table for storing Ideal Customer Profile
CREATE TABLE public.user_icp (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id TEXT,
  icp_json JSONB NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index on owner_id for faster lookups
CREATE INDEX idx_user_icp_owner_id ON public.user_icp(owner_id);

-- Enable Row Level Security
ALTER TABLE public.user_icp ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (since we don't have auth in this demo)
CREATE POLICY "Allow public insert to user_icp" 
ON public.user_icp 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Allow public read access to user_icp" 
ON public.user_icp 
FOR SELECT 
USING (true);

CREATE POLICY "Allow public update to user_icp" 
ON public.user_icp 
FOR UPDATE 
USING (true);