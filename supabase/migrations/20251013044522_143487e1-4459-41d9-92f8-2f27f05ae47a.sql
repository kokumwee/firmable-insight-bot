-- Add columns to outreach_tasks for news-driven engagement
ALTER TABLE public.outreach_tasks
ADD COLUMN IF NOT EXISTS reason_code text,
ADD COLUMN IF NOT EXISTS priority integer,
ADD COLUMN IF NOT EXISTS news_cluster_ids text[];

-- Add index for faster queries
CREATE INDEX IF NOT EXISTS idx_outreach_tasks_recommended_at 
ON public.outreach_tasks(recommended_at DESC, priority ASC);