-- Add reason column to pages table to track why pages were skipped
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS reason text;

-- Add comment
COMMENT ON COLUMN public.pages.reason IS 'Reason why page was skipped (e.g., EMPTY_CONTENT, BLOCKED_OR_EMPTY, HTTP_4XX, HTTP_5XX)';