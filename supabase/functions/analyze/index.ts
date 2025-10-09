import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

// ==================== TYPES ====================
type Confidence = "high" | "medium" | "low";
type FieldName = "industry" | "company_size" | "hq_location" | "usp" | "offerings" | "target_audience";
type ResolverName = "extractor" | "classifier" | "metadata" | "schema" | "rules" | "cross_page" | "rendered_home";

type Evidence = { 
  snippet: string; 
  source_url: string; 
  page_type: string; 
  offset?: number;
};

type Candidate = {
  field: FieldName;
  value: string | string[] | null;
  confidence: Confidence;
  evidence: Evidence[];
  resolver: ResolverName;
};

type PageData = {
  id: string;
  url: string;
  origin: string;
  path: string;
  page_type: string;
  meta: any;
  jsonld: any[];
};

type ChunkData = {
  id: string;
  text: string;
  page_id: string;
  source_url: string;
  page_type: string;
  text_offset: number;
};

type SiteData = {
  pages: PageData[];
  chunks: ChunkData[];
  url: string;
  renderedHomeText?: string;
};

// ==================== CONFIG ====================
const CRAWL_MAX_PAGES = 250;
const CRAWL_MAX_DEPTH = 4;
const CRAWL_MAX_PER_SECTION = 80;
const REQUEST_DELAY_MS = 500;
const FETCH_TIMEOUT_MS = 15000;
const MAX_CHUNKS_FOR_LLM = 60;
const MIN_TEXT_LEN = 1200;
const ANALYZE_DEBUG = Deno.env.get("ANALYZE_DEBUG") === "true";

// ==================== HELPERS ====================
function confScore(c: Confidence): number { 
  return c === "high" ? 3 : c === "medium" ? 2 : 1; 
}

const resolverPriority: ResolverName[] = 
  ["metadata", "schema", "cross_page", "extractor", "classifier", "rules", "rendered_home"];

function mergeCandidates(field: FieldName, candidates: Candidate[]): { winner: Candidate; used: Candidate[] } {
  const nonNull = candidates.filter(c => c.value != null);
  if (nonNull.length === 0) {
    const empty: Candidate = { 
      field, 
      value: null, 
      confidence: "low", 
      evidence: [], 
      resolver: "extractor" 
    };
    return { winner: empty, used: [] };
  }
  
  nonNull.sort((a, b) =>
    (confScore(b.confidence) - confScore(a.confidence)) ||
    ((b.evidence?.length || 0) - (a.evidence?.length || 0)) ||
    (resolverPriority.indexOf(a.resolver) - resolverPriority.indexOf(b.resolver))
  );
  
  return { winner: nonNull[0], used: nonNull };
}

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
    u.hash = "";
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

