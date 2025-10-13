-- Add why_it_matters to company_news_summaries
ALTER TABLE company_news_summaries
  ADD COLUMN IF NOT EXISTS why_it_matters text;

-- Add news_relevance_reason to outreach_tasks
ALTER TABLE outreach_tasks
  ADD COLUMN IF NOT EXISTS news_relevance_reason text;

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_outreach_relevance
  ON outreach_tasks (reason_code, news_relevance_reason)
  WHERE reason_code = 'news';