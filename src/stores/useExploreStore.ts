import { create } from 'zustand';
import { supabase } from '@/integrations/supabase/client';

type Status = 'idle' | 'loading' | 'success' | 'error';

interface NewsGroup {
  label: string;
  blurb: string;
  why_it_matters?: string | null;
  links: Array<{ url: string; title: string; published_at?: string }>;
}

interface NewsData {
  url_key: string;
  company_name: string;
  summary: string | null;
  why_it_matters: string | null;
  groups: NewsGroup[];
  sources: string[];
  article_count: number;
  generated_at: string;
}

interface Neighbor {
  name: string;
  website: string | null;
  relation: "competitor" | "alternative" | "partner" | "adjacent";
  confidence: "high" | "medium" | "low" | "speculative";
  reason: string;
  source?: "verified" | "ai_suggested" | "ai_potential" | "websearch";
  ai_type?: "suggested" | "competitor" | null;
  evidence?: Array<{ snippet: string; source_url: string }>;
}

interface ExploreState {
  url_key?: string | null;

  newsStatus: Status;
  news: NewsData | null;
  newsError: string | null;

  neighborsStatus: Status;
  neighbors: { verified: Neighbor[]; ai: Neighbor[] } | null;
  neighborsError: string | null;

  _inflightKey?: string | null;

  runAnalyze: (rawUrl: string, companyCard?: any, engagement?: any) => Promise<void>;
  refreshNews: () => Promise<void>;
  refreshNeighbors: (companyCard?: any, engagement?: any) => Promise<void>;
}

function toUrlKey(input: string): string {
  try {
    const cleaned = input.replace(/^https?:\/\/(www\.)?/, "");
    return cleaned.replace(/\/.*$/, "");
  } catch {
    return input.replace(/^https?:\/\/(www\.)?/, '').split('/')[0];
  }
}

async function newsLoadOrBuild(url_key: string): Promise<NewsData> {
  console.log('[Explore] newsLoadOrBuild start', url_key);
  
  // Check cache
  const { data: existing } = await supabase
    .from('company_news_summaries')
    .select('*')
    .eq('url_key', url_key)
    .maybeSingle();

  const stale = !existing || existing.article_count === 0 ||
    new Date(existing.generated_at) < new Date(Date.now() - 24 * 3600 * 1000);

  if (stale) {
    // Build fresh
    const { data, error } = await supabase.functions.invoke('news-summary', {
      body: { action: 'build', url_key, force: true }
    });

    if (error) throw error;
    if (!data.ok) throw new Error(data.error?.message || 'Failed to build news summary');
    
    console.log('[Explore] newsLoadOrBuild built fresh', url_key);
    return normalizeNewsData(data.data);
  }

  console.log('[Explore] newsLoadOrBuild cached', url_key);
  return normalizeNewsData(existing);
}

function normalizeNewsData(rawData: any): NewsData {
  const groups = Array.isArray(rawData.groups) 
    ? rawData.groups.map((g: any) => ({
        label: g.label || '',
        blurb: g.blurb || '',
        why_it_matters: g.why_it_matters || null,
        links: (g.items || []).map((item: any) => ({
          url: item.link || '',
          title: item.title || '',
          published_at: item.published_at || ''
        }))
      }))
    : [];

  return {
    url_key: rawData.url_key,
    company_name: rawData.company_name,
    summary: rawData.summary || null,
    why_it_matters: rawData.why_it_matters || null,
    groups,
    sources: rawData.sources || [],
    article_count: rawData.article_count || 0,
    generated_at: rawData.generated_at
  };
}

