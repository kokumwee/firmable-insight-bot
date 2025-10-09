import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url: inputUrl } = await req.json();

    if (!inputUrl) {
      return new Response(
        JSON.stringify({ ok: false, error: { code: 'MISSING_URL', message: 'URL is required' } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Normalize URL
    const normalizedUrl = inputUrl.toLowerCase().replace(/\/$/, '');

    console.log('[suggest-market-neighbors] Checking cache for:', normalizedUrl);

    // Check if we already have neighbors cached
    const { data: cached } = await supabase
      .from('market_neighbors')
      .select('neighbors')
      .eq('url', normalizedUrl)
      .maybeSingle();

    if (cached && cached.neighbors && Array.isArray(cached.neighbors) && cached.neighbors.length > 0) {
      console.log('[suggest-market-neighbors] Returning cached neighbors');
      return new Response(
        JSON.stringify({ ok: true, data: cached.neighbors }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[suggest-market-neighbors] Fetching company card and chunks');

    // Get company card
    const { data: companyCard } = await supabase
      .from('company_cards')
      .select('*')
      .eq('url', normalizedUrl)
      .maybeSingle();

    if (!companyCard) {
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: { 
            code: 'NO_COMPANY_DATA', 
            message: 'Company must be analyzed first. Please analyze the company before finding neighbors.' 
          } 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get chunks for context
    const { data: chunks } = await supabase
      .from('chunks')
      .select('text, page_type')
      .eq('url', normalizedUrl)
      .order('text_offset', { ascending: true })
      .limit(60);

    console.log('[suggest-market-neighbors] Found', chunks?.length || 0, 'chunks');

    // Prepare context for AI
    const context = {
      company_card: {
        name: companyCard.name,
        industry: companyCard.industry,
        usp: companyCard.usp,
        offerings: companyCard.offerings,
        target_audience: companyCard.target_audience
      },
      text_samples: chunks?.slice(0, 20).map(c => c.text).join('\n\n').substring(0, 8000) || ''
    };

    const systemPrompt = `You are a market research assistant. Using ONLY the provided company profile (industry, USP, offerings, audience) and text hints, propose 3–5 real companies that are similar by product, industry, buyer, or positioning.

Prefer well-known, relevant peers. Do not include the same company.

Return strict JSON matching this schema:
{
  "neighbors": [
    {
      "name": "Company Name",
      "url": "https://www.example.com",
      "description": "Short description (≤15 words)",
      "similarity_reason": "One-line reason for similarity",
      "similarity_score": 0.85,
      "tags": ["Tag1", "Tag2", "Tag3"]
    }
  ]
}

Rules:
- Each item must have: name, homepage URL, ≤15-word description, 1-line similarity_reason, similarity_score (0–1), 2–4 tags
- If unsure, return fewer results, not guesses
- URLs must be valid https:// URLs
- Do not include the analyzed company itself`;

    const userPrompt = `Find similar companies to:\n\n${JSON.stringify(context, null, 2)}`;

    console.log('[suggest-market-neighbors] Calling Lovable AI');

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        response_format: { type: "json_object" }
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('[suggest-market-neighbors] AI error:', aiResponse.status, errorText);
      throw new Error(`AI request failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content;

    if (!aiContent) {
      throw new Error('No content in AI response');
    }

    const parsedResult = JSON.parse(aiContent);
    let neighbors = parsedResult.neighbors || [];

    console.log('[suggest-market-neighbors] AI returned', neighbors.length, 'neighbors');

    // Sanitize and enrich neighbors
    neighbors = neighbors
      .filter((n: any) => {
        // Validate required fields
        if (!n.name || !n.url || !n.description) return false;
        // Check URL format
        if (!n.url.match(/^https?:\/\//)) return false;
        // Exclude same domain
        try {
          const inputDomain = new URL(normalizedUrl).hostname;
          const neighborDomain = new URL(n.url).hostname;
          return inputDomain !== neighborDomain;
        } catch {
          return false;
        }
      })
      .map((n: any) => {
        try {
          const url = new URL(n.url);
          return {
            name: n.name,
            url: n.url,
            description: n.description.substring(0, 100),
            similarity_reason: n.similarity_reason || 'Similar offerings and market',
            similarity_score: typeof n.similarity_score === 'number' ? n.similarity_score : 0.7,
            tags: Array.isArray(n.tags) ? n.tags.slice(0, 4) : [],
            favicon_url: `${url.origin}/favicon.ico`
          };
        } catch {
          return null;
        }
      })
      .filter((n: any) => n !== null)
      .slice(0, 5); // Cap to 5

    console.log('[suggest-market-neighbors] Sanitized to', neighbors.length, 'neighbors');

    // Cache the results
    await supabase
      .from('market_neighbors')
      .upsert({
        url: normalizedUrl,
        neighbors: neighbors,
        created_at: new Date().toISOString()
      });

    return new Response(
      JSON.stringify({ ok: true, data: neighbors }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[suggest-market-neighbors] Error:', error);
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: { 
          code: 'INTERNAL_ERROR', 
          message: error instanceof Error ? error.message : 'Unknown error' 
        } 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});