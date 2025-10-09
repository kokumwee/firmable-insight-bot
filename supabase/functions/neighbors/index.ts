import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');

interface Neighbor {
  name: string;
  website: string | null;
  relation: 'competitor' | 'alternative' | 'partner' | 'adjacent';
  confidence: 'high' | 'medium' | 'low' | 'speculative';
  reason: string;
  evidence?: Array<{ snippet: string; source_url: string }>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, type, companyCard, engagement } = await req.json();
    
    if (!url) {
      return new Response(
        JSON.stringify({ ok: false, error: { message: 'URL is required' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[neighbors] Processing type: ${type} for URL: ${url}`);

    let neighbors: Neighbor[] = [];

    if (type === 'verified') {
      neighbors = await extractVerifiedNeighbors(url);
    } else if (type === 'suggested') {
      neighbors = await extractSuggestedNeighbors(url, companyCard, engagement);
    } else if (type === 'potential') {
      neighbors = await extractPotentialCompetitors(url, companyCard, engagement);
    } else {
      return new Response(
        JSON.stringify({ ok: false, error: { message: 'Invalid type. Must be: verified, suggested, or potential' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[neighbors] Found ${neighbors.length} ${type} neighbors`);

    return new Response(
      JSON.stringify({ ok: true, data: neighbors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[neighbors] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ ok: false, error: { message } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function extractVerifiedNeighbors(url: string): Promise<Neighbor[]> {
  console.log('[verified] Fetching homepage:', url);
  
  // Fetch homepage
  const response = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  
  if (!response.ok) {
    throw new Error(`Failed to fetch homepage: ${response.statusText}`);
  }
  
  const html = await response.text();
  
  // Extract candidate links with context
  const candidates = extractCandidatesFromHtml(html, url);
  
  if (candidates.length === 0) {
    return [];
  }

  // AI classification
  const prompt = `Classify the following external brands mentioned on the homepage. Use only the provided context.
For each: {name, website, relation: partner|adjacent|competitor|alternative, confidence: high|medium|low, reason ≤ 120 chars, evidence: [{snippet, source_url}]}.
Use competitor/alternative only if the text implies comparison or substitution; otherwise prefer partner/adjacent.

Candidates:
${JSON.stringify(candidates, null, 2)}

Homepage URL: ${url}

Return a JSON array of objects with the structure: [{name, website, relation, confidence, reason, evidence}]
Limit to 12 results. Return only valid JSON array.`;

  const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: 'You are a classifier that returns strict JSON arrays only.' },
        { role: 'user', content: prompt }
      ],
    }),
  });

  if (!aiResponse.ok) {
    console.error('[verified] AI call failed:', aiResponse.statusText);
    return [];
  }

  const aiData = await aiResponse.json();
  const content = aiData.choices?.[0]?.message?.content || '[]';
  
  try {
    const neighbors = JSON.parse(content);
    return deduplicateAndValidate(neighbors).slice(0, 12);
  } catch (e) {
    console.error('[verified] Failed to parse AI response:', e);
    return [];
  }
}

async function extractSuggestedNeighbors(url: string, companyCard: any, engagement: any): Promise<Neighbor[]> {
  console.log('[suggested] Generating suggestions for:', url);
  
  const keywords = engagement?.key_messages?.keywords?.slice(0, 8) || [];
  
  const prompt = `Suggest 8–12 companies operating in a similar space based on the CompanyCard (industry, USP, audience) and keywords. If uncertain, still return ≥5.
For each: {name, website?, relation: competitor|alternative|adjacent, reason ≤ 120 chars, confidence: "speculative"}.
Prefer current firms with working websites. Deduplicate by name/domain.

Company Data:
Industry: ${companyCard?.industry?.value || 'Unknown'}
Company Size: ${companyCard?.company_size?.value || 'Unknown'}
HQ: ${companyCard?.hq_location?.value || 'Unknown'}
USP: ${companyCard?.usp?.value || 'Unknown'}
Offerings: ${companyCard?.offerings_bulleted?.slice(0, 5).map((o: any) => o.bullet).join(', ') || 'Unknown'}
Target Audience: ${companyCard?.target_audience_list?.slice(0, 5).join(', ') || 'Unknown'}
Keywords: ${keywords.map((k: any) => k.term).join(', ')}

Return a JSON array of objects with the structure: [{name, website, relation, reason, confidence: "speculative"}]
Limit to 12 results. Return only valid JSON array.`;

  const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: 'You are a business analyst that returns strict JSON arrays only.' },
        { role: 'user', content: prompt }
      ],
    }),
  });

  if (!aiResponse.ok) {
    console.error('[suggested] AI call failed:', aiResponse.statusText);
    return [];
  }

  const aiData = await aiResponse.json();
  const content = aiData.choices?.[0]?.message?.content || '[]';
  
  try {
    const neighbors = JSON.parse(content);
    return deduplicateAndValidate(neighbors).slice(0, 12);
  } catch (e) {
    console.error('[suggested] Failed to parse AI response:', e);
    return [];
  }
}

