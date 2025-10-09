import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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
    
    // Validate URL
    if (!url || typeof url !== 'string') {
      throw new Error('Invalid URL provided');
    }
    
    const normalizedUrl = url.trim().toLowerCase();
    if (!normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      throw new Error('URL must start with http:// or https://');
    }

    console.log('Analyzing URL:', normalizedUrl);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch homepage HTML
    console.log('Fetching HTML...');
    const fetchResponse = await fetch(normalizedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 FirmableDemo/1.0'
      },
      redirect: 'follow'
    });

    if (!fetchResponse.ok) {
      throw new Error(`Failed to fetch URL: ${fetchResponse.status} ${fetchResponse.statusText}`);
    }

    let html = await fetchResponse.text();
    
    // Clean HTML
    html = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    html = html.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    html = html.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '');
    html = html.replace(/\s+/g, ' ').trim();

    // Extract title and h1
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const extractedName = titleMatch?.[1] || h1Match?.[1] || null;

    // Extract text content (strip all HTML tags)
    const textContent = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    
    if (textContent.length < 100) {
      throw new Error('Not enough content found on the page');
    }

    console.log('Creating chunks...');
    // Create chunks (700-800 chars each)
    const chunks: Array<{ chunk_id: string; text: string; offset: number }> = [];
    const chunkSize = 750;
    let offset = 0;
    let chunkIndex = 0;

    while (offset < textContent.length) {
      const chunkText = textContent.slice(offset, offset + chunkSize);
      chunks.push({
        chunk_id: `c${chunkIndex + 1}`,
        text: chunkText,
        offset
      });
      offset += chunkSize;
      chunkIndex++;
    }

    console.log(`Created ${chunks.length} chunks`);

    // Extract contacts
    const emails = new Set<string>();
    const phones = new Set<string>();
    const socials: { linkedin: string | null; twitter: string | null; facebook: string | null; instagram: string | null } = { 
      linkedin: null, 
      twitter: null, 
      facebook: null, 
      instagram: null 
    };

    // Extract emails
    const mailtoMatches = html.matchAll(/mailto:([^\s"'<>]+)/gi);
    for (const match of mailtoMatches) {
      emails.add(match[1].toLowerCase());
    }
    const emailMatches = textContent.matchAll(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g);
    for (const match of emailMatches) {
      emails.add(match[0].toLowerCase());
    }

    // Extract phones
    const telMatches = html.matchAll(/tel:([^\s"'<>]+)/gi);
    for (const match of telMatches) {
      phones.add(match[1]);
    }
    const phoneMatches = textContent.matchAll(/[\+\(]?[1-9][\d\s\-\(\)\.]{7,}\d/g);
    for (const match of phoneMatches) {
      const cleaned = match[0].replace(/\s+/g, '');
      if (cleaned.length >= 10) {
        phones.add(match[0]);
      }
    }

    // Extract social links
    const linkMatches = html.matchAll(/href=["']([^"']+)["']/gi);
    for (const match of linkMatches) {
      const href = match[1].toLowerCase();
      if (href.includes('linkedin.com')) socials.linkedin = match[1];
      else if (href.includes('twitter.com') || href.includes('x.com')) socials.twitter = match[1];
      else if (href.includes('facebook.com')) socials.facebook = match[1];
      else if (href.includes('instagram.com')) socials.instagram = match[1];
    }

    // Call Lovable AI for extraction
    console.log('Calling AI for extraction...');
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
            content: 'You extract company info ONLY from provided homepage text chunks. If uncertain, set value=null and confidence="low". For each non-null value add 1-2 evidence snippets (≤180 chars) and offsets when available. Return ONLY valid JSON, no commentary.'
          },
          {
            role: 'user',
            content: `URL: ${normalizedUrl}\n\nExtracted title/h1: ${extractedName}\n\nChunks:\n${JSON.stringify(chunks.slice(0, 12))}\n\nExtract and return JSON with this exact schema:\n{\n  "name": "string or null",\n  "industry": {"value":"string or null","confidence":"high|medium|low","evidence":[{"snippet":"string","source":"homepage","offset":number}]},\n  "company_size": {"value":"string or null","confidence":"high|medium|low","evidence":[{"snippet":"string","source":"homepage","offset":number}]},\n  "hq_location": {"value":"string or null","confidence":"high|medium|low","evidence":[{"snippet":"string","source":"homepage","offset":number}]},\n  "usp": {"value":"string or null","confidence":"high|medium|low","evidence":[{"snippet":"string","source":"homepage","offset":number}]},\n  "offerings": [{"snippet":"string","source":"homepage","offset":number}],\n  "target_audience": {"value":"string or null","confidence":"high|medium|low","evidence":[{"snippet":"string","source":"homepage","offset":number}]}\n}`
          }
        ],
        temperature: 0.3
      })
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', errorText);
      throw new Error(`AI extraction failed: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    let extractedData;
    
    try {
      const content = aiData.choices[0].message.content;
      // Try to parse JSON from the content
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extractedData = JSON.parse(jsonMatch[0]);
      } else {
        extractedData = JSON.parse(content);
      }
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiData.choices[0].message.content);
      // Retry with stricter instruction
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
              content: 'You returned invalid JSON. Return only valid JSON that matches the schema exactly. No commentary, no markdown, just raw JSON.'
            },
            {
              role: 'user',
              content: `Previous response: ${aiData.choices[0].message.content}\n\nReturn ONLY valid JSON matching this schema:\n{\n  "name": "string or null",\n  "industry": {"value":"string or null","confidence":"high|medium|low","evidence":[{"snippet":"string","source":"homepage","offset":number}]},\n  "company_size": {"value":"string or null","confidence":"high|medium|low","evidence":[{"snippet":"string","source":"homepage","offset":number}]},\n  "hq_location": {"value":"string or null","confidence":"high|medium|low","evidence":[{"snippet":"string","source":"homepage","offset":number}]},\n  "usp": {"value":"string or null","confidence":"high|medium|low","evidence":[{"snippet":"string","source":"homepage","offset":number}]},\n  "offerings": [{"snippet":"string","source":"homepage","offset":number}],\n  "target_audience": {"value":"string or null","confidence":"high|medium|low","evidence":[{"snippet":"string","source":"homepage","offset":number}]}\n}`
            }
          ],
          temperature: 0.1
        })
      });
      
      const retryData = await retryResponse.json();
      const retryContent = retryData.choices[0].message.content;
      const retryMatch = retryContent.match(/\{[\s\S]*\}/);
      extractedData = JSON.parse(retryMatch ? retryMatch[0] : retryContent);
    }

    // Build CompanyCard
    const analyzed_at = new Date().toISOString();
    const companyCard = {
      name: extractedData.name || extractedName,
      url: normalizedUrl,
      industry: extractedData.industry || { value: null, confidence: 'low', evidence: [] },
      company_size: extractedData.company_size || { value: null, confidence: 'low', evidence: [] },
      hq_location: extractedData.hq_location || { value: null, confidence: 'low', evidence: [] },
      usp: extractedData.usp || { value: null, confidence: 'low', evidence: [] },
      offerings: extractedData.offerings || [],
      target_audience: extractedData.target_audience || { value: null, confidence: 'low', evidence: [] },
      contacts: {
        emails: Array.from(emails),
        phones: Array.from(phones),
        socials
      },
      analyzed_at
    };

    console.log('Persisting to database...');
    
    // Delete old chunks
    await supabase.from('chunks').delete().eq('url', normalizedUrl);

    // Insert new chunks
    const chunksToInsert = chunks.map(chunk => ({
      url: normalizedUrl,
      chunk_id: chunk.chunk_id,
      text: chunk.text,
      text_offset: chunk.offset
    }));
    
    const { error: chunksError } = await supabase.from('chunks').insert(chunksToInsert);
    if (chunksError) {
      console.error('Error inserting chunks:', chunksError);
    }

    // Upsert company card
    const { error: cardError } = await supabase.from('company_cards').upsert({
      url: normalizedUrl,
      name: companyCard.name,
      industry: companyCard.industry,
      company_size: companyCard.company_size,
      hq_location: companyCard.hq_location,
      usp: companyCard.usp,
      offerings: companyCard.offerings,
      target_audience: companyCard.target_audience,
      contacts: companyCard.contacts,
      analyzed_at: companyCard.analyzed_at,
      analysis_json: companyCard
    });

    if (cardError) {
      console.error('Error upserting company card:', cardError);
      throw cardError;
    }

    console.log('Analysis complete');
    return new Response(JSON.stringify(companyCard), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to analyze website. Please try another URL.';
    return new Response(
      JSON.stringify({ 
        error: errorMessage
      }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
