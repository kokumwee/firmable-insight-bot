import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MIN_NEIGHBORS = 5;
const TARGET_NEIGHBORS = 10;
const WEBSEARCH_ENABLED = true;

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

function normalizeDomainOrNull(website?: string | null): string | null {
  if (!website) return null;
  let w = website.trim();
  if (!/^https?:\/\//i.test(w)) w = "https://" + w;
  try {
    const u = new URL(w);
    u.hash = "";
    return u.toString();
  } catch {
    return null;
  }
}

function deduplicateNeighbors(neighbors: Neighbor[]): Neighbor[] {
  const seen = new Set<string>();
  const result: Neighbor[] = [];
  
  for (const n of neighbors) {
    const key = (n.website || n.name).toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(n);
    }
  }
  
  return result;
}

async function callAI(messages: any[], temperature = 0.8): Promise<any> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

  const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages,
      temperature,
      top_p: 0.95,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`AI gateway error: ${response.status} ${text}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("No content in AI response");

  try {
    return JSON.parse(content);
  } catch {
    // Try to extract JSON from markdown code blocks
    const match = content.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
    if (match) {
      return JSON.parse(match[1]);
    }
    
    // Auto-reprompt once
    const retryMessages = [
      ...messages,
      { role: "assistant", content },
      { role: "user", content: "You returned invalid JSON. Return only valid JSON matching the schema; no commentary." }
    ];
    
    const retryResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: retryMessages,
        temperature,
      }),
    });

    if (!retryResponse.ok) throw new Error("Retry failed");
    const retryData = await retryResponse.json();
    const retryContent = retryData.choices?.[0]?.message?.content;
    return JSON.parse(retryContent);
  }
}

async function neighbors_verified(url: string, companyCard: any): Promise<Neighbor[]> {
  try {
    // Fetch homepage
    const pageResponse = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      redirect: "follow",
    });
    
    if (!pageResponse.ok) return [];
    const html = await pageResponse.text();

    // Extract links and context
    const linkRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
    const candidates: Array<{ url: string; text: string; context: string }> = [];
    
    let match;
    while ((match = linkRegex.exec(html)) !== null) {
      const href = match[1];
      const innerHtml = match[2];
      
      // Skip internal links, social, etc.
      if (!href || href.startsWith('#') || href.startsWith('/') || 
          href.includes('facebook.com') || href.includes('twitter.com') ||
          href.includes('linkedin.com') || href.includes('instagram.com')) {
        continue;
      }
      
      try {
        const linkUrl = new URL(href, url);
        const pageUrl = new URL(url);
        if (linkUrl.hostname === pageUrl.hostname) continue;
        
        // Extract text
        const text = innerHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
        if (text.length < 2 || text.length > 100) continue;
        
        candidates.push({
          url: linkUrl.href,
          text,
          context: text.substring(0, 150)
        });
      } catch {
        continue;
      }
    }

    if (candidates.length === 0) return [];

    // AI classify
    const prompt = `Classify the following external brands mentioned on the homepage. Use only the provided context.
For each: {name, website, relation: partner|adjacent|competitor|alternative, confidence: high|medium|low, reason ≤ 120 chars, evidence: [{snippet, source_url}]}.
Use competitor/alternative only if the text implies comparison or substitution; otherwise prefer partner/adjacent.

Company: ${companyCard?.name || url}
Industry: ${companyCard?.industry?.value || 'unknown'}

Candidates:
${candidates.slice(0, 20).map((c, i) => `${i + 1}. ${c.text} - ${c.url}`).join('\n')}

