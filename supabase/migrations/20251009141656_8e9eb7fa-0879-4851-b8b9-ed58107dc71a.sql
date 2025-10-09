-- Fix security warning: set search_path for function
DROP TRIGGER IF EXISTS trigger_update_shortlist_updated_at ON public.shortlist;
DROP FUNCTION IF EXISTS public.update_shortlist_updated_at();

CREATE OR REPLACE FUNCTION public.update_shortlist_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_update_shortlist_updated_at
BEFORE UPDATE ON public.shortlist
FOR EACH ROW
EXECUTE FUNCTION public.update_shortlist_updated_at();