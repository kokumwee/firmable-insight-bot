-- Create customers table
CREATE TABLE IF NOT EXISTS public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  url text UNIQUE,
  name text NOT NULL,
  industry jsonb,
  company_size jsonb,
  hq_location jsonb,
  usp jsonb,
  offerings_bulleted jsonb,
  target_audience_list jsonb,
  tone_summary text,
  keywords_top jsonb,
  last_contacted_at timestamptz,
  recently_updated boolean DEFAULT false,
  linkedin_summary text,
  notes text,
  tags text[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create outreach_tasks table
CREATE TABLE IF NOT EXISTS public.outreach_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid REFERENCES public.customers(id) ON DELETE CASCADE NOT NULL,
  reason text NOT NULL,
  recommended_at date NOT NULL DEFAULT CURRENT_DATE,
  status text DEFAULT 'open' CHECK (status IN ('open', 'done', 'snoozed')),
  snooze_until date,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outreach_tasks ENABLE ROW LEVEL SECURITY;

-- RLS policies for customers (public access for demo)
CREATE POLICY "Allow public read access to customers"
  ON public.customers FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert to customers"
  ON public.customers FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update to customers"
  ON public.customers FOR UPDATE
  USING (true);

CREATE POLICY "Allow public delete from customers"
  ON public.customers FOR DELETE
  USING (true);

-- RLS policies for outreach_tasks (public access for demo)
CREATE POLICY "Allow public read access to outreach_tasks"
  ON public.outreach_tasks FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert to outreach_tasks"
  ON public.outreach_tasks FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update to outreach_tasks"
  ON public.outreach_tasks FOR UPDATE
  USING (true);

CREATE POLICY "Allow public delete from outreach_tasks"
  ON public.outreach_tasks FOR DELETE
  USING (true);

-- Create trigger to update customers updated_at
CREATE TRIGGER update_customers_updated_at
  BEFORE UPDATE ON public.customers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_shortlist_updated_at();

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_customers_url ON public.customers(url);
CREATE INDEX IF NOT EXISTS idx_customers_last_contacted ON public.customers(last_contacted_at);
CREATE INDEX IF NOT EXISTS idx_customers_recently_updated ON public.customers(recently_updated);
CREATE INDEX IF NOT EXISTS idx_outreach_tasks_customer_id ON public.outreach_tasks(customer_id);
CREATE INDEX IF NOT EXISTS idx_outreach_tasks_recommended_at ON public.outreach_tasks(recommended_at);
CREATE INDEX IF NOT EXISTS idx_outreach_tasks_status ON public.outreach_tasks(status);