function cleanHtml(html: string): { text: string; meta: any; jsonld: any[] } {
  const meta: any = {};
  const jsonld: any[] = [];
  
  // Parse metadata with regex
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch) meta.title = titleMatch[1].trim();
  
  const metaMatches = html.matchAll(/<meta\s+(?:[^>]*?\s+)?(?:name|property)=["']([^"']+)["'][^>]*?\s+content=["']([^"']+)["'][^>]*?>/gi);
  for (const match of metaMatches) {
    const name = match[1];
    const content = match[2];
    if (name === "description") meta.description = content;
    if (name === "og:title") meta.og_title = content;
    if (name === "og:site_name") meta.og_site_name = content;
    if (name === "og:description") meta.og_description = content;
  }
  
  // Parse JSON-LD
  const scriptMatches = html.matchAll(/<script\s+type=["']application\/ld\+json["'][^>]*>([^<]+)<\/script>/gi);
  for (const match of scriptMatches) {
    try {
      const data = JSON.parse(match[1]);
      const relevantTypes = ["Organization", "LocalBusiness", "Corporation", "NGO", "Product", "SoftwareApplication", "WebSite", "WebPage"];
      if (data["@type"] && relevantTypes.some(t => data["@type"].includes?.(t) || data["@type"] === t)) {
        jsonld.push(data);
      }
    } catch {}
  }
  
  // Clean HTML tags
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, '');
  text = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  
  return { text, meta, jsonld };
}

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
        if (path.endsWith('.gz')) continue;

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
  
  return [...new Set(urls)];
}

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
  
  if (/about|company|who-we-are|team|leadership|contact|pricing|press|media|investors/.test(t + p)) s += 5;
  if (/about|company/.test(p)) s += 3;
  if (/team|leadership/.test(p)) s += 3;
  if ((p.match(/\//g) || []).length <= 2) s += 2;
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

async function crawlSite(url: string, supabase: any, onProgress?: any): Promise<{ pages: number; chunks: number; truncated: boolean }> {
  const startTime = Date.now();
  const MAX_CRAWL_TIME = 90000;
  
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

  const sectionCounts: Record<string, number> = {};
  let pageCount = 0;
  let chunkCount = 0;
  let truncated = false;

  console.log(`Crawling ${urlList.length} pages...`);
  onProgress?.({ stage: "crawl", total: urlList.length, done: 0 });

  for (let i = 0; i < urlList.length; i++) {
    if (Date.now() - startTime > MAX_CRAWL_TIME) {
      console.log("Time limit reached, truncating");
      truncated = true;
      break;
    }

    const pageUrl = urlList[i];
    const pageUrlObj = new URL(pageUrl);
    const pageType = classifyPath(pageUrlObj.pathname);

    if (sectionCounts[pageType] >= CRAWL_MAX_PER_SECTION) {
      console.log(`Skipping ${pageUrl} - section ${pageType} cap reached`);
      continue;
    }

    try {
      if (i > 0) await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));

      const fetchResult = await robustFetch(pageUrl);
      
      if (!fetchResult.ok) {
        await supabase.from('pages').upsert({
          url: pageUrl,
          origin: baseUrl.origin,
          path: pageUrlObj.pathname,
          page_type: pageType,
          status_code: 0,
          blocked: true,
          content_len: 0,
          meta: {},
          jsonld: []
        });
        continue;
      }

      const { text, meta, jsonld } = cleanHtml(fetchResult.html!);

      if (text.length < MIN_TEXT_LEN) {
        console.log(`Skipping ${pageUrl} - too short`);
        continue;
      }

      const encoder = new TextEncoder();
      const data = encoder.encode(text);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const contentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      const { data: pageData, error: pageError } = await supabase.from('pages').upsert({
        url: pageUrl,
        origin: baseUrl.origin,
        path: pageUrlObj.pathname,
        page_type: pageType,
        status_code: 200,
        content_hash: contentHash,
        content_len: text.length,
        blocked: false,
        meta,
        jsonld
      }).select().single();

      if (pageError) {
        console.error("Error storing page:", pageError);
        continue;
      }

      pageCount++;
      sectionCounts[pageType] = (sectionCounts[pageType] || 0) + 1;

      const chunkSize = 750;
      let offset = 0;
      while (offset < text.length) {
        const chunkText = text.slice(offset, offset + chunkSize);
        await supabase.from('chunks').insert({
          page_id: pageData.id,
          url: normalizedUrl,
          chunk_id: `c${chunkCount + 1}`,
          text: chunkText,
          text_offset: offset,
          source_url: pageUrl,
          path: pageUrlObj.pathname,
          page_type: pageType
        });
        offset += chunkSize;
        chunkCount++;
      }

      onProgress?.({ stage: "crawl", total: urlList.length, done: i + 1 });
      console.log(`Crawled ${i + 1}/${urlList.length}: ${pageUrl} (${pageType})`);

    } catch (err) {
      console.error(`Error crawling ${pageUrl}:`, err);
    }
  }

  console.log(`Crawled ${pageCount} pages, created ${chunkCount} chunks`);
  return { pages: pageCount, chunks: chunkCount, truncated };
}

function selectBestChunks(chunks: any[], maxChunks: number): any[] {
  const keywords = [
    "industry", "customers", "pricing", "team", "about", "mission",
    "headquarters", "hq", "location", "employees", "subscription",
    "billing", "identity", "compliance", "founded", "leader"
  ];

  const scored = chunks.map(chunk => {
    let score = 0;
    
    if (["about", "company", "team", "contact", "pricing", "press"].includes(chunk.page_type)) score += 5;
    if (chunk.page_type === "homepage") score += 3;
    if (["legal", "privacy", "terms"].includes(chunk.page_type)) score -= 2;
    
    const text = chunk.text.toLowerCase();
    for (const kw of keywords) {
      if (text.includes(kw)) score += 1;
    }
    
    return { chunk, score };
  });

  scored.sort((a, b) => b.score - a.score);

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

async function extractContacts(url: string, supabase: any) {
  const { data: chunks } = await supabase
    .from("chunks")
    .select("text, source_url, page_type")
    .eq("url", url)
    .in("page_type", ["contact", "about", "homepage"]);

  const allText = (chunks || []).map((c: any) => c.text).join(" ");

  const emails: string[] = [];
  const emailMatches = allText.matchAll(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g);
  for (const match of emailMatches) {
    const email = match[1].toLowerCase();
    if (!email.includes("example") && !email.includes("@sentry") && !email.includes("@placeholder")) {
      emails.push(email);
    }
  }

  const phones: string[] = [];
  const phoneMatches = allText.matchAll(/\+?[\d\s\-\(\)]{10,}/g);
  for (const match of phoneMatches) {
    const phone = match[0].replace(/\s/g, "");
    if (phone.length >= 10) phones.push(phone);
  }

  const socials = {
    linkedin: { url: null, is_valid: false, note: "missing" },
    twitter: { url: null, is_valid: false, note: "missing" },
    facebook: { url: null, is_valid: false, note: "missing" },
    instagram: { url: null, is_valid: false, note: "missing" }
  };

  return { emails: [...new Set(emails)], phones: [...new Set(phones)], socials };
}

// ==================== RESOLVERS ====================

async function extractorResolver(field: FieldName, siteData: SiteData): Promise<Candidate | null> {
  const selectedChunks = selectBestChunks(siteData.chunks, 10);
  if (selectedChunks.length === 0) return null;
  
  const fieldPrompts: Record<FieldName, string> = {
    industry: "What industry is this company in? (e.g., Software, Financial Services, Healthcare). Return single label or null.",
    company_size: "How many employees? Return bucket: 1-10, 11-50, 51-200, 201-1000, 1000+ or null.",
    hq_location: "Where is the headquarters? Return City, Country or null.",
    usp: "What's the unique selling proposition? ≤20 words or null.",
    offerings: "List 3-8 key offerings as array or null.",
    target_audience: "Who are the target customers? 2-5 segments as array or null."
  };

  const prompt = `${fieldPrompts[field]}

Site: ${siteData.url}
Text snippets:
${selectedChunks.map((c, i) => `[${i + 1}] (${c.page_type}) ${c.text.slice(0, 400)}`).join("\n\n")}

Return JSON: { "value": string|string[]|null, "confidence": "high|medium|low", "evidence": [{"snippet":"...", "source_url":"${siteData.url}", "page_type":"homepage"}] }`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "Extract structured data. Use evidence from any page. Prefer official pages for HQ/size. Return concise values with evidence. If unknown, value=null with confidence='low'." },
          { role: "user", content: prompt }
        ]
      })
    });
    
    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);
    
    return {
      field,
      value: result.value,
      confidence: result.confidence || "medium",
      evidence: (result.evidence || []).slice(0, 2),
      resolver: "extractor"
    };
  } catch (e) {
    console.error("Extractor error:", e);
    return null;
  }
}

