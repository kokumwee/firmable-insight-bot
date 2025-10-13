import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ===== Utilities =====

function toUrlKey(input: string): string {
  // Normalize to root host without www
  const cleaned = input.replace(/^https?:\/\/(www\.)?/, "");
  return cleaned.replace(/\/.*$/, "");
}

interface CompanyEntity {
  brand: string;
  url_key: string;
  aliases: string[];
}

async function resolveCompanyEntity(supabase: any, url_key: string): Promise<CompanyEntity> {
  const { data } = await supabase
    .from("customers")
    .select("name")
    .eq("url_key", url_key)
    .single();

  const brand = data?.name || url_key.split(".")[0].charAt(0).toUpperCase() + url_key.split(".")[0].slice(1);
  const aliases = [brand, `${brand} Technologies`, url_key];

  return { brand, url_key, aliases };
}

function newsQuery(entity: CompanyEntity): string {
  return `("${entity.brand}" OR "${entity.url_key}") (launch OR update OR releases OR AI OR agents OR integration OR partnership OR acquisition OR funding OR pricing OR hiring)`;
}

// ===== Fetch Headlines =====

interface NewsItem {
  title: string;
  snippet: string;
  link: string;
  publisher: string;
  published_at: string;
}

async function news_fetch_headlines(entity: CompanyEntity): Promise<{ ok: boolean; items: NewsItem[] }> {
  const SERPAPI_KEY = Deno.env.get("SERPAPI_KEY");
  const GNEWS_API_KEY = Deno.env.get("GNEWS_API_KEY");
  const NEWSDATA_API_KEY = Deno.env.get("NEWSDATA_API_KEY");
  const NEWS_RECENT_DAYS = parseInt(Deno.env.get("NEWS_RECENT_DAYS") || "30");

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - NEWS_RECENT_DAYS);

  try {
    let items: NewsItem[] = [];

    if (SERPAPI_KEY) {
      const query = newsQuery(entity);
      const url = `https://serpapi.com/search.json?engine=google&tbm=nws&q=${encodeURIComponent(query)}&tbs=qdr:m&hl=en&api_key=${SERPAPI_KEY}`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.news_results) {
        items = data.news_results.slice(0, 20).map((item: any) => ({
          title: item.title || "",
          snippet: item.snippet || "",
          link: item.link || "",
          publisher: item.source || "Unknown",
          published_at: item.date || new Date().toISOString(),
        }));
      }
    } else if (GNEWS_API_KEY) {
      const query = newsQuery(entity);
      const fromDate = cutoffDate.toISOString().split("T")[0];
      const url = `https://gnews.io/api/v4/search?q=${encodeURIComponent(query)}&lang=en&from=${fromDate}&token=${GNEWS_API_KEY}&max=20`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.articles) {
        items = data.articles.map((item: any) => ({
          title: item.title || "",
          snippet: item.description || "",
          link: item.url || "",
          publisher: item.source?.name || "Unknown",
          published_at: item.publishedAt || new Date().toISOString(),
        }));
      }
    } else if (NEWSDATA_API_KEY) {
      const query = newsQuery(entity);
      const fromDate = cutoffDate.toISOString().split("T")[0];
      const url = `https://newsdata.io/api/1/news?q=${encodeURIComponent(query)}&language=en&from_date=${fromDate}&apikey=${NEWSDATA_API_KEY}`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (data.results) {
        items = data.results.slice(0, 20).map((item: any) => ({
          title: item.title || "",
          snippet: item.description || "",
          link: item.link || "",
          publisher: item.source_id || "Unknown",
          published_at: item.pubDate || new Date().toISOString(),
        }));
      }
    }

    // Filter out old items
    items = items.filter(item => {
      const itemDate = new Date(item.published_at);
      return itemDate >= cutoffDate && !isNaN(itemDate.getTime());
    });

    return { ok: true, items };
  } catch (error) {
    console.error("Error fetching headlines:", error);
    return { ok: false, items: [] };
  }
}

// ===== Clustering =====

interface NewsCluster {
  label: string;
  items: Array<{ title: string; publisher: string; published_at: string; link: string }>;
  representativeSnippet: string;
}

