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

      const maxAgeDays = 30;
      const cutoffDate = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString();

      const { data: items, error } = await supabase
        .from('company_news')
        .select('*')
        .eq('url', url)
        .eq('deleted', false)
        .gte('published_at', cutoffDate)
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

      // Constants
      const NEWS_RECENT_DAYS = 30;
      const NEWS_TARGET_ITEMS = 5;
      const cutoffDate = new Date(Date.now() - NEWS_RECENT_DAYS * 24 * 60 * 60 * 1000);

      // Allowed domains
      const ALLOWED_DOMAINS = [
        'techcrunch.com', 'theverge.com', 'zdnet.com', 'arstechnica.com',
        'techzine.eu', 'techradar.com', 'venturebeat.com', 'wired.com',
        'protocol.com', 'bloomberg.com', 'reuters.com', 'ft.com',
        'businesswire.com', 'prnewswire.com', 'techcrunch.com'
      ];

      // Entity resolution
      const resolveEntity = (url: string, companyCard: any) => {
        const parsedUrl = new URL(url);
        const domain = parsedUrl.hostname.replace('www.', '');
        const domainParts = domain.split('.');
        const baseName = domainParts[0];
        const brand = companyCard?.name || baseName.charAt(0).toUpperCase() + baseName.slice(1);
        
        // Generate aliases
        const aliases = [
          brand,
          brand.replace(/\s+/g, ''),
          brand.replace(/-/g, ' '),
          baseName
        ].filter((v, i, a) => a.indexOf(v) === i); // dedupe
        
        return { brand, domain, aliases };
      };

      // Get company name from company_cards
      const { data: companyCard } = await supabase
        .from('company_cards')
        .select('name, url')
        .eq('url', url)
        .maybeSingle();

      const entity = resolveEntity(url, companyCard);
      console.log('Entity resolved:', entity);

      // Get my_company_profile for relevance scoring
      const { data: myCompany } = await supabase
        .from('my_company_profile')
        .select('*')
        .maybeSingle();

      // Get company keywords for relevance
      const { data: companyData } = await supabase
        .from('company_cards')
        .select('analysis_json')
        .eq('url', url)
        .maybeSingle();

      const companyKeywords = companyData?.analysis_json?.keywords_top || [];
      
      // Helper to check if text mentions the entity
      const mentionsEntity = (text: string): boolean => {
        const lower = text.toLowerCase();
        return entity.aliases.some(alias => lower.includes(alias.toLowerCase())) ||
               lower.includes(entity.domain);
      };

      // Check for provider keys
      const serpApiKey = Deno.env.get('SERPAPI_KEY');
      const newsApiKey = Deno.env.get('NEWSAPI_KEY');

      if (!serpApiKey && !newsApiKey) {
        console.log('No news provider keys configured - returning empty');
        return new Response(
          JSON.stringify({ ok: true, items: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Fetch from providers
      const candidates: any[] = [];

      // Helper to parse dates robustly
      const parseDate = (dateStr: string): Date | null => {
        if (!dateStr) return null;
        try {
          const parsed = new Date(dateStr);
          if (isNaN(parsed.getTime())) return null;
          return parsed;
        } catch {
          return null;
        }
      };

      // Helper to check if domain is allowed
      const isDomainAllowed = (url: string): boolean => {
        try {
          const domain = new URL(url).hostname.replace('www.', '');
          return ALLOWED_DOMAINS.some(allowed => domain.includes(allowed));
        } catch {
          return false;
        }
      };

      // SerpAPI
      if (serpApiKey) {
        try {
          const queryFamilies = [
            `("${entity.brand}" OR "${entity.domain}") AND (launch OR announce OR update OR AI OR agents OR integration OR partnership OR acquisition OR pricing OR hiring)`,
            `("${entity.brand}" OR "${entity.domain}") AND (product OR feature OR platform OR security OR privacy OR data)`
          ];

          const locales = ['us', 'nl'];
          const searchTypes = [{ tbm: 'nws', label: 'news' }, { tbm: undefined, label: 'web' }];

          for (const q of queryFamilies) {
            for (const locale of locales) {
              for (const searchType of searchTypes) {
                const serpUrl = new URL('https://serpapi.com/search');
                serpUrl.searchParams.set('q', q);
                serpUrl.searchParams.set('api_key', serpApiKey);
                serpUrl.searchParams.set('engine', 'google');
                serpUrl.searchParams.set('tbs', 'qdr:m'); // last month
                serpUrl.searchParams.set('gl', locale);
                serpUrl.searchParams.set('num', '10');
                if (searchType.tbm) {
                  serpUrl.searchParams.set('tbm', searchType.tbm);
                }

                const resp = await fetch(serpUrl.toString());
                if (resp.ok) {
                  const data = await resp.json();
                  const results = data.organic_results || data.news_results || [];
                  for (const r of results) {
                    const parsedDate = parseDate(r.date);
                    if (!parsedDate || parsedDate < cutoffDate) continue;
                    
                    // Filter: must mention entity
                    const snippet = r.snippet || '';
                    if (!mentionsEntity(r.title) && !mentionsEntity(snippet)) continue;

                    const domain = new URL(r.link).hostname.replace('www.', '');
                    const domainScore = isDomainAllowed(r.link) ? 1.0 : 0.3;

                    candidates.push({
                      title: r.title,
                      link: r.link,
                      publisher: r.source || domain,
                      snippet,
                      published_at: parsedDate.toISOString(),
                      source: searchType.label === 'news' ? 'news' : 'web',
                      domainScore
                    });
                  }
                }
              }
            }
          }
        } catch (e) {
          console.error('SerpAPI error:', e);
        }
      }

      // NewsAPI
      if (newsApiKey) {
        try {
          const fromDate = cutoffDate.toISOString().split('T')[0];
          const newsUrl = new URL('https://newsapi.org/v2/everything');
          newsUrl.searchParams.set('q', `("${entity.brand}" OR "${entity.domain}") AND (launch OR update OR AI OR integration OR partnership OR acquisition OR pricing OR hiring)`);
          newsUrl.searchParams.set('from', fromDate);
          newsUrl.searchParams.set('sortBy', 'publishedAt');
          newsUrl.searchParams.set('language', 'en');
          newsUrl.searchParams.set('pageSize', '50');

          const resp = await fetch(newsUrl.toString(), {
            headers: { 'X-Api-Key': newsApiKey }
          });

          if (resp.ok) {
            const data = await resp.json();
            const articles = data.articles || [];
            for (const a of articles) {
              const parsedDate = parseDate(a.publishedAt);
              if (!parsedDate || parsedDate < cutoffDate) continue;
              
              // Filter: must mention entity
              const snippet = a.description || '';
              if (!mentionsEntity(a.title) && !mentionsEntity(snippet)) continue;

              const domainScore = isDomainAllowed(a.url) ? 1.0 : 0.3;

              candidates.push({
                title: a.title,
                link: a.url,
                publisher: a.source?.name || new URL(a.url).hostname.replace('www.', ''),
                snippet,
                published_at: parsedDate.toISOString(),
                source: 'news',
                domainScore
              });
            }
          }
        } catch (e) {
          console.error('NewsAPI error:', e);
        }
      }

      // Filter by recency
      const recentCandidates = candidates.filter(c => {
        const pubDate = new Date(c.published_at);
        return pubDate >= cutoffDate;
      });

      if (recentCandidates.length === 0) {
        console.log('No recent news found');
        return new Response(
          JSON.stringify({ ok: true, items: [] }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`Found ${recentCandidates.length} candidates after filtering`);

      // Cluster similar articles (improved fingerprinting)
      const normalize = (str: string) => {
        const stopwords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'by', 'with'];
        const words = str.toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter(w => w.length > 3 && !stopwords.includes(w));
        // Keep top 8 terms, sorted for stability
        return words.slice(0, 8).sort().join(' ');
      };

      const clustered = new Map();
      for (const c of recentCandidates) {
        const fingerprint = normalize(c.title);
        if (!clustered.has(fingerprint)) {
          clustered.set(fingerprint, []);
        }
        clustered.get(fingerprint).push(c);
      }

      // Build cluster objects
      const clusters: any[] = [];
      for (const [fingerprint, items] of clustered.entries()) {
        const sortedItems = items.sort((a: any, b: any) => 
          new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
        );
        const mostRecent = sortedItems[0];

        // Keep up to 5 sources
        const sources = sortedItems.slice(0, 5).map((it: any) => ({
          title: it.title,
          link: it.link,
          publisher: it.publisher,
          published_at: it.published_at
        }));

        // Extract quote from snippet
        const snippetText = items.map((it: any) => it.snippet).join(' ');
        const sentences = snippetText.match(/[^.!?]+[.!?]+/g) || [];
        const quote = sentences.find((s: string) => s.length > 40 && s.length < 180)?.trim() || null;

        // Calculate average domain score for cluster
        const avgDomainScore = items.reduce((sum: number, it: any) => sum + (it.domainScore || 0.5), 0) / items.length;

        clusters.push({
          cluster_id: fingerprint,
          title: mostRecent.title,
          snippet: items.map((it: any) => it.snippet).join(' ').substring(0, 500),
          published_at: mostRecent.published_at,
          sources,
          quote,
          domainScore: avgDomainScore
        });
      }

      // Score relevance using AI
      const scoringPrompt = `Score the relevance of these news clusters to my company and the target company.

My company:
${myCompany ? `Name: ${myCompany.name}
Industry: ${myCompany.industry}
Value Proposition: ${myCompany.value_proposition}
Keywords: ${myCompany.keywords?.join(', ')}` : 'Unknown'}

Target company: ${entity.brand}
Target keywords: ${companyKeywords.map((k: any) => k.value).join(', ')}

News clusters (rank by actionability + authority + relevance):
${clusters.map((c, i) => `[${i}] ${c.title}\n${c.snippet.substring(0, 200)}`).join('\n\n')}

Scoring criteria:
- Actionability: launches, GA releases, partnerships, acquisitions, pricing changes, leadership hires
- Authority: boost reputable sources (techcrunch, theverge, bloomberg, reuters, wired, techzine)
- Relevance: AI, agents, data platforms, integrations, security, privacy

Return JSON array with same indices, each item:
{
  "index": <number>,
  "relevance": 0.0-1.0,
  "reason": "Why relevant/actionable (max 100 chars)",
  "summary": "Concise 1-2 line summary (max 200 chars)"
}

Rate items with actionable events highly even without "launch" keyword.`;

      const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${lovableApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: 'You are a news analyst. Return only valid JSON.' },
            { role: 'user', content: scoringPrompt }
          ],
        }),
      });

      if (!aiResp.ok) {
        throw new Error('AI scoring failed');
      }

      const aiData = await aiResp.json();
      const aiContent = aiData.choices?.[0]?.message?.content || '[]';
      const jsonMatch = aiContent.match(/```json\s*([\s\S]*?)\s*```/) || aiContent.match(/```\s*([\s\S]*?)\s*```/);
      const scores = JSON.parse(jsonMatch ? jsonMatch[1] : aiContent);

      // Merge scores with domain boost
      for (const score of scores) {
        if (score.index < clusters.length) {
          const domainBoost = clusters[score.index].domainScore || 0.5;
          clusters[score.index].relevance = Math.min(1.0, (score.relevance || 0.5) * domainBoost);
          clusters[score.index].reason = score.reason || null;
          clusters[score.index].summary = score.summary || clusters[score.index].snippet.substring(0, 200);
        }
      }

      // Sort and take top N
      const topClusters = clusters
        .sort((a, b) => b.relevance - a.relevance || new Date(b.published_at).getTime() - new Date(a.published_at).getTime())
        .slice(0, NEWS_TARGET_ITEMS);

      // Mark previous items as deleted
      await supabase
        .from('company_news')
        .update({ deleted: true })
        .eq('url', url)
        .eq('deleted', false);

      // Insert new items
      const itemsToInsert = topClusters.map(c => ({
        url,
        source: 'news',
        title: c.title.substring(0, 200),
        summary: c.summary,
        quote: c.quote,
        link: c.sources[0].link,
        published_at: c.published_at,
        relevance: Math.max(0, Math.min(1, c.relevance)),
        reason: c.reason?.substring(0, 200) || null,
        cluster_id: c.cluster_id,
        sources: c.sources,
        deleted: false,
      }));

      const { error: insertError } = await supabase
        .from('company_news')
        .insert(itemsToInsert);

      if (insertError) {
        console.error('Failed to insert news items:', insertError);
        throw insertError;
      }

      console.log(`Inserted ${itemsToInsert.length} news clusters`);
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