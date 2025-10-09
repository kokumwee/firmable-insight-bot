import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// Config caps
const CRAWL_MAX_PAGES = 250;
const CRAWL_MAX_DEPTH = 4;
const CRAWL_MAX_PER_SECTION = 80;
const REQUEST_DELAY_MS = 500;
const FETCH_TIMEOUT_MS = 15000;
const MAX_CHUNKS_FOR_LLM = 60;
const MIN_TEXT_LEN = 1200;

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
    u.hash = ""; // remove fragments
    return u.toString();
  } catch {
    return url;
  }
}

async function fetchText(url: string, headers?: Record<string, string>): Promise<{ ok: boolean; status: number; url: string; text: string }> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) FirmableDemo/1.0",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-AU,en;q=0.9",
        ...headers
      }
    });
    return { ok: res.ok, status: res.status, url: res.url, text: await res.text() };
  } catch (err) {
    console.error(`Fetch error for ${url}:`, err);
    return { ok: false, status: 0, url, text: "" };
  }
}

async function tryRobots(base: URL): Promise<string | null> {
  try {
    const r = await fetchText(new URL("/robots.txt", base).toString());
    if (!r.ok) return null;
    return r.text;
  } catch { return null; }
}

function allowedByRobots(robotsTxt: string | null, path: string): boolean {
  if (!robotsTxt) return true;
  const lines = robotsTxt.split(/\r?\n/).map(l => l.trim());
  const disallow: string[] = [];
  for (const line of lines) {
    if (/^disallow:/i.test(line)) {
      const p = line.split(":")[1]?.trim() || "";
      if (p) disallow.push(p);
    }
  }
  return !disallow.some(rule => path.startsWith(rule));
}

function classifyPath(pathname: string): string {
  const p = pathname.toLowerCase();
  if (p === "/" || p === "") return "homepage";
  if (/about|about-us|who-we-are|company/.test(p)) return "about";
  if (/team|leadership|founders|board/.test(p)) return "team";
  if (/contact|get-in-touch|support/.test(p)) return "contact";
  if (/pricing|plans/.test(p)) return "pricing";
  if (/press|news|media|investors/.test(p)) return "press";
  if (/blog|articles|insights|resources/.test(p)) return "blog";
  if (/docs|documentation|developers|api/.test(p)) return "docs";
  if (/careers|jobs|join/.test(p)) return "career";
  if (/privacy|terms|legal/.test(p)) return "legal";
  return "other";
}

// Sitemap discovery and parsing
async function discoverSitemap(baseUrl: URL): Promise<{ urls: string[]; via: string }> {
  const sitemapPaths = [
    "/sitemap.xml",
    "/sitemap_index.xml",
    "/sitemap.txt",
    "/sitemap/sitemap.xml",
    "/sitemap.xml.gz"
  ];

  for (const path of sitemapPaths) {
    try {
      const sitemapUrl = new URL(path, baseUrl).toString();
      console.log(`Trying sitemap: ${sitemapUrl}`);
      const res = await fetchText(sitemapUrl);
      
      if (res.ok && res.text.length > 0) {
        // Check if it's gzipped
        if (path.endsWith('.gz')) {
          // Skip .gz for MVP - would need decompression library
          continue;
        }

        // Check if it's a sitemap index
        if (res.text.includes('<sitemapindex')) {
          const childSitemaps = res.text.matchAll(/<loc>([^<]+)<\/loc>/gi);
          const allUrls: string[] = [];
          
          for (const match of childSitemaps) {
            const childUrl = match[1].trim();
            if (childUrl.startsWith(baseUrl.origin)) {
              try {
                const childRes = await fetchText(childUrl);
                if (childRes.ok) {
                  const childUrls = extractUrlsFromSitemap(childRes.text, baseUrl.origin);
                  allUrls.push(...childUrls);
                }
              } catch (err) {
                console.error(`Error fetching child sitemap ${childUrl}:`, err);
              }
            }
          }
          
          if (allUrls.length > 0) {
            return { urls: allUrls.slice(0, CRAWL_MAX_PAGES), via: "sitemap" };
          }
        } else {
          // Regular sitemap
          const urls = extractUrlsFromSitemap(res.text, baseUrl.origin);
          if (urls.length > 0) {
            return { urls: urls.slice(0, CRAWL_MAX_PAGES), via: "sitemap" };
          }
        }
      }
    } catch (err) {
      console.error(`Error checking sitemap ${path}:`, err);
    }
  }

  return { urls: [], via: "fallback" };
}

