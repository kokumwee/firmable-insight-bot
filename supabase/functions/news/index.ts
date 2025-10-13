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
    const { action, url, id } = await req.json();
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ACTION: list
    if (action === 'list') {
      if (!url) {
        return new Response(
          JSON.stringify({ ok: false, message: "URL is required" }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { data: items, error } = await supabase
        .from('company_news')
        .select('*')
        .eq('url', url)
        .eq('deleted', false)
        .order('published_at', { ascending: false })
        .order('relevance', { ascending: false })
        .limit(5);

      if (error) throw error;

      return new Response(
        JSON.stringify({ ok: true, items: items || [] }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: delete
    if (action === 'delete') {
      if (!id) {
        return new Response(
          JSON.stringify({ ok: false, message: "ID is required" }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const { error } = await supabase
        .from('company_news')
        .update({ deleted: true })
        .eq('id', id);

      if (error) throw error;

      return new Response(
        JSON.stringify({ ok: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ACTION: refresh
    if (action === 'refresh') {
      if (!url) {
        return new Response(
          JSON.stringify({ ok: false, message: "URL is required" }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log('Refreshing news for:', url);

      // Get company name from company_cards
      const { data: companyCard } = await supabase
        .from('company_cards')
        .select('name, url')
        .eq('url', url)
        .single();

      const companyName = companyCard?.name || new URL(url).hostname.replace('www.', '').split('.')[0];
      console.log('Company name:', companyName);

      // Get my_company_profile for relevance scoring
      const { data: myCompany } = await supabase
        .from('my_company_profile')
        .select('*')
        .single();

      // Get homepage chunks for context
      const { data: chunks } = await supabase
        .from('chunks')
        .select('text')
        .eq('url', url)
        .eq('page_type', 'homepage')
        .limit(3);

      const homepage_text = chunks?.map(c => c.text.substring(0, 300)).join('\n') || '';

      // Generate AI news guesses (fallback method when no external APIs configured)
      const aiPrompt = `Generate 3-5 plausible recent company news items for "${companyName}" (${url}).
      
Homepage context:
${homepage_text}

${myCompany ? `My company context (for relevance):
Name: ${myCompany.name || 'Unknown'}
Industry: ${myCompany.industry || 'Unknown'}
Value Proposition: ${myCompany.value_proposition || 'Unknown'}
Keywords: ${myCompany.keywords?.join(', ') || 'None'}` : ''}

Return strict JSON array of news items. Each item MUST have:
{
  "source": "ai_guess",
  "title": "Brief headline (max 80 chars)",
  "summary": "1-2 sentence summary (max 200 chars)",
  "quote": "A brief verbatim quote or key phrase (max 180 chars)",
  "link": "${url}",
  "published_at": "ISO date within last 60 days",
  "relevance": 0.0-1.0 (how relevant to my company/industry),
  "reason": "Why this is relevant (max 100 chars)"
}

Make items realistic based on the company's actual business. Higher relevance scores for items that align with my company context.
Do not invent fake people or quotes - use general statements.`;

      console.log('Calling AI for news generation...');
      const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: 'You are a news analyst. Always return valid JSON arrays only.' },
            { role: 'user', content: aiPrompt }
          ],
          temperature: 0.7,
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error('AI API error:', errorText);
        return new Response(
          JSON.stringify({ ok: false, message: "AI analysis failed" }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const aiData = await aiResponse.json();
      const aiContent = aiData.choices?.[0]?.message?.content;

      if (!aiContent) {
        return new Response(
          JSON.stringify({ ok: false, message: "No AI response" }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Parse AI response
      let newsItems;
      try {
        const jsonMatch = aiContent.match(/```json\s*([\s\S]*?)\s*```/) || aiContent.match(/```\s*([\s\S]*?)\s*```/);
        const jsonStr = jsonMatch ? jsonMatch[1] : aiContent;
        newsItems = JSON.parse(jsonStr);
        
        if (!Array.isArray(newsItems)) {
          throw new Error('Expected array of news items');
        }
      } catch (parseError) {
        console.error('Failed to parse AI response:', aiContent);
        return new Response(
          JSON.stringify({ ok: false, message: "Failed to parse AI response" }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Generated ${newsItems.length} news items`);

      // Mark previous items as deleted
      await supabase
        .from('company_news')
        .update({ deleted: true })
        .eq('url', url)
        .eq('deleted', false);

      // Insert top 5 items
      const itemsToInsert = newsItems.slice(0, 5).map((item: any) => ({
        url,
        source: item.source || 'ai_guess',
        title: item.title?.substring(0, 200) || 'Untitled',
        summary: item.summary?.substring(0, 500) || '',
        quote: item.quote?.substring(0, 180) || null,
        link: item.link || url,
        published_at: item.published_at || new Date().toISOString(),
        relevance: Math.max(0, Math.min(1, item.relevance || 0.5)),
        reason: item.reason?.substring(0, 200) || null,
        deleted: false,
      }));

      const { error: insertError } = await supabase
        .from('company_news')
        .insert(itemsToInsert);

      if (insertError) {
        console.error('Failed to insert news items:', insertError);
        throw insertError;
      }

      console.log('News refresh complete');
      return new Response(
        JSON.stringify({ ok: true, items: itemsToInsert }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Unknown action
    return new Response(
      JSON.stringify({ ok: false, message: "Invalid action. Use: list, refresh, or delete" }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in news function:', error);
    return new Response(
      JSON.stringify({
        ok: false,
        message: error instanceof Error ? error.message : "Unknown error"
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});