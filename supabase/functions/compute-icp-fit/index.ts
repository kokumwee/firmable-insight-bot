import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Fuzzy matching helpers
function tokenize(str: string): string[] {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function tokenOverlapScore(a: string, b: string): number {
  const ta = new Set(tokenize(a));
  const tb = new Set(tokenize(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  const overlap = [...ta].filter(x => tb.has(x)).length;
  return overlap / Math.max(ta.size, tb.size);
}

function fuzzyMatchScore(a: string, b: string): number {
  const base = tokenOverlapScore(a, b);
  if (a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase())) {
    return Math.min(1, base + 0.3);
  }
  return base;
}

function compareBuckets(icpSize: string, companySize: string): number {
  const order = ["1–10", "11–50", "51–200", "201–1000", "1000+"];
  const i = order.indexOf(icpSize);
  const c = order.indexOf(companySize);
  if (i === -1 || c === -1) return 0;
  const diff = Math.abs(i - c);
  if (diff === 0) return 1.0;
  if (diff === 1) return 0.5;
  return 0;
}

function normalizeUrl(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    return u.origin;
  } catch {
    return urlStr.replace(/\/$/, '');
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, icp } = await req.json();
    
    if (!url || !icp) {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: { message: "url and icp are required" } 
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const normalizedUrl = normalizeUrl(url);
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch company card
    const { data: companyCard, error: cardError } = await supabase
      .from('company_cards')
      .select('*')
      .eq('url', normalizedUrl)
      .maybeSingle();

    if (cardError) {
      console.error('Error fetching company card:', cardError);
      return new Response(JSON.stringify({ 
        ok: false, 
        error: { message: "Failed to fetch company data" } 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!companyCard) {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: { message: "No company data available. Analyze the URL first." } 
      }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extract company data
    const company = {
      industry: companyCard.industry?.value || "",
      size: companyCard.company_size?.value || "",
      hq: companyCard.hq_location?.value || "",
      audience: companyCard.target_audience?.value || "",
      audience_list: companyCard.analysis_json?.target_audience_list || [],
      offerings: companyCard.analysis_json?.offerings_bulleted || companyCard.offerings || [],
    };

    // Compute subscores
    const subs: Record<string, number> = { 
      industry: 0, 
      size: 0, 
      region: 0, 
      audience: 0, 
      offerings: 0 
    };

    // Industry
    if (icp.industries?.length && company.industry) {
      subs.industry = icp.industries.some((ind: string) => 
        fuzzyMatchScore(company.industry, ind) >= 0.4
      ) ? 1.0 : 0.0;
    }

    // Size
    if (icp.size && company.size) {
      subs.size = compareBuckets(icp.size, company.size);
    }

    // Region
    if (icp.regions?.length && company.hq) {
      subs.region = icp.regions.some((r: string) => 
        fuzzyMatchScore(company.hq, r) >= 0.4
      ) ? 1.0 : 0.0;
    }

    // Audience
    if (icp.audience && (company.audience || company.audience_list?.length)) {
      const compAud = (company.audience_list || [company.audience]).join(", ");
      subs.audience = fuzzyMatchScore(compAud, icp.audience);
    }

    // Offerings
    if (icp.offering_keywords && company.offerings?.length) {
      const offs = company.offerings.map((o: any) => o.bullet || o.snippet || "").join(", ");
      const keywords = icp.offering_keywords.split(",").map((k: string) => k.trim()).filter(Boolean);
      subs.offerings = keywords.some((k: string) => fuzzyMatchScore(offs, k) >= 0.4) ? 1.0 : 0.0;
    }

    // Weighted score
    const w = icp.weights || { industry: 3, size: 2, region: 2, audience: 2, offerings: 2 };
    const weighted = subs.industry * w.industry + 
                    subs.size * w.size + 
                    subs.region * w.region + 
                    subs.audience * w.audience + 
                    subs.offerings * w.offerings;
    const maxWeight = w.industry + w.size + w.region + w.audience + w.offerings;
    const score = Math.round(100 * weighted / maxWeight);

    // Status
    let status = "Poor";
    if (score >= 70) status = "Good";
    else if (score >= 40) status = "Okay";

    // Rationale
    const matched = Object.entries(subs)
      .filter(([_, v]) => v >= 0.9)
      .map(([k]) => k);
    const missed = Object.entries(subs)
      .filter(([_, v]) => v < 0.4)
      .map(([k]) => k);
    
    let rationale = `Matched: ${matched.join(", ") || "none"}. `;
    rationale += missed.length ? `Needs improvement: ${missed.join(", ")}.` : "All criteria aligned.";

    console.log('ICP fit computed:', { score, status, subscores: subs });

    return new Response(JSON.stringify({ 
      ok: true, 
      data: { score, status, rationale, subscores: subs } 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in compute-icp-fit:', error);
    return new Response(JSON.stringify({ 
      ok: false, 
      error: { message: error instanceof Error ? error.message : "Unknown error" } 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