function extractUrlsFromSitemap(xml: string, origin: string): string[] {
  const urls: string[] = [];
  const locMatches = xml.matchAll(/<loc>([^<]+)<\/loc>/gi);
  
  for (const match of locMatches) {
    const url = match[1].trim();
    try {
      const u = new URL(url);
      if (u.origin === origin) {
        urls.push(normalizeUrl(url));
      }
    } catch {
      // Invalid URL, skip
    }
  }
  
  return [...new Set(urls)]; // dedupe
}

// BFS crawl fallback
async function bfsCrawl(baseUrl: URL, robotsTxt: string | null): Promise<string[]> {
  const visited = new Set<string>([baseUrl.pathname]);
  const queue: Array<{ url: URL; depth: number }> = [{ url: baseUrl, depth: 0 }];
  const result: string[] = [baseUrl.toString()];
  
  console.log("Starting BFS fallback crawl...");

  while (queue.length > 0 && result.length < CRAWL_MAX_PAGES) {
    const { url, depth } = queue.shift()!;
    
    if (depth >= CRAWL_MAX_DEPTH) continue;

    try {
      await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));
      const res = await fetchText(url.toString());
      
      if (!res.ok) continue;

      // Extract links
      const linkMatches = res.text.matchAll(/<a\s+[^>]*href=["']([^"']+)["'][^>]*>([^<]*)<\/a>/gi);
      const candidates: Array<{ url: URL; text: string; score: number }> = [];

      for (const match of linkMatches) {
        const href = match[1];
        const anchorText = match[2];
        
        try {
          const candidateUrl = new URL(href, url);
          if (candidateUrl.origin !== baseUrl.origin) continue;
          if (visited.has(candidateUrl.pathname)) continue;
          if (!allowedByRobots(robotsTxt, candidateUrl.pathname)) continue;
          
          // Skip unwanted paths
          if (/\.(pdf|docx?|zip|jpg|jpeg|png|svg|mp4|webm)(\?|$)/i.test(candidateUrl.pathname)) continue;
          if (/login|cart|checkout|search/.test(candidateUrl.pathname)) continue;

          const score = scoreLink(anchorText, candidateUrl.pathname);
          if (score > -5) {
            candidates.push({ url: candidateUrl, text: anchorText, score });
          }
        } catch {
          // Invalid URL, skip
        }
      }

      // Sort by score and add to queue
      candidates.sort((a, b) => b.score - a.score);
      for (const candidate of candidates.slice(0, 10)) {
        if (!visited.has(candidate.url.pathname)) {
          visited.add(candidate.url.pathname);
          queue.push({ url: candidate.url, depth: depth + 1 });
          result.push(candidate.url.toString());
          
          if (result.length >= CRAWL_MAX_PAGES) break;
        }
      }
    } catch (err) {
      console.error(`BFS error for ${url}:`, err);
    }
  }

  return result;
}