function normalize(text: string): Set<string> {
  const stopwords = new Set(["the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by", "from", "as", "is", "are", "was", "were"]);
  return new Set(
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .split(/\s+/)
      .filter(word => word.length > 2 && !stopwords.has(word))
  );
}

function jaccard(set1: Set<string>, set2: Set<string>): number {
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function news_cluster(items: NewsItem[]): NewsCluster[] {
  const clusters: NewsCluster[] = [];
  const used = new Set<number>();

  for (let i = 0; i < items.length; i++) {
    if (used.has(i)) continue;

    const fingerprint1 = normalize(items[i].title);
    const clusterItems = [items[i]];
    used.add(i);

    for (let j = i + 1; j < items.length; j++) {
      if (used.has(j)) continue;

      const fingerprint2 = normalize(items[j].title);
      const similarity = jaccard(fingerprint1, fingerprint2);

      const date1 = new Date(items[i].published_at);
      const date2 = new Date(items[j].published_at);
      const daysDiff = Math.abs((date1.getTime() - date2.getTime()) / (1000 * 60 * 60 * 24));

      if (similarity >= 0.85 && daysDiff <= 7) {
        clusterItems.push(items[j]);
        used.add(j);
      }
    }

    // Determine label from keywords
    const allText = clusterItems.map(item => item.title).join(" ").toLowerCase();
    let label = "Company Updates";
    if (/(ai|agent|model|automation)/i.test(allText)) label = "AI features & agents";
    else if (/(integration|partnership)/i.test(allText)) label = "Partnerships & Integrations";
    else if (/(funding|investment)/i.test(allText)) label = "Funding & Investment";
    else if (/(hiring|jobs)/i.test(allText)) label = "Hiring & Jobs";

    const representativeSnippet = clusterItems
      .slice(0, 2)
      .map(item => item.snippet)
      .join(" ")
      .substring(0, 300);

    clusters.push({
      label,
      items: clusterItems.map(item => ({
        title: item.title,
        publisher: item.publisher,
        published_at: item.published_at,
        link: item.link,
      })),
      representativeSnippet,
    });
  }

  // Sort by most recent
  clusters.sort((a, b) => {
    const dateA = new Date(a.items[0].published_at).getTime();
    const dateB = new Date(b.items[0].published_at).getTime();
    return dateB - dateA;
  });

  return clusters;
}

// ===== Summarization =====

interface SummaryResult {
  summary: string;
  groups: Array<{ label: string; blurb: string; items: Array<{ title: string; publisher: string; published_at: string }> }>;
  sources: string[];
  article_count: number;
}

async function news_summarize_groups(entity: CompanyEntity, clusters: NewsCluster[]): Promise<SummaryResult> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    throw new Error("LOVABLE_API_KEY not configured");
  }

  const prompt = `You are analyzing news coverage for ${entity.brand} (${entity.url_key}).

Below are ${clusters.length} groups of similar headlines from the past 30 days:

${clusters.map((cluster, idx) => `
Group ${idx + 1}: ${cluster.label}
Headlines:
${cluster.items.slice(0, 3).map(item => `- ${item.title} (${item.publisher})`).join("\n")}
Representative snippet: ${cluster.representativeSnippet}
`).join("\n\n")}

Please provide:
1. For each group, write a 1-2 sentence blurb summarizing ONLY what's in the provided titles/snippets (no external knowledge).
2. A combined company-level digest of 4-6 sentences that flows naturally through the themes, neutral tone, no hype, no URLs.
3. End with one line: "Why it matters: [angle]" if clear from the coverage.

Format as JSON:
{
  "summary": "Combined 4-6 sentence digest with why it matters",
  "groups": [
    {"label": "Group label", "blurb": "1-2 sentence summary"}
  ]
}`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a concise news analyst. Only use information from provided headlines/snippets." },
          { role: "user", content: prompt },
        ],
      }),
    });

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "{}";
    
    // Try to extract JSON from markdown code blocks if present
    const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || content.match(/```\n([\s\S]*?)\n```/);
    const jsonString = jsonMatch ? jsonMatch[1] : content;
    const result = JSON.parse(jsonString);

    const sources = [...new Set(clusters.flatMap(c => c.items.map(i => i.publisher)))];
    const article_count = clusters.reduce((sum, c) => sum + c.items.length, 0);

    return {
      summary: result.summary || "",
      groups: result.groups.map((g: any, idx: number) => ({
        label: g.label || clusters[idx].label,
        blurb: g.blurb || "",
        items: clusters[idx].items,
      })),
      sources,
      article_count,
    };
  } catch (error) {
    console.error("Error in summarization:", error);
    // Fallback
    return {
      summary: `Recent coverage of ${entity.brand} spans ${clusters.length} themes.`,
      groups: clusters.map(c => ({
        label: c.label,
        blurb: c.representativeSnippet.substring(0, 150),
        items: c.items,
      })),
      sources: [...new Set(clusters.flatMap(c => c.items.map(i => i.publisher)))],
      article_count: clusters.reduce((sum, c) => sum + c.items.length, 0),
    };
  }
}