async function classifierResolver(field: FieldName, siteData: SiteData): Promise<Candidate | null> {
  const homePage = siteData.pages.find(p => p.page_type === "homepage");
  const aboutPage = siteData.pages.find(p => p.page_type === "about" || p.page_type === "company");
  
  if (!homePage && !aboutPage) return null;
  
  const signals: string[] = [];
  if (homePage?.meta?.title) signals.push(`Title: ${homePage.meta.title}`);
  if (homePage?.meta?.description) signals.push(`Desc: ${homePage.meta.description}`);
  if (aboutPage?.meta?.title) signals.push(`About: ${aboutPage.meta.title}`);
  
  const allJsonLd = [...(homePage?.jsonld || []), ...(aboutPage?.jsonld || [])];
  allJsonLd.forEach(ld => {
    if (ld.name) signals.push(`Company: ${ld.name}`);
    if (ld.numberOfEmployees) signals.push(`Employees: ${ld.numberOfEmployees}`);
  });
  
  const keywordChunks = siteData.chunks
    .filter(c => /industry|customers|pricing|team|about|headquarters|hq|employees/.test(c.text.toLowerCase()))
    .slice(0, 3);
  keywordChunks.forEach(c => signals.push(c.text.slice(0, 150)));
  
  if (signals.length === 0) return null;
  
  const fieldPrompts: Record<FieldName, string> = {
    industry: "Classify industry: Software, Financial Services, Healthcare, E-commerce, Education, Media, Manufacturing, Other. Single label.",
    company_size: "Estimate size: 1-10, 11-50, 51-200, 201-1000, 1000+. Single bucket.",
    hq_location: "Extract HQ (city, country). String or null.",
    target_audience: "Identify 2-5 segments: SMB, Enterprise, Developers, Consumers, etc. Array.",
    usp: "Summarize USP in ≤20 words. String.",
    offerings: "List 3-8 offerings as bullets. Array."
  };
  
  const prompt = `${fieldPrompts[field]}

Signals:
${signals.join("\n")}

Return JSON: { "value": string|string[]|null, "confidence": "high|medium|low", "evidence": [{"snippet":"...", "source_url":"${siteData.url}", "page_type":"homepage"}] }`;

  try {
    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You classify company fields from signals. Output single best value per field. Prefer conventional labels. Return strict JSON. If insufficient, value=null with confidence='low'." },
          { role: "user", content: prompt }
        ]
      })
    });
    
    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);
    
    return {
      field,
      value: result.value,
      confidence: result.confidence || "medium",
      evidence: (result.evidence || []).slice(0, 2),
      resolver: "classifier"
    };
  } catch (e) {
    console.error("Classifier error:", e);
    return null;
  }
}