Return JSON array only.`;

    const result = await callAI([
      { role: "system", content: "You are a classifier. Return only valid JSON arrays." },
      { role: "user", content: prompt }
    ], 0.7);

    const neighbors: Neighbor[] = Array.isArray(result) ? result : [];
    return neighbors.map(n => ({
      ...n,
      website: normalizeDomainOrNull(n.website),
      source: "verified" as const,
      evidence: n.evidence || [{ snippet: n.reason, source_url: url }]
    })).slice(0, 12);
    
  } catch (error) {
    console.error("Error in neighbors_verified:", error);
    return [];
  }
}

async function neighbors_suggested(url: string, companyCard: any, engagement: any, temperature = 0.8): Promise<Neighbor[]> {
  try {
    const keywords = engagement?.key_messages?.keywords?.slice(0, 8).map((k: any) => k.term).join(', ') || '';
    
    const prompt = `Return 8–12 companies operating in a similar space based on CompanyCard (industry, USP, audience) and keywords.
If uncertain, still return at least 5.
Output strict JSON array with items:
{name, website?, relation: competitor|alternative|adjacent, reason (≤120 chars), confidence: "speculative"}.
Prefer current companies with working domains. Deduplicate by name/domain. Ensure diversity (different regions/product angles).

Company: ${companyCard?.name || url}
Industry: ${companyCard?.industry?.value || 'unknown'}
USP: ${companyCard?.usp?.value || 'N/A'}
Target Audience: ${companyCard?.target_audience_list?.slice(0, 3).join(', ') || 'N/A'}
Keywords: ${keywords}

Return JSON array only.`;

    const result = await callAI([
      { role: "system", content: "You are a business analyst. Return only valid JSON arrays with at least 5 items." },
      { role: "user", content: prompt }
    ], temperature);

    const neighbors: Neighbor[] = Array.isArray(result) ? result : [];
    return neighbors.map(n => ({
      ...n,
      website: normalizeDomainOrNull(n.website),
      confidence: "speculative" as const,
      source: "ai_suggested" as const
    }));
    
  } catch (error) {
    console.error("Error in neighbors_suggested:", error);
    return [];
  }
}

async function neighbors_potential(url: string, companyCard: any, engagement: any, temperature = 0.8): Promise<Neighbor[]> {
  try {
    const keywords = engagement?.key_messages?.keywords?.slice(0, 5).map((k: any) => k.term).join(', ') || '';
    
    const prompt = `List up to 10 likely direct competitors using world knowledge (do not rely on homepage text).
If uncertain, return at least 5 best candidates.
For each: {name, website?, relation: "competitor"|"alternative", reason (≤120 chars), confidence: "speculative"}.
Output strict JSON array only.

Company: ${companyCard?.name || url}
Industry: ${companyCard?.industry?.value || 'unknown'}
USP: ${companyCard?.usp?.value || 'N/A'}
Target Audience: ${companyCard?.target_audience_list?.slice(0, 3).join(', ') || 'N/A'}
Keywords: ${keywords}

