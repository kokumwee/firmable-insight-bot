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
    const { action, taskId, updates, force } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (action === 'build_today') {
      return await buildToday(supabase, force);
    } else if (action === 'list_today') {
      return await listToday(supabase);
    } else if (action === 'update') {
      return await updateTask(supabase, taskId, updates);
    }

    return new Response(
      JSON.stringify({ ok: false, error: 'Invalid action' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in outreach function:', error);
    return new Response(
      JSON.stringify({ ok: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function buildToday(supabase: any, force: boolean) {
  const today = localTodayAU();
  
  // Check if we already built today (unless force)
  if (!force) {
    const { data: existing } = await supabase
      .from('outreach_tasks')
      .select('id')
      .eq('recommended_at', today)
      .limit(1)
      .maybeSingle();
    
    if (existing) {
      console.log('Tasks already built for today');
      return new Response(
        JSON.stringify({ ok: true, message: 'Already built', count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  }

  // Fetch all active customers
  const { data: customers, error: customersError } = await supabase
    .from('customers')
    .select('*');

  if (customersError) throw customersError;

  // Fetch my company profile for relevance scoring
  const { data: myCompany } = await supabase
    .from('my_company_profile')
    .select('*')
    .limit(1)
    .maybeSingle();

  const tasks = [];
  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  for (const customer of customers) {
    const signals = [];
    let reasonCode = null;
    let priority = 3;
    let newsData = null;

    // Extract url_key
    const urlKey = customer.url 
      ? customer.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]
      : null;
    
    if (!urlKey) continue; // Skip customers without valid URL

    // === P1: Check for News-based signal (highest priority) ===
    const { data: summary } = await supabase
      .from('company_news_summaries')
      .select('url_key, company_name, summary, groups, generated_at, article_count')
      .eq('url_key', urlKey)
      .maybeSingle();

    if (summary && summary.article_count > 0) {
      const fresh = new Date(summary.generated_at) > twentyFourHoursAgo;
      const groups = summary.groups || [];
      const actionable = groups.filter((g: any) =>
        g.label && g.label.match(/AI|agent|integration|launch|update|partnership|hiring|funding/i)
      );

      if (fresh && actionable.length > 0) {
        // Check for news cooldown (7 days)
        const { data: recentNews } = await supabase
          .from('outreach_tasks')
          .select('id')
          .eq('customer_id', customer.id)
          .eq('reason_code', 'news')
          .gte('recommended_at', sevenDaysAgo.toISOString());

        if (!recentNews || recentNews.length === 0) {
          // Calculate relevance score
          const top = actionable[0];
          const topBlurb = top.blurb || '';
          
          // Simple keyword matching with my company profile
          let keywordScore = 0;
          let matchedKeywords: string[] = [];
          if (myCompany && myCompany.keywords && Array.isArray(myCompany.keywords)) {
            const keywords = myCompany.keywords.map((k: string) => k.toLowerCase());
            const blurbLower = topBlurb.toLowerCase();
            matchedKeywords = keywords.filter((kw: string) => blurbLower.includes(kw));
            keywordScore = matchedKeywords.length > 0 ? 0.3 : 0;
          }

          const score = (fresh ? 0.4 : 0) + (actionable.length > 0 ? 0.3 : 0) + keywordScore;

          if (score >= 0.6) {
            const groupHash = simpleHash(top.label + topBlurb);
            
            // Generate news_relevance_reason
            let relevanceReason = '';
            if (top.why_it_matters) {
              // Use the group's why_it_matters if available
              relevanceReason = top.why_it_matters;
            } else if (matchedKeywords.length > 0 && myCompany) {
              // Generate based on keyword match
              relevanceReason = `Relevant to us because we help with ${matchedKeywords[0]}; timing aligns with our ${myCompany.value_proposition ? 'offering' : 'capabilities'}.`;
            } else if (myCompany && myCompany.value_proposition) {
              // Generic fallback with value prop
              relevanceReason = `Timing aligns with our ${myCompany.value_proposition.slice(0, 60)} offering.`;
            } else {
              // Safe generic fallback
              relevanceReason = `Possible interest area; explore fit with our value.`;
            }
            
            // Truncate to 140 chars
            if (relevanceReason.length > 140) {
              relevanceReason = relevanceReason.slice(0, 137) + '...';
            }
            
            signals.push('news');
            reasonCode = 'news';
            priority = 1;
            
            newsData = {
              news_group_labels: [top.label],
              news_group_hashes: [groupHash],
              news_blurb_snippet: topBlurb.slice(0, 300),
              news_sources_short: (top.items || []).map((i: any) => i.publisher).slice(0, 3),
              news_published_at: new Date(top.items?.[0]?.published_at || summary.generated_at).toISOString(),
              news_relevance_reason: relevanceReason
            };
          }
        }
      }
    }

    // === P2: Check for site update (if no news) ===
    if (customer.recently_updated && !reasonCode) {
      signals.push('site_update');
      reasonCode = 'site_update';
      priority = 2;
    }

    // === P2: Check for LinkedIn signals (if no news or site update) ===
    if (customer.linkedin_summary && 
        (customer.linkedin_summary.toLowerCase().includes('new hire') || 
         customer.linkedin_summary.toLowerCase().includes('promoted')) &&
        !reasonCode) {
      signals.push('linkedin');
      reasonCode = 'linkedin';
      priority = 2;
    }

    // === P3: Check for stale contact (lowest priority) ===
    const daysSinceContact = daysSince(customer.last_contacted_at);
    const isStale = daysSinceContact === null || daysSinceContact >= 14;
    
    if (isStale && !reasonCode) {
      signals.push('stale');
      reasonCode = 'stale';
      priority = 3;
    }

    // Skip if no signals
    if (!reasonCode) continue;

    // Create task
    const taskData: any = {
      customer_id: customer.id,
      recommended_at: today,
      reason_code: reasonCode,
      priority: priority,
      reason: getReasonText(reasonCode, customer),
      status: 'open'
    };

    // Add news-specific data if this is a news task
    if (newsData) {
      Object.assign(taskData, newsData);
    }

    tasks.push(taskData);
  }

  // Insert tasks
  if (tasks.length > 0) {
    const { error: insertError } = await supabase
      .from('outreach_tasks')
      .upsert(tasks, { 
        onConflict: 'customer_id,recommended_at',
        ignoreDuplicates: false 
      });

    if (insertError) throw insertError;
  }

  console.log(`Built ${tasks.length} outreach tasks for today`);

  return new Response(
    JSON.stringify({ ok: true, count: tasks.length, tasks }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function listToday(supabase: any) {
  const today = localTodayAU();

  const { data: tasks, error } = await supabase
    .from('outreach_tasks')
    .select(`
      *,
      customer:customers(*)
    `)
    .eq('recommended_at', today)
    .eq('status', 'open')
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false });

  if (error) throw error;

  // For news tasks, fetch the news details
  const enrichedTasks = await Promise.all(
    tasks.map(async (task: any) => {
      if (task.reason_code === 'news' && task.news_cluster_ids) {
        const { data: newsItems } = await supabase
          .from('company_news')
          .select('*')
          .in('id', task.news_cluster_ids)
          .eq('deleted', false)
          .gte('published_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .order('relevance', { ascending: false });

        return { ...task, news: newsItems || [] };
      }
      return task;
    })
  );

  return new Response(
    JSON.stringify({ ok: true, tasks: enrichedTasks }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function updateTask(supabase: any, taskId: string, updates: any) {
  const { status, snooze_until } = updates;

  const updateData: any = {};
  if (status) updateData.status = status;
  if (snooze_until) updateData.snooze_until = snooze_until;

  const { data: task, error } = await supabase
    .from('outreach_tasks')
    .update(updateData)
    .eq('id', taskId)
    .select('*, customer:customers(*)')
    .single();

  if (error) throw error;

  // If marked done, update customer's last_contacted_at
  if (status === 'done' && task.customer) {
    await supabase
      .from('customers')
      .update({ last_contacted_at: new Date().toISOString() })
      .eq('id', task.customer.id);
  }

  return new Response(
    JSON.stringify({ ok: true, task }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

function localTodayAU(): string {
  const now = new Date();
  const localNow = new Date(now.toLocaleString('en-US', { timeZone: 'Australia/Melbourne' }));
  return localNow.toISOString().split('T')[0];
}

function daysSince(dateISO: string | null, tz = 'Australia/Melbourne'): number | null {
  if (!dateISO) return null;
  const now = new Date();
  const localNow = new Date(now.toLocaleString('en-US', { timeZone: tz }));
  const then = new Date(new Date(dateISO).toLocaleString('en-US', { timeZone: tz }));
  const ms = +localNow - +then;
  return ms < 0 ? 0 : Math.floor(ms / (24 * 60 * 60 * 1000));
}

function lastContactLabel(dateISO: string | null): string {
  const d = daysSince(dateISO);
  if (d === null) return 'No contact yet';
  if (d === 0) return 'Contacted today';
  if (d === 1) return 'No contact for 1 day';
  return `No contact for ${d} days`;
}

function getReasonText(reasonCode: string, customer: any): string {
  switch (reasonCode) {
    case 'news':
      return 'Recent company news';
    case 'site_update':
      return 'Website recently updated';
    case 'linkedin':
      return 'New hiring activity detected';
    case 'stale':
      return lastContactLabel(customer.last_contacted_at);
    default:
      return 'Outreach recommended';
  }
}

function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(36);
}