function metadataResolver(field: FieldName, siteData: SiteData): Candidate | null {
  const homePage = siteData.pages.find(p => p.page_type === "homepage");
  if (!homePage?.meta) return null;
  
  const meta = homePage.meta;
  const evidence: Evidence[] = [];
  let value: string | string[] | null = null;
  let confidence: Confidence = "medium";
  
  switch (field) {
    case "industry": {
      const desc = meta.description || meta.og_description || "";
      if (/software|saas|technology|platform/i.test(desc)) {
        value = "Software";
        evidence.push({ snippet: desc.slice(0, 100), source_url: homePage.url, page_type: "homepage" });
      } else if (/financ|bank|payment/i.test(desc)) {
        value = "Financial Services";
        evidence.push({ snippet: desc.slice(0, 100), source_url: homePage.url, page_type: "homepage" });
      }
      break;
    }
    case "usp": {
      const desc = meta.description || meta.og_description;
      if (desc && desc.length > 20) {
        value = desc.slice(0, 150).trim();
        evidence.push({ snippet: desc, source_url: homePage.url, page_type: "homepage" });
      }
      break;
    }
    case "offerings": {
      const title = meta.title || "";
      const desc = meta.description || "";
      const combined = `${title}. ${desc}`;
      const bullets = combined.split(/[.;|]/).map(s => s.trim()).filter(s => s.length > 10 && s.length < 100);
      if (bullets.length >= 2) {
        value = bullets.slice(0, 8);
        evidence.push({ snippet: combined.slice(0, 200), source_url: homePage.url, page_type: "homepage" });
      }
      break;
    }
  }
  
  if (!value) return null;
  
  return { field, value, confidence, evidence, resolver: "metadata" };
}

