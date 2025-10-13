import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { toUrlKey } from "../_shared/urlUtils.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ ok: false, error: { message: "URL is required" } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const urlKey = toUrlKey(url);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if we already have engagement insights for this URL
    const { data: existingInsights } = await supabase
      .from('engagement_insights')
      .select('*')
      .eq('url', url)
      .single();

    if (existingInsights) {
      return new Response(
        JSON.stringify({ ok: true, data: existingInsights }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get company card for context
    const { data: companyCard } = await supabase
      .from('company_cards')
      .select('*')
      .eq('url', url)
      .single();

    // Get relevant chunks for brand voice analysis
    const { data: chunks } = await supabase
      .from('chunks')
      .select('text, page_type, source_url')
      .eq('url', url)
      .in('page_type', ['homepage', 'about', 'company', 'mission', 'product', 'audience', 'culture'])
      .limit(50);

    if (!chunks || chunks.length === 0) {
      return new Response(
        JSON.stringify({ ok: false, error: { message: "No content available for analysis" } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get recent news (last 30 days only) for context
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: newsItems } = await supabase
      .from('company_news')
      .select('title, summary, quote, reason, relevance')
      .eq('url_key', urlKey)
      .eq('deleted', false)
      .gte('published_at', cutoffDate)
      .order('relevance', { ascending: false })
      .limit(3);

    // Get my company profile for relevance marking
    const { data: myCompany } = await supabase
      .from('my_company_profile')
      .select('keywords, value_proposition')
      .maybeSingle();

    // Mark relevance based on keyword overlap
    const myKeywords = myCompany?.keywords || [];
    const vpWords = myCompany?.value_proposition?.toLowerCase().split(/\s+/) || [];
    const targetKeywords = (companyCard?.analysis_json?.keywords_top || []).map((k: any) => k.value);
    const allKeywords = [...myKeywords, ...targetKeywords, ...vpWords]
      .map(k => k.toLowerCase())
      .filter(k => k.length > 3);

    const relevantNews = (newsItems || []).filter((item: any) => {
      const text = `${item.title} ${item.summary}`.toLowerCase();
      return allKeywords.some(kw => text.includes(kw));
    });

    // Prepare context for AI
    const context = {
      companyCard: companyCard || {},
      chunks: chunks.map(c => ({
        page_type: c.page_type,
        text: c.text.substring(0, 500) // Limit chunk size
      })),
      news_context: relevantNews
    };

    // Call Lovable AI for engagement analysis
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
            content: `You are an expert marketing analyst and communications strategist.
Analyze the company's writing style and content to help users understand the company's voice and mirror it in outreach.
Use the provided chunks and CompanyCard fields.

Return strict JSON matching this schema:
{
  "brand_voice": {
    "tone_summary": "Professional & Trustworthy",
    "sentiment_score": 0.78,
    "style_traits": ["Authoritative", "Clear", "Minimalist"],
    "explanation": "Tone focuses on clarity and reliability with neutral-positive sentiment."
  },
  "key_messages": {
    "summary": "Emphasizes innovation, trust, and scalability.",
    "keywords": [
      { "term": "innovation", "weight": 0.9 },
      { "term": "trust", "weight": 0.8 }
    ]
  },
  "outreach_guidance": {
    "recommended_tone": "Confident yet friendly",
    "recommended_words": ["streamline", "secure", "partner", "grow", "simplify"],
    "example_message": "Loved your focus on secure global payments — we help fintechs simplify onboarding worldwide."
  }
}

Tone labels should be from: Professional, Friendly, Playful, Authoritative, Bold, Caring, Innovative, Minimalist, Trustworthy.
Sentiment score between 0 (very negative) and 1 (very positive).
Select ≤ 8 most meaningful, non-generic keywords.
Outreach example should be natural and 1–2 sentences max.

IMPORTANT: If news_context is provided with recent company news, consider these items when crafting outreach guidance.
If a news item aligns well with the company's value proposition, propose a single, specific hook referencing it (max 1 sentence) in the example_message.
Never invent facts. Only reference news items that are actually provided in the news_context.`
          },
          {
            role: 'user',
            content: JSON.stringify(context)
          }
        ],
        temperature: 0.7,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      return new Response(
        JSON.stringify({ ok: false, error: { message: "AI analysis failed" } }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content;

    if (!aiContent) {
      return new Response(
        JSON.stringify({ ok: false, error: { message: "No AI response" } }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse AI response
    let insights;
    try {
      // Try to extract JSON from code blocks if present
      const jsonMatch = aiContent.match(/```json\s*([\s\S]*?)\s*```/) || aiContent.match(/```\s*([\s\S]*?)\s*```/);
      const jsonStr = jsonMatch ? jsonMatch[1] : aiContent;
      insights = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiContent);
      return new Response(
        JSON.stringify({ ok: false, error: { message: "Failed to parse AI response" } }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Store insights in database
    const { error: insertError } = await supabase
      .from('engagement_insights')
      .upsert({
        url,
        brand_voice: insights.brand_voice,
        key_messages: insights.key_messages,
        outreach_guidance: insights.outreach_guidance,
      });

    if (insertError) {
      console.error('Failed to store insights:', insertError);
      // Return the insights anyway
    }

    return new Response(
      JSON.stringify({ ok: true, data: insights }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in engagement-insights:', error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: { message: error instanceof Error ? error.message : "Unknown error" }
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
