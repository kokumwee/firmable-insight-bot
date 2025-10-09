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

async function tryRenderedFallback(_url: string): Promise<{ ok: boolean; html?: string; finalUrl?: string }> {
  return { ok: false };
}

function canonicalSameOrigin(base: URL, href: string): URL | null {
  try {
    const u = new URL(href, base);
    if (u.origin !== base.origin) return null;
    if (u.pathname === "/" && u.hash) return null; // ignore pure hash links
    return u;
  } catch { return null; }
}

function classifyPath(pathname: string): string {
  const p = pathname.toLowerCase();
  if (p === "/" || p === "") return "homepage";
  if (/about|about-us|who-we-are|company/.test(p)) return "about";
  if (/team|leadership|founders|board/.test(p)) return "team";
  if (/contact|get-in-touch|support/.test(p)) return "contact";
  if (/pricing|plans/.test(p)) return "pricing";
  if (/press|news|media|investors/.test(p)) return "press";
  return "other";
}

function scoreLink(anchorText: string, pathname: string): number {
  const t = (anchorText || "").toLowerCase();
  const p = (pathname || "").toLowerCase();
  let s = 0;
  if (/about|about-us|company|who-we-are|team|leadership|contact|pricing|press|media|investors/.test(t+p)) s += 5;
  if ((p.match(/\//g) || []).length <= 2) s += 2;
  if (/login|cart|checkout|privacy|terms/.test(p)) s -= 5;
  if (/\.(pdf|docx?|zip|jpg|jpeg|png|svg|mp4|webm)(\?|$)/i.test(p)) s -= 999;
  return s;
}

async function robustFetch(url: string) {
  let res = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-AU,en;q=0.9",
      "Cache-Control": "no-cache",
      "Pragma": "no-cache",
      "Upgrade-Insecure-Requests": "1",
      "Referer": "https://www.google.com/"
    }
  });

  if (!res.ok || res.status >= 400) {
    res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-AU,en;q=0.9",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        "Referer": "https://www.google.com/"
      }
    });
  }

  let body = await res.text();
  const finalUrl = res.url;

  const looksBlocked =
    !res.ok ||
    res.status >= 400 ||
    body.length < 2500 ||
    /access\s*denied|enable\s*javascript|cloudflare|akamai|attention\s*required/i.test(body);

  if (looksBlocked) {
    const rendered = await tryRenderedFallback(finalUrl);
    if (rendered?.ok && rendered.html && rendered.html.length > 2500) {
      return { ok: true, html: rendered.html, finalUrl: rendered.finalUrl || finalUrl, source: "rendered" };
    }
    return {
      ok: false,
      code: res.status >= 400 ? `HTTP_${res.status}` : "BLOCKED_OR_EMPTY",
      message: "This site appears to block automated reads or requires JavaScript rendering.",
      snippet: body.slice(0, 1200),
      finalUrl
    };
  }

  return { ok: true, html: body, finalUrl, source: "direct" };
}

function isLikelyEmptyHomepage(html: string): boolean {
  const text = html.replace(/<script[\s\S]*?<\/script>/gi, "")
                   .replace(/<style[\s\S]*?<\/style>/gi, "")
                   .replace(/<[^>]+>/g, " ")
                   .replace(/\s+/g, " ")
                   .trim();
  return text.length < 1200;
}