async function neighborsBuildAndLoad(rawUrl: string, companyCard?: any, engagement?: any): Promise<{ verified: Neighbor[]; ai: Neighbor[] }> {
  console.log('[Explore] neighborsBuildAndLoad start', rawUrl);
  
  // Fetch verified neighbors
  const { data: verifiedData, error: verifiedError } = await supabase.functions.invoke('neighbors', {
    body: { url: rawUrl, mode: 'verified', companyCard, engagement }
  });

  if (verifiedError) {
    console.error('[Explore] verified neighbors error:', verifiedError);
  }

  // Fetch AI neighbors
  const { data: aiData, error: aiError } = await supabase.functions.invoke('neighbors', {
    body: { url: rawUrl, mode: 'ai', companyCard, engagement }
  });

  if (aiError) {
    console.error('[Explore] AI neighbors error:', aiError);
  }

  console.log('[Explore] neighborsBuildAndLoad done', rawUrl);

  return {
    verified: verifiedData?.ok ? (verifiedData.data || []) : [],
    ai: aiData?.ok ? (aiData.data || []) : []
  };
}

export const useExploreStore = create<ExploreState>((set, get) => ({
  url_key: null,

  newsStatus: 'idle',
  news: null,
  newsError: null,

  neighborsStatus: 'idle',
  neighbors: null,
  neighborsError: null,

  _inflightKey: null,

  runAnalyze: async (rawUrl: string, companyCard?: any, engagement?: any) => {
    const url_key = toUrlKey(rawUrl);

    console.log('[Explore] runAnalyze start', url_key);

    // Single-flight: if same key already running, ignore
    if (get()._inflightKey === url_key) {
      console.log('[Explore] runAnalyze already in flight, ignoring', url_key);
      return;
    }

    set({
      url_key,
      _inflightKey: url_key,
      newsStatus: 'loading',
      news: null,
      newsError: null,
      neighborsStatus: 'loading',
      neighbors: null,
      neighborsError: null,
    });

    try {
      const [newsRes, neighRes] = await Promise.allSettled([
        newsLoadOrBuild(url_key),
        neighborsBuildAndLoad(rawUrl, companyCard, engagement),
      ]);

      if (newsRes.status === 'fulfilled') {
        set({ newsStatus: 'success', news: newsRes.value, newsError: null });
      } else {
        console.error('[Explore] news failed:', newsRes.reason);
        set({ newsStatus: 'error', news: null, newsError: newsRes.reason?.message || 'Failed to load news' });
      }

      if (neighRes.status === 'fulfilled') {
        set({ neighborsStatus: 'success', neighbors: neighRes.value, neighborsError: null });
      } else {
        console.error('[Explore] neighbors failed:', neighRes.reason);
        set({ neighborsStatus: 'error', neighbors: null, neighborsError: neighRes.reason?.message || 'Failed to load neighbors' });
      }

      console.log('[Explore] runAnalyze done', url_key);
    } finally {
      // Clear inflight so new analyze can run
      if (get()._inflightKey === url_key) {
        set({ _inflightKey: null });
      }
    }
  },

  refreshNews: async () => {
    const url_key = get().url_key;
    if (!url_key) return;

    console.log('[Explore] refreshNews start', url_key);
    set({ newsStatus: 'loading' });

    try {
      const { data, error } = await supabase.functions.invoke('news-summary', {
        body: { action: 'build', url_key, force: true }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error?.message || 'Failed to refresh news');

      set({ newsStatus: 'success', news: normalizeNewsData(data.data), newsError: null });
      console.log('[Explore] refreshNews done', url_key);
    } catch (e: any) {
      console.error('[Explore] refreshNews error:', e);
      set({ newsStatus: 'error', newsError: e?.message || 'Failed to refresh news' });
    }
  },

  refreshNeighbors: async (companyCard?: any, engagement?: any) => {
    const url_key = get().url_key;
    if (!url_key) return;

    console.log('[Explore] refreshNeighbors start', url_key);
    set({ neighborsStatus: 'loading' });

    try {
      // Reconstruct raw URL (best effort)
      const rawUrl = `https://${url_key}`;
      const res = await neighborsBuildAndLoad(rawUrl, companyCard, engagement);
      set({ neighborsStatus: 'success', neighbors: res, neighborsError: null });
      console.log('[Explore] refreshNeighbors done', url_key);
    } catch (e: any) {
      console.error('[Explore] refreshNeighbors error:', e);
      set({ neighborsStatus: 'error', neighborsError: e?.message || 'Failed to refresh neighbors' });
    }
  },
}));