Return JSON array only.`;

    const result = await callAI([
      { role: "system", content: "You are a competitive analyst. Return only valid JSON arrays with at least 5 items." },
      { role: "user", content: prompt }
    ], temperature);

    const neighbors: Neighbor[] = Array.isArray(result) ? result : [];
    return neighbors.map(n => ({
      ...n,
      website: normalizeDomainOrNull(n.website),
      confidence: "speculative" as const,
      relation: (n.relation || "competitor") as any,
      source: "ai_potential" as const
    }));
    
  } catch (error) {
    console.error("Error in neighbors_potential:", error);
    return [];
  }
}

async function neighbors_websearch(companyCard: any, keywords: string[]): Promise<Neighbor[]> {
  if (!WEBSEARCH_ENABLED) return [];
  
  const SERPAPI_KEY = Deno.env.get("SERPAPI_KEY");
  if (!SERPAPI_KEY) {
    console.log("SERPAPI_KEY not configured, skipping web search");
    return [];
  }

  try {
    const companyName = companyCard?.name || '';
    const industry = companyCard?.industry?.value || '';
    
    const queries = [
      `${companyName} competitors`,
      `${industry} competitors`,
      `${companyName} alternatives`
    ];

    const results: Neighbor[] = [];
    
    for (const query of queries.slice(0, 2)) {
      try {
        const response = await fetch(
          `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${SERPAPI_KEY}&num=10`
        );
        
        if (!response.ok) continue;
        
        const data = await response.json();
        const organicResults = data.organic_results || [];
        
        for (const result of organicResults.slice(0, 5)) {
          const title = result.title || '';
          const link = result.link || '';
          
          if (!link) continue;
          
          // Try to extract company name from title
          const name = title.split('-')[0].trim() || title.split('|')[0].trim() || title;
          
          results.push({
            name,
            website: normalizeDomainOrNull(link),
            relation: "competitor",
            confidence: "speculative",
            reason: "Found via web search for competitors",
            source: "websearch"
          });
        }
      } catch (error) {
        console.error(`Web search error for query "${query}":`, error);
      }
    }

    return deduplicateNeighbors(results);
    
  } catch (error) {
    console.error("Error in neighbors_websearch:", error);
    return [];
  }
}

async function neighbors_fill(url: string, mode: "suggested" | "potential", companyCard: any, engagement: any): Promise<Neighbor[]> {
  // First pass: AI
  let out = mode === "suggested" 
    ? await neighbors_suggested(url, companyCard, engagement)
    : await neighbors_potential(url, companyCard, engagement);

  // Filter out the analyzed company itself
  const analyzedDomain = normalizeDomainOrNull(url);
  if (analyzedDomain) {
    out = out.filter(n => {
      const nDomain = n.website ? new URL(n.website).hostname : null;
      const aDomain = new URL(analyzedDomain).hostname;
      return nDomain !== aDomain;
    });
  }

  // If below minimum, add web search results
  if (out.length < MIN_NEIGHBORS && WEBSEARCH_ENABLED) {
    const keywords = engagement?.key_messages?.keywords?.slice(0, 5).map((k: any) => k.term) || [];
    const web = await neighbors_websearch(companyCard, keywords);
    
    const seen = new Set(out.map(i => (i.website || i.name).toLowerCase()));
    for (const w of web) {
      const key = (w.website || w.name).toLowerCase();
      if (!seen.has(key)) {
        out.push(w);
        seen.add(key);
      }
      if (out.length >= TARGET_NEIGHBORS) break;
    }
  }

  // If still short, second AI pass with higher temperature
  if (out.length < MIN_NEIGHBORS) {
    const secondPass = mode === "suggested"
      ? await neighbors_suggested(url, companyCard, engagement, 0.95)
      : await neighbors_potential(url, companyCard, engagement, 0.95);
    
    const seen = new Set(out.map(i => (i.website || i.name).toLowerCase()));
    for (const s of secondPass) {
      const key = (s.website || s.name).toLowerCase();
      if (!seen.has(key)) {
        out.push(s);
        seen.add(key);
      }
      if (out.length >= MIN_NEIGHBORS) break;
    }
  }

  return deduplicateNeighbors(out).slice(0, TARGET_NEIGHBORS);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, mode, companyCard, engagement } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ ok: false, error: { message: "URL is required" } }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let neighbors: Neighbor[] = [];

    switch (mode) {
      case "verified":
        neighbors = await neighbors_verified(url, companyCard);
        break;
      case "ai":
        // Unified AI neighbors: merge suggested + potential + websearch
        const suggested = await neighbors_fill(url, "suggested", companyCard, engagement);
        const potential = await neighbors_fill(url, "potential", companyCard, engagement);
        
        // Tag sources
        const taggedSuggested = suggested.map(n => ({ ...n, source: "ai_suggested" as const, ai_type: "suggested" as const }));
        const taggedPotential = potential.map(n => ({ ...n, source: "ai_potential" as const, ai_type: "competitor" as const }));
        
        // Merge and deduplicate
        neighbors = deduplicateNeighbors([...taggedSuggested, ...taggedPotential]).slice(0, TARGET_NEIGHBORS);
        break;
      default:
        return new Response(
          JSON.stringify({ ok: false, error: { message: "Invalid mode" } }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
    }

    return new Response(
      JSON.stringify({ ok: true, data: neighbors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("neighbors function error:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: { message: error instanceof Error ? error.message : "Unknown error" }
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