function scoreLink(anchorText: string, pathname: string): number {
  const t = (anchorText || "").toLowerCase();
  const p = (pathname || "").toLowerCase();
  let s = 0;
  
  // Prioritize important sections
  if (/about|company|who-we-are|team|leadership|contact|pricing|press|media|investors/.test(t + p)) s += 5;
  if (/about|company/.test(p)) s += 3;
  if (/team|leadership/.test(p)) s += 3;
  
  // Prefer shorter paths
  if ((p.match(/\//g) || []).length <= 2) s += 2;
  
  // Penalize
  if (/login|cart|checkout|privacy|terms/.test(p)) s -= 5;
  
  return s;
}

async function robustFetch(url: string) {
  let res = await fetch(url, {
    method: "GET",
    redirect: "follow",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "en-AU,en;q=0.9",
      "Cache-Control": "no-cache",
    }
  });

  if (!res.ok || res.status >= 400) {
    res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "User-Agent": "Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      }
    });
  }

  const body = await res.text();
  const looksBlocked = !res.ok || res.status >= 400 || body.length < 2500 ||
    /access\s*denied|enable\s*javascript|cloudflare/i.test(body);

  if (looksBlocked) {
    return {
      ok: false,
      code: res.status >= 400 ? `HTTP_${res.status}` : "BLOCKED_OR_EMPTY",
      message: "Site blocked or requires JavaScript",
    };
  }

  return { ok: true, html: body, finalUrl: res.url };
}

// Main crawl function
async function crawlSite(url: string, supabase: any): Promise<{ pages: any[]; chunks: any[]; truncated: boolean }> {
  const startTime = Date.now();
  const MAX_CRAWL_TIME = 90000; // 90 seconds
  
  const normalizedUrl = normalizeUrl(url);
  const baseUrl = new URL(normalizedUrl);
  
  console.log("Loading robots.txt...");
  const robotsTxt = await tryRobots(baseUrl);
  
  console.log("Discovering sitemap...");
  const { urls, via } = await discoverSitemap(baseUrl);
  
  let urlList: string[];
  if (urls.length > 0) {
    console.log(`Found ${urls.length} URLs via sitemap`);
    urlList = urls;
  } else {
    console.log("No sitemap found, using BFS fallback");
    urlList = await bfsCrawl(baseUrl, robotsTxt);
    console.log(`BFS found ${urlList.length} URLs`);
  }

  // Track per-section counts
  const sectionCounts: Record<string, number> = {};
  const pages: any[] = [];
  const chunks: any[] = [];
  let chunkIndex = 0;
  let truncated = false;

  console.log(`Crawling ${urlList.length} pages...`);

  for (let i = 0; i < urlList.length; i++) {
    if (Date.now() - startTime > MAX_CRAWL_TIME) {
      console.log("Time limit reached, truncating");
      truncated = true;
      break;
    }

    const pageUrl = urlList[i];
    const pageUrlObj = new URL(pageUrl);
    const pageType = classifyPath(pageUrlObj.pathname);

    // Check section cap
    if (sectionCounts[pageType] >= CRAWL_MAX_PER_SECTION) {
      console.log(`Skipping ${pageUrl} - section ${pageType} cap reached`);
      continue;
    }

    try {
      // Polite delay
      if (i > 0) await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));

      const fetchResult = await robustFetch(pageUrl);
      
      if (!fetchResult.ok) {
        // Store as blocked
        await supabase.from('pages').upsert({
          url: pageUrl,
          origin: baseUrl.origin,
          path: pageUrlObj.pathname,
          page_type: pageType,
          status_code: 0,
          blocked: true,
          content_len: 0
        });
        continue;
      }

      // Clean HTML
      let cleanedHtml = fetchResult.html!.replace(/<script[\s\S]*?<\/script>/gi, '');
      cleanedHtml = cleanedHtml.replace(/<style[\s\S]*?<\/style>/gi, '');
      cleanedHtml = cleanedHtml.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
      const textContent = cleanedHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

      if (textContent.length < MIN_TEXT_LEN) {
        console.log(`Skipping ${pageUrl} - too short`);
        continue;
      }

      // Calculate hash
      const encoder = new TextEncoder();
      const data = encoder.encode(textContent);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const contentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      // Store page
      const { data: pageData, error: pageError } = await supabase.from('pages').upsert({
        url: pageUrl,
        origin: baseUrl.origin,
        path: pageUrlObj.pathname,
        page_type: pageType,
        status_code: 200,
        content_hash: contentHash,
        content_len: textContent.length,
        blocked: false
      }).select().single();

      if (pageError) {
        console.error("Error storing page:", pageError);
        continue;
      }

      pages.push(pageData);
      sectionCounts[pageType] = (sectionCounts[pageType] || 0) + 1;

      // Chunk text
      const chunkSize = 750;
      let offset = 0;
      while (offset < textContent.length) {
        const chunkText = textContent.slice(offset, offset + chunkSize);
        chunks.push({
          page_id: pageData.id,
          url: normalizedUrl,
          chunk_id: `c${chunkIndex + 1}`,
          text: chunkText,
          text_offset: offset,
          source_url: pageUrl,
          path: pageUrlObj.pathname,
          page_type: pageType
        });
        offset += chunkSize;
        chunkIndex++;
      }

      console.log(`Crawled ${i + 1}/${urlList.length}: ${pageUrl} (${pageType})`);

    } catch (err) {
      console.error(`Error crawling ${pageUrl}:`, err);
    }
  }

  return { pages, chunks, truncated };
}

