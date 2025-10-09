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
    const { url, userContext, regenerate } = await req.json();

    if (!url || !userContext) {
      return new Response(
        JSON.stringify({ ok: false, error: { message: "URL and user context are required" } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get engagement insights
    const { data: insights, error: insightsError } = await supabase
      .from('engagement_insights')
      .select('*')
      .eq('url', url)
      .single();

    if (insightsError || !insights) {
      return new Response(
        JSON.stringify({ ok: false, error: { message: "Engagement insights not found. Please analyze the company first." } }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get company card
    const { data: companyCard } = await supabase
      .from('company_cards')
      .select('*')
      .eq('url', url)
      .single();

    // Prepare context for AI
    const context = {
      company: {
        name: companyCard?.name || "the company",
        industry: companyCard?.industry?.value || "their industry",
        usp: companyCard?.usp?.value || "their unique offerings",
        target_audience: companyCard?.target_audience?.value || "their target market"
      },
      brand_tone: insights.outreach_guidance?.recommended_tone || "Professional",
      recommended_words: insights.outreach_guidance?.recommended_words || [],
      user_context: userContext
    };

    // Call Lovable AI
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are an expert B2B copywriter who crafts personalized outreach messages that align with each company's communication tone and brand language.
You always write messages that sound natural, personalized, and appropriate for the chosen platform.
Use the provided company analysis and tone data.

Guidelines:
- Match the formality of the company's tone
- Mirror their brand values and word choice naturally
- Keep it concise (4-6 sentences, max 150 words)
- Maintain warmth and professionalism — no over-selling
- Avoid clichés like "synergy", "touch base", "circle back"
- Use the recommended words naturally when they fit
- Make it feel personal and genuine

Return ONLY the outreach message as plain text, ready to copy-paste. No markdown, no JSON, no explanations.`
          },
          {
            role: 'user',
            content: JSON.stringify(context)
          }
        ],
        temperature: regenerate ? 0.9 : 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      return new Response(
        JSON.stringify({ ok: false, error: { message: "Failed to generate outreach message" } }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const message = aiData.choices?.[0]?.message?.content;

    if (!message) {
      return new Response(
        JSON.stringify({ ok: false, error: { message: "No message generated" } }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, message: message.trim() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in generate-outreach-message:', error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: { message: error instanceof Error ? error.message : "Unknown error" }
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