async function extractPotentialCompetitors(url: string, companyCard: any, engagement: any): Promise<Neighbor[]> {
  console.log('[potential] Generating competitor list for:', url);
  
  const keywords = engagement?.key_messages?.keywords?.slice(0, 8) || [];
  const tone = engagement?.brand_voice?.tone_summary || 'Unknown';
  
  const prompt = `List up to 10 likely direct competitors for this company using world knowledge (do not rely on the homepage text).
For each: {name, website?, relation: "competitor"|"alternative", reason ≤ 120 chars, confidence: "speculative"}.
Output strict JSON array only.

Company Data:
Industry: ${companyCard?.industry?.value || 'Unknown'}
Company Size: ${companyCard?.company_size?.value || 'Unknown'}
HQ: ${companyCard?.hq_location?.value || 'Unknown'}
USP: ${companyCard?.usp?.value || 'Unknown'}
Offerings: ${companyCard?.offerings_bulleted?.slice(0, 5).map((o: any) => o.bullet).join(', ') || 'Unknown'}
Target Audience: ${companyCard?.target_audience_list?.slice(0, 5).join(', ') || 'Unknown'}
Tone: ${tone}
Keywords: ${keywords.map((k: any) => k.term).join(', ')}

Return a JSON array of objects with the structure: [{name, website, relation, reason, confidence: "speculative"}]
Limit to 10 results. Return only valid JSON array.`;

  const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-2.5-flash',
      messages: [
        { role: 'system', content: 'You are a competitive intelligence analyst that returns strict JSON arrays only.' },
        { role: 'user', content: prompt }
      ],
    }),
  });

  if (!aiResponse.ok) {
    console.error('[potential] AI call failed:', aiResponse.statusText);
    return [];
  }

  const aiData = await aiResponse.json();
  const content = aiData.choices?.[0]?.message?.content || '[]';
  
  try {
    const neighbors = JSON.parse(content);
    return deduplicateAndValidate(neighbors).slice(0, 10);
  } catch (e) {
    console.error('[potential] Failed to parse AI response:', e);
    return [];
  }
}

function extractCandidatesFromHtml(html: string, sourceUrl: string): any[] {
  const candidates: any[] = [];
  const urlObj = new URL(sourceUrl);
  const sourceDomain = urlObj.hostname;
  
  // Simple regex-based extraction (in production, use a proper HTML parser)
  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
  const matches = html.matchAll(linkRegex);
  
  const ignoreDomains = ['facebook.com', 'twitter.com', 'linkedin.com', 'instagram.com', 'youtube.com', 'google.com', 'apple.com', 'microsoft.com'];
  
  for (const match of matches) {
    try {
      const href = match[1];
      const linkText = match[2].replace(/<[^>]*>/g, '').trim();
      
      if (!href || !linkText) continue;
      
      // Skip internal links
      if (href.startsWith('/') || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) continue;
      
      const linkUrl = new URL(href, sourceUrl);
      const linkDomain = linkUrl.hostname;
      
      // Skip same domain
      if (linkDomain === sourceDomain) continue;
      
      // Skip common domains
      if (ignoreDomains.some(d => linkDomain.includes(d))) continue;
      
      // Extract context (simplified - in production, look at parent elements)
      const contextStart = Math.max(0, match.index! - 150);
      const contextEnd = Math.min(html.length, match.index! + match[0].length + 150);
      const context = html.substring(contextStart, contextEnd).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      
      candidates.push({
        name: linkText,
        website: linkUrl.href,
        context: context,
      });
      
      if (candidates.length >= 30) break; // Limit candidates for AI processing
    } catch (e) {
      // Skip invalid URLs
      continue;
    }
  }
  
  return candidates;
}

function deduplicateAndValidate(neighbors: Neighbor[]): Neighbor[] {
  const seen = new Set<string>();
  const result: Neighbor[] = [];
  
  for (const neighbor of neighbors) {
    if (!neighbor.name) continue;
    
    // Normalize website
    if (neighbor.website) {
      try {
        const url = new URL(neighbor.website.startsWith('http') ? neighbor.website : `https://${neighbor.website}`);
        neighbor.website = url.href;
        
        const domain = url.hostname;
        if (seen.has(domain)) continue;
        seen.add(domain);
      } catch {
        neighbor.website = null;
      }
    }
    
    // Ensure confidence is set
    if (!neighbor.confidence) {
      neighbor.confidence = 'speculative';
    }
    
    result.push(neighbor);
  }
  
  return result;
}