function schemaResolver(field: FieldName, siteData: SiteData): Candidate | null {
  const allJsonLd = siteData.pages.flatMap(p => p.jsonld || []);
  if (allJsonLd.length === 0) return null;
  
  const evidence: Evidence[] = [];
  let value: string | string[] | null = null;
  const confidence: Confidence = "high";
  
  for (const ld of allJsonLd) {
    switch (field) {
      case "hq_location": {
        if (ld.address) {
          const addr = ld.address;
          const parts = [addr.addressLocality, addr.addressRegion, addr.addressCountry].filter(Boolean);
          if (parts.length > 0) {
            value = parts.join(", ");
            evidence.push({ 
              snippet: JSON.stringify(addr).slice(0, 100), 
              source_url: siteData.pages.find(p => p.jsonld?.includes(ld))?.url || siteData.url, 
              page_type: "about" 
            });
          }
        }
        break;
      }
      case "company_size": {
        if (ld.numberOfEmployees) {
          const num = parseInt(ld.numberOfEmployees);
          if (!isNaN(num)) {
            if (num <= 10) value = "1-10";
            else if (num <= 50) value = "11-50";
            else if (num <= 200) value = "51-200";
            else if (num <= 1000) value = "201-1000";
            else value = "1000+";
            evidence.push({ 
              snippet: `numberOfEmployees: ${ld.numberOfEmployees}`, 
              source_url: siteData.pages.find(p => p.jsonld?.includes(ld))?.url || siteData.url, 
              page_type: "about" 
            });
          }
        }
        break;
      }
      case "industry": {
        if (ld.industry) {
          value = ld.industry;
          evidence.push({ 
            snippet: `industry: ${ld.industry}`, 
            source_url: siteData.pages.find(p => p.jsonld?.includes(ld))?.url || siteData.url, 
            page_type: "homepage" 
          });
        }
        break;
      }
    }
    if (value) break;
  }
  
  if (!value) return null;
  
  return { field, value, confidence, evidence, resolver: "schema" };
}

function rulesResolver(field: FieldName, siteData: SiteData): Candidate | null {
  const evidence: Evidence[] = [];
  let value: string | null = null;
  const confidence: Confidence = "medium";
  
  switch (field) {
    case "hq_location": {
      for (const chunk of siteData.chunks) {
        const matches = chunk.text.match(/(?:headquarters|hq|located|based|office)[\s:]+([A-Z][a-zA-Z\s,]+(?:USA|Australia|UK|Canada|Germany|France|Singapore|India|China|Japan)[^.]{0,30})/i);
        if (matches) {
          value = matches[1].trim();
          evidence.push({ snippet: matches[0], source_url: chunk.source_url, page_type: chunk.page_type, offset: chunk.text_offset });
          break;
        }
      }
      break;
    }
    case "company_size": {
      for (const chunk of siteData.chunks) {
        const matches = chunk.text.match(/(\d+[\+]?)\s+employees|team\s+of\s+(\d+)/i);
        if (matches) {
          const num = parseInt(matches[1] || matches[2]);
          if (!isNaN(num)) {
            if (num <= 10) value = "1-10";
            else if (num <= 50) value = "11-50";
            else if (num <= 200) value = "51-200";
            else if (num <= 1000) value = "201-1000";
            else value = "1000+";
            evidence.push({ snippet: matches[0], source_url: chunk.source_url, page_type: chunk.page_type, offset: chunk.text_offset });
            break;
          }
        }
      }
      break;
    }
  }
  
  if (!value) return null;
  
  return { field, value, confidence, evidence, resolver: "rules" };
}

function crossPageResolver(field: FieldName, siteData: SiteData): Candidate | null {
  const preferredTypes: Record<FieldName, string[]> = {
    industry: ["about", "company", "homepage"],
    company_size: ["about", "team", "press"],
    hq_location: ["contact", "about"],
    usp: ["about", "company", "homepage"],
    offerings: ["homepage", "about"],
    target_audience: ["about", "homepage"]
  };
  
  const types = preferredTypes[field] || [];
  const relevantChunks = siteData.chunks
    .filter(c => types.includes(c.page_type))
    .slice(0, 5);
  
  if (relevantChunks.length === 0) return null;
  
  let value: string | null = null;
  const evidence: Evidence[] = [];
  
  for (const chunk of relevantChunks) {
    const text = chunk.text.toLowerCase();
    
    if (field === "industry" && !value) {
      if (text.includes("software") || text.includes("saas")) {
        value = "Software";
        evidence.push({ snippet: chunk.text.slice(0, 100), source_url: chunk.source_url, page_type: chunk.page_type });
      }
    }
    
    if (field === "hq_location" && !value) {
      const match = chunk.text.match(/(?:headquarters|hq|located|based)[\s:]+([A-Z][a-zA-Z\s,]+)/i);
      if (match) {
        value = match[1].trim();
        evidence.push({ snippet: match[0], source_url: chunk.source_url, page_type: chunk.page_type });
      }
    }
  }
  
  if (!value) return null;
  
  return { field, value, confidence: "medium", evidence, resolver: "cross_page" };
}

