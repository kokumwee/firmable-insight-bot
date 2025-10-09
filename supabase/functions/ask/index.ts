import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function normalizeUrl(input: string): string {
  if (!input) return input;
  let url = input.trim();
  if (!/^https?:\/\//i.test(url)) {
    url = "https://" + url;
  }
  try {
    const u = new URL(url);
    u.host = u.host.toLowerCase();
    return u.toString();
  } catch {
    return url;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    let { url, query } = await req.json();
    
    if (!url || !query) {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: { code: 'MISSING_PARAMS', message: 'URL and query are required' }
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    url = normalizeUrl(url);
    console.log('Question:', query);
    console.log('Processing question for URL:', url);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    let { data: chunks, error: chunksError } = await supabase
      .from('chunks')
      .select('*')
      .eq('url', url)
      .order('text_offset');

    if (chunksError) {
      throw chunksError;
    }

    if (!chunks || chunks.length === 0) {
      console.log('No chunks found, analyzing URL first...');
      const analyzeResponse = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/analyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`
        },
        body: JSON.stringify({ url })
      });

      const analyzeResult = await analyzeResponse.json();
      
      if (!analyzeResult.ok) {
        return new Response(JSON.stringify({ 
          ok: false, 
          error: analyzeResult.error
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: newChunks, error: newChunksError } = await supabase
        .from('chunks')
        .select('*')
        .eq('url', url)
        .order('text_offset');

      if (newChunksError || !newChunks || newChunks.length === 0) {
        return new Response(JSON.stringify({ 
          ok: false, 
          error: { code: 'NO_CHUNKS', message: 'Failed to analyze URL' }
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      chunks = newChunks;
    }

    const { data: companyCard, error: cardError } = await supabase
      .from('company_cards')
      .select('*')
      .eq('url', url)
      .single();

    if (cardError && cardError.code !== 'PGRST116') {
      console.error('Error loading company card:', cardError);
    }

    // Simple keyword ranking to find relevant chunks
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/).filter((w: string) => w.length > 3);
    
    const rankedChunks = chunks.map(chunk => {
      const textLower = chunk.text.toLowerCase();
      let score = 0;
      for (const word of queryWords) {
        const matches = (textLower.match(new RegExp(word, 'g')) || []).length;
        score += matches;
      }
      return { ...chunk, score };
    }).sort((a, b) => b.score - a.score);

    const topChunks = rankedChunks.slice(0, 5).map(c => ({
      chunk_id: c.chunk_id,
      offset: c.text_offset,
      text: c.text
    }));

    console.log('Top chunks selected:', topChunks.length);

    // Call Lovable AI for Q&A
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: 'Answer ONLY from the provided chunks and CompanyCard fields. If unsupported, set guardrail="not_found". Keep answers ≤3 sentences. Return strict JSON: { "answer": "...", "citations": [{"snippet":"...","source":"homepage","offset":number}], "guardrail":"on_homepage|not_found" }'
          },
          {
            role: 'user',
            content: `URL: ${url}\n\nCompany Card:\n${JSON.stringify(companyCard || {})}\n\nRelevant Chunks:\n${JSON.stringify(topChunks)}\n\nQuestion: ${query}\n\nProvide answer with citations.`
          }
        ],
        temperature: 0.3
      })
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      throw new Error(`AI Q&A failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    let answerData;
    
    try {
      const content = aiData.choices[0].message.content;
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        answerData = JSON.parse(jsonMatch[0]);
      } else {
        answerData = JSON.parse(content);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiData.choices[0].message.content);
      // Retry
      const retryResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            {
              role: 'system',
              content: 'You returned invalid JSON. Return only valid JSON: { "answer": "string", "citations": [{"snippet":"string","source":"homepage","offset":number}], "guardrail":"on_homepage|not_found" }. No commentary.'
            },
            {
              role: 'user',
              content: `Previous: ${aiData.choices[0].message.content}\n\nReturn ONLY valid JSON.`
            }
          ],
          temperature: 0.1
        })
      });
      
      const retryData = await retryResponse.json();
      const retryContent = retryData.choices[0].message.content;
      const retryMatch = retryContent.match(/\{[\s\S]*\}/);
      answerData = JSON.parse(retryMatch ? retryMatch[0] : retryContent);
    }

    // Log to chat_logs
    await supabase.from('chat_logs').insert([
      {
        url: url,
        role: 'user',
        text: query,
        citations: null,
        guardrail: null
      },
      {
        url: url,
        role: 'assistant',
        text: answerData.answer,
        citations: answerData.citations || [],
        guardrail: answerData.guardrail || 'on_homepage'
      }
    ]);

    console.log('Q&A complete');
    return new Response(JSON.stringify({
      ok: true,
      data: {
        answer: answerData.answer,
        citations: answerData.citations || [],
        guardrail: answerData.guardrail || 'on_homepage'
      }
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in ask function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to process question';
    return new Response(
      JSON.stringify({ 
        ok: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: errorMessage
        }
      }), 
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
