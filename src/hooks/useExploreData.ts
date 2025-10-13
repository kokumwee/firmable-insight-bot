import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

interface NewsGroup {
  label: string;
  blurb: string;
  why_it_matters?: string | null;
  links: Array<{ url: string; title: string; published_at?: string }>;
}

interface NewsSummary {
  summary: string;
  why_it_matters: string;
  groups: NewsGroup[];
  sources: string[];
  generated_at: string;
  article_count: number;
}

interface Neighbor {
  name: string;
  website: string | null;
  relation: "competitor" | "alternative" | "partner" | "adjacent";
  confidence: "high" | "medium" | "low" | "speculative";
  reason: string;
  source?: "verified" | "ai_suggested" | "ai_potential" | "websearch";
  ai_type?: "suggested" | "competitor" | null;
}

interface ExploreDataState {
  analyzing: boolean;
  news: {
    status: 'idle' | 'loading' | 'success' | 'error';
    data: NewsSummary | null;
    error: string | null;
  };
  neighbors: {
    status: 'idle' | 'loading' | 'success' | 'error';
    data: { verified: Neighbor[]; ai: Neighbor[] } | null;
    error: string | null;
  };
}

const toUrlKey = (url: string): string => {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '');
};

async function news_load_or_build(
  url_key: string, 
  options: { forceIfMissing?: boolean; signal?: AbortSignal } = {}
): Promise<NewsSummary> {
  const { forceIfMissing = true, signal } = options;

  // Check for existing cached news
  const { data: existing, error: fetchError } = await supabase
    .from('company_news_summaries')
    .select('generated_at, article_count, summary, why_it_matters, groups, sources')
    .eq('url_key', url_key)
    .maybeSingle();

  if (signal?.aborted) throw new Error('Aborted');
  if (fetchError) throw fetchError;

  const stale = existing
    ? new Date(existing.generated_at) < new Date(Date.now() - 24 * 3600 * 1000)
    : true;

  // Build fresh if missing, empty, or stale
  if (!existing || existing.article_count === 0 || stale) {
    const { data, error } = await supabase.functions.invoke('news-summary', {
      body: { action: 'build', url_key, force: forceIfMissing || stale }
    });

    if (signal?.aborted) throw new Error('Aborted');
    if (error) throw error;
    if (!data.ok) throw new Error(data.error?.message || 'Failed to build news summary');

    return data.data;
  }

  return existing as unknown as NewsSummary;
}

async function neighbors_build(
  url: string,
  companyCard: any,
  engagement: any,
  options: { signal?: AbortSignal } = {}
): Promise<{ verified: Neighbor[]; ai: Neighbor[] }> {
  const { signal } = options;

  // Fetch verified neighbors
  const verifiedPromise = supabase.functions.invoke('neighbors', {
    body: { url, mode: 'verified', companyCard, engagement }
  });

  if (signal?.aborted) throw new Error('Aborted');

  const { data: verifiedData, error: verifiedError } = await verifiedPromise;
  
  if (signal?.aborted) throw new Error('Aborted');
  if (verifiedError) throw verifiedError;
  if (!verifiedData.ok) throw new Error(verifiedData.error?.message || 'Failed to load verified neighbors');

  // Fetch AI neighbors
  const aiPromise = supabase.functions.invoke('neighbors', {
    body: { url, mode: 'ai', companyCard, engagement }
  });

  if (signal?.aborted) throw new Error('Aborted');

  const { data: aiData, error: aiError } = await aiPromise;
  
  if (signal?.aborted) throw new Error('Aborted');
  if (aiError) throw aiError;
  if (!aiData.ok) throw new Error(aiData.error?.message || 'Failed to load AI neighbors');

  return {
    verified: verifiedData.data || [],
    ai: aiData.data || []
  };
}

export function useExploreData(url?: string, companyCard?: any, engagement?: any) {
  const [state, setState] = useState<ExploreDataState>({
    analyzing: false,
    news: { status: 'idle', data: null, error: null },
    neighbors: { status: 'idle', data: null, error: null },
  });

  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!url) return;

    // Cancel in-flight requests
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
    const signal = controllerRef.current.signal;

    async function run() {
      const url_key = toUrlKey(url);

      setState(s => ({
        ...s,
        analyzing: true,
        news: { status: 'loading', data: null, error: null },
        neighbors: { status: 'loading', data: null, error: null },
      }));

      try {
        // Kick off both in parallel
        const newsP = news_load_or_build(url_key, { forceIfMissing: true, signal });
        const neighP = neighbors_build(url, companyCard, engagement, { signal });

        const [newsRes, neighRes] = await Promise.allSettled([newsP, neighP]);

        if (signal.aborted) return;

        setState(s => ({
          ...s,
          analyzing: false,
          news: newsRes.status === 'fulfilled'
            ? { status: 'success', data: newsRes.value, error: null }
            : { status: 'error', data: null, error: newsRes.reason?.message || 'News failed' },
          neighbors: neighRes.status === 'fulfilled'
            ? { status: 'success', data: neighRes.value, error: null }
            : { status: 'error', data: null, error: neighRes.reason?.message || 'Neighbors failed' },
        }));
      } catch (e) {
        if (signal.aborted) return;
        setState(s => ({ ...s, analyzing: false }));
      }
    }

    run();
    return () => controllerRef.current?.abort();
  }, [url, companyCard, engagement]);

  const refresh = {
    news: async () => {
      if (!url) return;
      const url_key = toUrlKey(url);
      const signal = controllerRef.current?.signal;

      setState(s => ({
        ...s,
        news: { status: 'loading', data: s.news.data, error: null }
      }));

      try {
        const data = await news_load_or_build(url_key, { forceIfMissing: true, signal });
        if (signal?.aborted) return;
        setState(s => ({
          ...s,
          news: { status: 'success', data, error: null }
        }));
      } catch (error) {
        if (signal?.aborted) return;
        setState(s => ({
          ...s,
          news: { status: 'error', data: s.news.data, error: error instanceof Error ? error.message : 'Refresh failed' }
        }));
      }
    },
    neighbors: async () => {
      if (!url) return;
      const signal = controllerRef.current?.signal;

      setState(s => ({
        ...s,
        neighbors: { status: 'loading', data: s.neighbors.data, error: null }
      }));

      try {
        const data = await neighbors_build(url, companyCard, engagement, { signal });
        if (signal?.aborted) return;
        setState(s => ({
          ...s,
          neighbors: { status: 'success', data, error: null }
        }));
      } catch (error) {
        if (signal?.aborted) return;
        setState(s => ({
          ...s,
          neighbors: { status: 'error', data: s.neighbors.data, error: error instanceof Error ? error.message : 'Refresh failed' }
        }));
      }
    }
  };

  return { ...state, refresh };
}