function toShortBulletsFromOfferings(aiOfferings: string[], maxWords = 12): string[] {
  const bullets = aiOfferings
    .map(s => (s || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map(s => {
      s = s.replace(/\b(\w+)\s+\1\b/gi, "$1");
      const words = s.split(" ");
      const trimmed = words.slice(0, maxWords).join(" ");
      const sentence = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
      return sentence.replace(/[.;,:-]+$/,"");
    });
  const seen = new Set(); 
  return bullets.filter(b => (seen.has(b.toLowerCase()) ? false : (seen.add(b.toLowerCase()), true)));
}

function compressDetails(text: string, maxLen = 180): string {
  const t = (text || "").replace(/\s+/g, " ").trim();
  return t.length <= maxLen ? t : (t.slice(0, maxLen - 1) + "…");
}

function sanitizeSocial(raw: string | null): { url: string | null; is_valid: boolean; note: string } {
  if (!raw) return { url: null, is_valid: false, note: "missing" };
  let url = raw.trim();
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const allowed = ["linkedin.com","www.linkedin.com","twitter.com","x.com","www.twitter.com","www.x.com","facebook.com","www.facebook.com","instagram.com","www.instagram.com"];
    if (!allowed.includes(host)) return { url: u.toString(), is_valid: false, note: "untrusted_host" };
    if (host === "x.com" || host === "www.x.com") { u.hostname = "twitter.com"; }
    if (u.pathname === "/" || u.pathname === "") {
      return { url: u.toString(), is_valid: false, note: "untrusted_host" };
    }
    const note = /facebook|instagram/.test(u.hostname) ? "may_require_login" : "ok";
    return { url: u.toString(), is_valid: true, note };
  } catch {
    return { url: null, is_valid: false, note: "bad_url" };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    
    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: { code: 'INVALID_URL', message: 'Invalid URL provided' }
      }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const normalizedUrl = normalizeUrl(url);
    console.log('Analyzing URL:', normalizedUrl);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Fetching HTML...');
    const fetchResult = await robustFetch(normalizedUrl);

    if (!fetchResult.ok) {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: { 
          code: fetchResult.code, 
          message: fetchResult.message 
        }
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const html = fetchResult.html!;
    
    if (isLikelyEmptyHomepage(html)) {
      return new Response(JSON.stringify({ 
        ok: false, 
        error: { 
          code: 'EMPTY_CONTENT', 
          message: "We couldn't read this homepage (likely JS-only or blocked)." 
        }
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Parsing...');
    let cleanedHtml = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    cleanedHtml = cleanedHtml.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    cleanedHtml = cleanedHtml.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '');
    cleanedHtml = cleanedHtml.replace(/\s+/g, ' ').trim();

    const titleMatch = cleanedHtml.match(/<title[^>]*>([^<]+)<\/title>/i);
    const h1Match = cleanedHtml.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const extractedName = titleMatch?.[1] || h1Match?.[1] || null;

    const textContent = cleanedHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    // Crawl additional pages
    console.log('Crawling additional pages...');
    const CRAWL_ENABLED = Deno.env.get('CRAWL_ENABLED') !== 'false';
    const CRAWL_MAX_PAGES = parseInt(Deno.env.get('CRAWL_MAX_PAGES') || '3');
    const baseUrl = new URL(fetchResult.finalUrl);
    
    interface PageData {
      url: string;
      path: string;
      page_type: string;
      text: string;
    }
    
    const allPages: PageData[] = [{
      url: baseUrl.toString(),
      path: baseUrl.pathname,
      page_type: classifyPath(baseUrl.pathname),
      text: textContent
    }];

    if (CRAWL_ENABLED && CRAWL_MAX_PAGES > 0) {
      const startTime = Date.now();
      const MAX_CRAWL_TIME = 8000; // 8 seconds max

      // Parse anchors from homepage
      const anchorRegex = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi;
      const candidates: Array<{ url: URL; text: string; score: number }> = [];
      
      let match;
      while ((match = anchorRegex.exec(cleanedHtml)) !== null) {
        const href = match[1];
        const anchorText = match[2];
        const candidateUrl = canonicalSameOrigin(baseUrl, href);
        
        if (candidateUrl && candidateUrl.pathname !== baseUrl.pathname) {
          const score = scoreLink(anchorText, candidateUrl.pathname);
          if (score > -5) {
            candidates.push({ url: candidateUrl, text: anchorText, score });
          }
        }
      }

      // Sort by score and deduplicate by pathname
      candidates.sort((a, b) => b.score - a.score);
      const seenPaths = new Set([baseUrl.pathname]);
      const topCandidates = candidates.filter(c => {
        if (seenPaths.has(c.url.pathname)) return false;
        seenPaths.add(c.url.pathname);
        return true;
      }).slice(0, CRAWL_MAX_PAGES);

      console.log(`Found ${topCandidates.length} pages to crawl`);

      // Crawl each page with throttling
      for (const candidate of topCandidates) {
        if (Date.now() - startTime > MAX_CRAWL_TIME) {
          console.log('Crawl time limit reached');
          break;
        }

        try {
          // Throttle: wait 600ms between requests
          await new Promise(resolve => setTimeout(resolve, 600));
          
          const crawlResult = await robustFetch(candidate.url.toString());
          
          if (crawlResult.ok && !isLikelyEmptyHomepage(crawlResult.html!)) {
            let crawlCleanedHtml = crawlResult.html!.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
            crawlCleanedHtml = crawlCleanedHtml.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
            crawlCleanedHtml = crawlCleanedHtml.replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '');
            const crawlText = crawlCleanedHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            
            allPages.push({
              url: candidate.url.toString(),
              path: candidate.url.pathname,
              page_type: classifyPath(candidate.url.pathname),
              text: crawlText
            });
            
            console.log(`Crawled ${candidate.url.pathname} (${classifyPath(candidate.url.pathname)})`);
          }
        } catch (err) {
          console.error(`Failed to crawl ${candidate.url.pathname}:`, err);
          // Continue with other pages
        }
      }
    }

    console.log('Extracting...');
    // Create chunks from all pages (700-800 chars each)
    const chunks: Array<{ chunk_id: string; text: string; offset: number; source_url: string; page_type: string }> = [];
    const chunkSize = 750;
    let chunkIndex = 0;

    for (const page of allPages) {
      let offset = 0;
      while (offset < page.text.length) {
        const chunkText = page.text.slice(offset, offset + chunkSize);
        chunks.push({
          chunk_id: `c${chunkIndex + 1}`,
          text: chunkText,
          offset,
          source_url: page.url,
          page_type: page.page_type
        });
        offset += chunkSize;
        chunkIndex++;
      }
    }

    console.log(`Created ${chunks.length} chunks from ${allPages.length} pages`);

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
    const mailtoMatches = cleanedHtml.matchAll(/mailto:([^\s"'<>]+)/gi);
    for (const match of mailtoMatches) {
      emails.add(match[1].toLowerCase());
    }
    const emailMatches = textContent.matchAll(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g);
    for (const match of emailMatches) {
      emails.add(match[0].toLowerCase());
    }

    // Extract phones
    const telMatches = cleanedHtml.matchAll(/tel:([^\s"'<>]+)/gi);
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
    const linkMatches = cleanedHtml.matchAll(/href=["']([^"']+)["']/gi);
    for (const match of linkMatches) {
      const href = match[1].toLowerCase();
      if (href.includes('linkedin.com')) socials.linkedin = match[1];
      else if (href.includes('twitter.com') || href.includes('x.com')) socials.twitter = match[1];
      else if (href.includes('facebook.com')) socials.facebook = match[1];
      else if (href.includes('instagram.com')) socials.instagram = match[1];
    }

    console.log('Summarising...');
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
            content: 'You extract company info from provided text chunks that may come from the homepage and other key pages (about/company/team/contact/pricing/press). Prefer facts from about/company pages for company size, HQ, and leadership. If uncertain, set value=null and confidence="low". For each non-null value add 1-2 evidence snippets (≤180 chars) with source_url and page_type. Return ONLY valid JSON, no commentary.'
          },
          {
            role: 'user',
            content: `URL: ${normalizedUrl}\n\nExtracted title/h1: ${extractedName}\n\nChunks (from multiple pages):\n${JSON.stringify(chunks.slice(0, 12).map(c => ({ chunk_id: c.chunk_id, text: c.text, offset: c.offset, source_url: c.source_url, page_type: c.page_type })))}\n\nExtract and return JSON with this exact schema:\n{\n  "name": "string or null",\n  "industry": {"value":"string or null","confidence":"high|medium|low","evidence":[{"snippet":"string","source_url":"string","page_type":"string","offset":number}]},\n  "company_size": {"value":"string or null","confidence":"high|medium|low","evidence":[{"snippet":"string","source_url":"string","page_type":"string","offset":number}]},\n  "hq_location": {"value":"string or null","confidence":"high|medium|low","evidence":[{"snippet":"string","source_url":"string","page_type":"string","offset":number}]},\n  "usp": {"value":"string or null","confidence":"high|medium|low","evidence":[{"snippet":"string","source_url":"string","page_type":"string","offset":number}]},\n  "offerings_raw": [{"snippet":"string (≤12 words, productized, sentence-case, deduplicated)","details":"1-2 sentence description (≤180 chars)","source_url":"string","page_type":"string","offset":number}],\n  "target_audience_raw": ["Short audience bullet 1 (≤12 words)","Short audience bullet 2 (≤12 words)"]\n}\n\nFor offerings_raw: return 5-10 short, productized phrases (≤12 words each), sentence-case, no brand repetition. Each with a brief 1-2 sentence description and source information.\nFor target_audience_raw: return a list of short bullets (≤12 words each), each representing a distinct audience segment.\nWhen producing evidence, include the exact snippet, source_url (absolute URL), page_type, and offset from the chunks provided.`
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
              content: `Previous response: ${aiData.choices[0].message.content}\n\nReturn ONLY valid JSON matching this schema:\n{\n  "name": "string or null",\n  "industry": {"value":"string or null","confidence":"high|medium|low","evidence":[{"snippet":"string","source_url":"string","page_type":"string","offset":number}]},\n  "company_size": {"value":"string or null","confidence":"high|medium|low","evidence":[{"snippet":"string","source_url":"string","page_type":"string","offset":number}]},\n  "hq_location": {"value":"string or null","confidence":"high|medium|low","evidence":[{"snippet":"string","source_url":"string","page_type":"string","offset":number}]},\n  "usp": {"value":"string or null","confidence":"high|medium|low","evidence":[{"snippet":"string","source_url":"string","page_type":"string","offset":number}]},\n  "offerings_raw": [{"snippet":"string (≤12 words)","details":"1-2 sentence (≤180 chars)","source_url":"string","page_type":"string","offset":number}],\n  "target_audience_raw": ["Short audience bullet 1 (≤12 words)","Short audience bullet 2 (≤12 words)"]\n}`
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

    // Transform offerings
    const offeringsRaw = extractedData.offerings_raw || [];
    const offeringBullets = toShortBulletsFromOfferings(
      offeringsRaw.map((o: any) => o.snippet || o)
    );
    const offerings_bulleted = offeringBullets.map((bullet, idx) => {
      const rawItem = offeringsRaw[idx] || {};
      return {
        bullet,
        details: compressDetails(rawItem.details || bullet, 180),
        evidence: rawItem.evidence || (rawItem.snippet ? [{ 
          snippet: rawItem.snippet, 
          source_url: rawItem.source_url || normalizedUrl, 
          page_type: rawItem.page_type || "homepage",
          offset: rawItem.offset || 0 
        }] : [])
      };
    });

    // Transform target audience
    const targetAudienceRaw = extractedData.target_audience_raw || [];
    const target_audience_list = toShortBulletsFromOfferings(targetAudienceRaw, 12);

    // Sanitize socials
    const sanitizedSocials = {
      linkedin: sanitizeSocial(socials.linkedin),
      twitter: sanitizeSocial(socials.twitter),
      facebook: sanitizeSocial(socials.facebook),
      instagram: sanitizeSocial(socials.instagram)
    };

    // Build CompanyCard
    const analyzed_at = new Date().toISOString();
    const companyCard = {
      name: extractedData.name || extractedName,
      url: normalizedUrl,
      industry: extractedData.industry || { value: null, confidence: 'low', evidence: [] },
      company_size: extractedData.company_size || { value: null, confidence: 'low', evidence: [] },
      hq_location: extractedData.hq_location || { value: null, confidence: 'low', evidence: [] },
      usp: extractedData.usp || { value: null, confidence: 'low', evidence: [] },
      offerings: offeringsRaw,
      offerings_bulleted,
      target_audience: extractedData.target_audience || { value: null, confidence: 'low', evidence: [] },
      target_audience_list,
      contacts: {
        emails: Array.from(emails),
        phones: Array.from(phones),
        socials: sanitizedSocials
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
      text_offset: chunk.offset,
      path: new URL(chunk.source_url).pathname,
      page_type: chunk.page_type
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
      analysis_json: {
        ...companyCard,
        offerings_bulleted: companyCard.offerings_bulleted,
        target_audience_list: companyCard.target_audience_list
      }
    });

    if (cardError) {
      console.error('Error upserting company card:', cardError);
      throw cardError;
    }

    console.log('Analysis complete');
    return new Response(JSON.stringify({ ok: true, data: companyCard }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in analyze function:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to analyze website. Please try another URL.';
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
