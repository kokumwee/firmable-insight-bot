import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Normalize URL helper (same as analyze)
function normalizeURL(input: string): string {
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  try {
    const u = new URL(url);
    u.hash = '';
    u.search = '';
    if (u.pathname === '/') u.pathname = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return input;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url, field } = await req.json();

    if (!url || !field) {
      return new Response(
        JSON.stringify({ ok: false, error: { code: "MISSING_PARAMS", message: "url and field are required" } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const normalizedUrl = normalizeURL(url);

    // Check if field is already filled
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: companyCard, error: fetchError } = await supabase
      .from('company_cards')
      .select('*')
      .eq('url', normalizedUrl)
      .maybeSingle();

    if (fetchError) {
      console.error('Error fetching company card:', fetchError);
    }

    // Check if field is already filled with non-null value
    if (companyCard) {
      const fieldValue = companyCard[field];
      if (fieldValue !== null && fieldValue !== undefined) {
        // For objects with value property
        if (typeof fieldValue === 'object' && 'value' in fieldValue && fieldValue.value !== null) {
          return new Response(
            JSON.stringify({ 
              ok: false, 
              error: { 
                code: "FIELD_ALREADY_FILLED", 
                message: "This field is already filled from the analyzed pages." 
              } 
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        // For arrays
        if (Array.isArray(fieldValue) && fieldValue.length > 0) {
          return new Response(
            JSON.stringify({ 
              ok: false, 
              error: { 
                code: "FIELD_ALREADY_FILLED", 
                message: "This field is already filled from the analyzed pages." 
              } 
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        // For simple values
        if (typeof fieldValue === 'string' && fieldValue.length > 0) {
          return new Response(
            JSON.stringify({ 
              ok: false, 
              error: { 
                code: "FIELD_ALREADY_FILLED", 
                message: "This field is already filled from the analyzed pages." 
              } 
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // Call Lovable AI for unverified suggestion
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY not configured');
    }

    const companyName = companyCard?.name || '';
    const domain = new URL(normalizedUrl).hostname;

    const systemPrompt = `You will provide a brief unverified suggestion for a missing company field.
Do not use the scraped page chunks. Use general world knowledge and common patterns only.
If you are not reasonably confident, return "Unknown".
Keep the suggestion concise: ≤ 12 words for single-value fields; ≤ 5 bullets for lists.
Also return a one-sentence rationale explaining your guess (≤ 140 chars).

Return ONLY valid JSON in this exact format:
{
  "field": "${field}",
  "suggestion": "your suggestion here",
  "rationale": "your rationale here",
  "confidence": "speculative",
  "disclaimer": "Not found on analyzed pages; may be incorrect."
}`;

    const userPrompt = `Company URL: ${normalizedUrl}
Company name: ${companyName || domain}
Field to guess: ${field}

Expected format examples:
- industry: "B2B payments & fintech platform"
- company_size: "51-200 employees"
- hq_location: "San Francisco, CA, USA"
- usp: "All-in-one payment infrastructure for internet businesses"
- offerings: ["Payment processing", "Fraud prevention", "Recurring billing"]
- target_audience: ["Online businesses", "SaaS companies", "E-commerce platforms"]`;

    console.log('Calling Lovable AI for suggestion...');
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
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI gateway error:', aiResponse.status, errorText);
      throw new Error('AI gateway error');
    }

    const aiData = await aiResponse.json();
    const content = aiData.choices?.[0]?.message?.content || '';
    
    console.log('AI response:', content);

    // Parse JSON response
    let suggestionData;
    try {
      // Try to extract JSON from markdown code blocks if present
      const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) || content.match(/```\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : content;
      suggestionData = JSON.parse(jsonStr);
    } catch (e) {
      console.error('Failed to parse AI response:', e);
      suggestionData = {
        field: field,
        suggestion: "Unknown",
        rationale: "Unable to generate suggestion",
        confidence: "speculative",
        disclaimer: "Not found on analyzed pages; may be incorrect."
      };
    }

    // Ensure all required fields are present
    suggestionData = {
      field: field,
      suggestion: suggestionData.suggestion || "Unknown",
      rationale: suggestionData.rationale || "Unable to determine",
      confidence: "speculative",
      disclaimer: "Not found on analyzed pages; may be incorrect."
    };

    // Insert into database
    const { error: insertError } = await supabase
      .from('unverified_suggestions')
      .insert({
        url: normalizedUrl,
        field: field,
        suggestion: suggestionData.suggestion,
        rationale: suggestionData.rationale,
        confidence: suggestionData.confidence,
      });

    if (insertError) {
      console.error('Error inserting suggestion:', insertError);
    }

    return new Response(
      JSON.stringify({ ok: true, data: suggestionData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in suggest-unverified function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ ok: false, error: { code: "INTERNAL_ERROR", message: errorMessage } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
