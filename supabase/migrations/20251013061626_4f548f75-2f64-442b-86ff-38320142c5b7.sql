-- Add news-specific columns to outreach_tasks
ALTER TABLE outreach_tasks
  ADD COLUMN IF NOT EXISTS news_group_labels text[],
  ADD COLUMN IF NOT EXISTS news_group_hashes text[],
  ADD COLUMN IF NOT EXISTS news_blurb_snippet text,
  ADD COLUMN IF NOT EXISTS news_sources_short text[],
  ADD COLUMN IF NOT EXISTS news_published_at timestamptz;

-- Create index for news-based task queries
CREATE INDEX IF NOT EXISTS idx_outreach_news_date
  ON outreach_tasks (reason_code, recommended_at, news_published_at);

-- Create index for cooldown queries
CREATE INDEX IF NOT EXISTS idx_outreach_cooldown
  ON outreach_tasks (customer_id, reason_code, recommended_at);