// ===== Build Summary =====

async function news_build_summary(supabase: any, url_key: string, force = false): Promise<any> {
  const NEWS_SUMMARY_TTL_HOURS = parseInt(Deno.env.get("NEWS_SUMMARY_TTL_HOURS") || "24");

  if (!force) {
    const { data: cached } = await supabase
      .from("company_news_summaries")
      .select("*")
      .eq("url_key", url_key)
      .single();

    if (cached) {
      const generatedAt = new Date(cached.generated_at);
      const now = new Date();
      const hoursDiff = (now.getTime() - generatedAt.getTime()) / (1000 * 60 * 60);

      if (hoursDiff < NEWS_SUMMARY_TTL_HOURS) {
        return { ok: true, data: cached };
      }
    }
  }

  const entity = await resolveCompanyEntity(supabase, url_key);
  const fetchResult = await news_fetch_headlines(entity);

  if (!fetchResult.ok || fetchResult.items.length === 0) {
    const emptyData = {
      url_key,
      company_name: entity.brand,
      summary: null,
      groups: [],
      sources: [],
      article_count: 0,
      generated_at: new Date().toISOString(),
    };

    await supabase
      .from("company_news_summaries")
      .upsert(emptyData, { onConflict: "url_key" });

    return { ok: true, data: emptyData };
  }

  const clusters = news_cluster(fetchResult.items);
  if (clusters.length === 0) {
    const emptyData = {
      url_key,
      company_name: entity.brand,
      summary: null,
      groups: [],
      sources: [],
      article_count: 0,
      generated_at: new Date().toISOString(),
    };

    await supabase
      .from("company_news_summaries")
      .upsert(emptyData, { onConflict: "url_key" });

    return { ok: true, data: emptyData };
  }

  const digest = await news_summarize_groups(entity, clusters);

  const summaryData = {
    url_key,
    company_name: entity.brand,
    summary: digest.summary,
    groups: digest.groups,
    sources: digest.sources,
    article_count: digest.article_count,
    generated_at: new Date().toISOString(),
  };

  await supabase
    .from("company_news_summaries")
    .upsert(summaryData, { onConflict: "url_key" });

  return { ok: true, data: summaryData };
}

// ===== Main Handler =====

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { action, url_key, force } = await req.json();

    if (action === "build") {
      const result = await news_build_summary(supabase, url_key, force);
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get_all") {
      const { data: customers } = await supabase
        .from("customers")
        .select("url_key");

      if (!customers || customers.length === 0) {
        return new Response(JSON.stringify({ ok: true, summaries: [] }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const summaries = [];
      
      for (const customer of customers) {
        const { data: cached } = await supabase
          .from("company_news_summaries")
          .select("*")
          .eq("url_key", customer.url_key)
          .single();

        if (cached) {
          summaries.push(cached);
        } else if (force) {
          // Build if missing and force is true
          const result = await news_build_summary(supabase, customer.url_key, true);
          if (result.ok && result.data) {
            summaries.push(result.data);
          }
          // Throttle
          await new Promise(resolve => setTimeout(resolve, 200));
        }
      }

      summaries.sort((a, b) => {
        const dateA = new Date(a.generated_at).getTime();
        const dateB = new Date(b.generated_at).getTime();
        return dateB - dateA;
      });

      return new Response(JSON.stringify({ ok: true, summaries }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in news-summary:", error);
    return new Response(JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