// Select best chunks for LLM
function selectBestChunks(chunks: any[], maxChunks: number): any[] {
  const keywords = [
    "industry", "customers", "pricing", "team", "about", "mission",
    "headquarters", "hq", "location", "employees", "subscription",
    "billing", "identity", "compliance", "founded", "leader"
  ];

  const scored = chunks.map(chunk => {
    let score = 0;
    
    // Page type scoring
    if (["about", "company", "team", "contact", "pricing", "press"].includes(chunk.page_type)) score += 5;
    if (chunk.page_type === "homepage") score += 3;
    if (["legal", "privacy", "terms"].includes(chunk.page_type)) score -= 2;
    
    // Keyword scoring
    const text = chunk.text.toLowerCase();
    for (const kw of keywords) {
      if (text.includes(kw)) score += 1;
    }
    
    return { chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);

  // Limit chunks per page type for diversity
  const typeCount: Record<string, number> = {};
  const selected: any[] = [];

  for (const { chunk } of scored) {
    if (selected.length >= maxChunks) break;
    
    const count = typeCount[chunk.page_type] || 0;
    if (count >= 20) continue;
    
    selected.push(chunk);
    typeCount[chunk.page_type] = count + 1;
  }

  return selected;
}

// Helper functions for data transformation
function toShortBulletsFromOfferings(aiOfferings: string[], maxWords = 12): string[] {
  const bullets = aiOfferings
    .map(s => (s || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map(s => {
      const words = s.split(" ");
      const trimmed = words.slice(0, maxWords).join(" ");
      return trimmed.charAt(0).toUpperCase() + trimmed.slice(1).replace(/[.;,:-]+$/, "");
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
    const allowed = ["linkedin.com", "www.linkedin.com", "twitter.com", "x.com", "www.twitter.com", "www.x.com", "facebook.com", "www.facebook.com", "instagram.com", "www.instagram.com"];
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

    // Stage 1: Crawl site
    console.log('Stage: Crawling site...');
    const { pages, chunks, truncated } = await crawlSite(normalizedUrl, supabase);

    if (pages.length === 0 || chunks.length === 0) {
      return new Response(JSON.stringify({
        ok: false,
        error: {
          code: 'EMPTY_SITE',
          message: "We couldn't find readable pages on this site."
        }
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Crawled ${pages.length} pages, created ${chunks.length} chunks`);

    // Stage 2: Select best chunks
    const selectedChunks = selectBestChunks(chunks, MAX_CHUNKS_FOR_LLM);
    console.log(`Selected ${selectedChunks.length} chunks for extraction`);

    // Stage 3: Extract contacts
    console.log('Stage: Extracting contacts...');
    const emails = new Set<string>();
    const phones = new Set<string>();
    const socials: { linkedin: string | null; twitter: string | null; facebook: string | null; instagram: string | null } = {
      linkedin: null,
      twitter: null,
      facebook: null,
      instagram: null
    };

    // Extract from homepage chunks
    const homepageChunks = chunks.filter(c => c.page_type === "homepage");
    const homepageText = homepageChunks.map(c => c.text).join(" ");

    // Extract emails
    const emailMatches = homepageText.matchAll(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g);
    for (const match of emailMatches) {
      emails.add(match[0].toLowerCase());
    }

    // Extract phones
    const phoneMatches = homepageText.matchAll(/[\+\(]?[1-9][\d\s\-\(\)\.]{7,}\d/g);
    for (const match of phoneMatches) {
      const cleaned = match[0].replace(/\s+/g, '');
      if (cleaned.length >= 10) {
        phones.add(match[0]);
      }
    }

    // Extract social links
    const linkMatches = homepageText.matchAll(/https?:\/\/[^\s"'<>]+/gi);
    for (const match of linkMatches) {
      const href = match[0].toLowerCase();
      if (href.includes('linkedin.com') && !socials.linkedin) socials.linkedin = match[0];
      else if ((href.includes('twitter.com') || href.includes('x.com')) && !socials.twitter) socials.twitter = match[0];
      else if (href.includes('facebook.com') && !socials.facebook) socials.facebook = match[0];
      else if (href.includes('instagram.com') && !socials.instagram) socials.instagram = match[0];
    }

    // Stage 4: AI extraction
    console.log('Stage: AI extraction...');
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
            content: 'You extract company info from text chunks that may come from any page (homepage, about, company, team, contact, pricing, press, docs, blog). Prefer facts from about/company pages for size, HQ, leadership. Return ONLY valid JSON, no commentary.'
          },
          {
            role: 'user',
            content: `URL: ${normalizedUrl}\n\nChunks (from ${pages.length} pages):\n${JSON.stringify(selectedChunks.slice(0, 20).map(c => ({ chunk_id: c.chunk_id, text: c.text, source_url: c.source_url, page_type: c.page_type })))}\n\nExtract and return JSON:\n{\n  "name": "string or null",\n  "industry": {"value":"string or null","confidence":"high|medium|low","evidence":[{"snippet":"string","source_url":"string","page_type":"string","offset":number}]},\n  "company_size": {"value":"string or null","confidence":"high|medium|low","evidence":[{"snippet":"string","source_url":"string","page_type":"string","offset":number}]},\n  "hq_location": {"value":"string or null","confidence":"high|medium|low","evidence":[{"snippet":"string","source_url":"string","page_type":"string","offset":number}]},\n  "usp": {"value":"string or null","confidence":"high|medium|low","evidence":[{"snippet":"string","source_url":"string","page_type":"string","offset":number}]},\n  "offerings_raw": [{"snippet":"string (≤12 words)","details":"1-2 sentence (≤180 chars)","source_url":"string","page_type":"string","offset":number}],\n  "target_audience_raw": ["Short audience bullet 1 (≤12 words)"]\n}`
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
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      extractedData = JSON.parse(jsonMatch ? jsonMatch[0] : content);
    } catch (parseError) {
      console.error('Failed to parse AI response, retrying...');
      // Simple retry logic
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
              content: 'Return ONLY valid JSON, no markdown, no commentary.'
            },
            {
              role: 'user',
              content: `Previous response: ${aiData.choices[0].message.content}\n\nReturn ONLY valid JSON matching the schema.`
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
      name: extractedData.name || new URL(normalizedUrl).hostname,
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

    console.log('Stage: Persisting to database...');

    // Delete old chunks
    await supabase.from('chunks').delete().eq('url', normalizedUrl);

    // Insert new chunks
    const chunksToInsert = chunks.map(chunk => ({
      page_id: chunk.page_id,
      url: normalizedUrl,
      chunk_id: chunk.chunk_id,
      text: chunk.text,
      text_offset: chunk.text_offset,
      source_url: chunk.source_url,
      path: chunk.path,
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
    return new Response(JSON.stringify({
      ok: true,
      data: companyCard,
      crawl: {
        total_pages: pages.length,
        total_chunks: chunks.length,
        truncated
      }
    }), {
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