function renderedHomeResolver(field: FieldName, siteData: SiteData): Candidate | null {
  if (!siteData.renderedHomeText) return null;
  if (!["industry", "usp", "offerings"].includes(field)) return null;
  
  const text = siteData.renderedHomeText.toLowerCase();
  let value: string | null = null;
  const evidence: Evidence[] = [];
  
  if (field === "industry") {
    if (text.includes("software") || text.includes("saas")) {
      value = "Software";
      evidence.push({ snippet: siteData.renderedHomeText.slice(0, 100), source_url: siteData.url, page_type: "homepage" });
    }
  }
  
  if (!value) return null;
  
  return { field, value, confidence: "medium", evidence, resolver: "rendered_home" };
}

// ==================== MAIN ====================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    if (!url) {
      return new Response(JSON.stringify({ ok: false, error: { code: "MISSING_URL", message: "URL is required" } }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const normalizedUrl = normalizeUrl(url);
    console.log(`Analyzing URL: ${normalizedUrl}`);
    
    console.log("Stage: Crawling site...");
    const { pages: pageCount, chunks: chunkCount, truncated } = await crawlSite(normalizedUrl, supabase);
    console.log(`Crawled ${pageCount} pages, created ${chunkCount} chunks`);
    
    const { data: pagesData } = await supabase
      .from("pages")
      .select("*")
      .eq("origin", new URL(normalizedUrl).origin);
    
    const { data: chunksData } = await supabase
      .from("chunks")
      .select("*")
      .eq("url", normalizedUrl);
    
    const siteData: SiteData = {
      pages: pagesData || [],
      chunks: chunksData || [],
      url: normalizedUrl
    };
    
    console.log("Stage: AI extraction...");
    
    const fields: FieldName[] = ["industry", "company_size", "hq_location", "usp", "offerings", "target_audience"];
    const results: Record<string, any> = {};
    const resolversUsed: Record<string, string> = {};
    const debugInfo: any = ANALYZE_DEBUG ? {} : undefined;
    
    for (const field of fields) {
      const candidates = (await Promise.all([
        extractorResolver(field, siteData),
        classifierResolver(field, siteData),
        metadataResolver(field, siteData),
        schemaResolver(field, siteData),
        rulesResolver(field, siteData),
        crossPageResolver(field, siteData),
        renderedHomeResolver(field, siteData)
      ])).filter(Boolean) as Candidate[];
      
      const { winner, used } = mergeCandidates(field, candidates);
      
      results[field] = {
        value: winner.value,
        confidence: winner.confidence,
        evidence: (winner.evidence || []).slice(0, 3)
      };
      resolversUsed[field] = winner.resolver;
      
      if (ANALYZE_DEBUG) {
        debugInfo[field] = {
          candidates: used.map(c => ({ resolver: c.resolver, confidence: c.confidence, value: c.value })),
          winner: { resolver: winner.resolver, confidence: winner.confidence }
        };
      }
    }
    
    console.log("Stage: Extracting contacts...");
    const contacts = await extractContacts(normalizedUrl, supabase);
    
    const companyName = siteData.pages.find(p => p.page_type === "homepage")?.meta?.og_site_name || 
                        siteData.pages.find(p => p.page_type === "homepage")?.meta?.title || 
                        new URL(normalizedUrl).hostname.replace("www.", "");
    
    console.log("Stage: Persisting to database...");
    
    const companyCard = {
      name: companyName,
      url: normalizedUrl,
      industry: results.industry,
      company_size: results.company_size,
      hq_location: results.hq_location,
      usp: results.usp,
      offerings: results.offerings.value || [],
      offerings_bulleted: [],
      target_audience: results.target_audience,
      target_audience_list: [],
      contacts,
      resolvers: resolversUsed,
      analyzed_at: new Date().toISOString()
    };
    
    await supabase.from("company_cards").upsert(companyCard);
    
    console.log("Analysis complete");
    
    return new Response(JSON.stringify({ 
      ok: true, 
      data: companyCard,
      crawl: { total_pages: pageCount, total_chunks: chunkCount, truncated },
      ...(ANALYZE_DEBUG ? { debug: debugInfo } : {})
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (error) {
    console.error('Error in analyze function:', error);
    return new Response(JSON.stringify({ 
      ok: false, 
      error: { 
        code: "ANALYSIS_ERROR", 
        message: error instanceof Error ? error.message : "Unknown error" 
      } 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
