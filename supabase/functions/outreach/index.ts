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
  const today = new Date().toISOString().split('T')[0];
  
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

  const tasks = [];
  const now = new Date();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  for (const customer of customers) {
    const signals = [];
    let reasonCode = null;
    let priority = 3;
    let newsClusterIds = null;

    // Check for recent news (P1 - highest priority)
    const urlKey = customer.url 
      ? customer.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]
      : null;
    
    if (!urlKey) continue; // Skip customers without valid URL

    const { data: news } = await supabase
      .from('company_news')
      .select('id, relevance')
      .eq('url_key', urlKey)
      .eq('deleted', false)
      .gte('published_at', thirtyDaysAgo.toISOString())
      .order('relevance', { ascending: false })
      .limit(2);

    if (news && news.length > 0) {
      signals.push('news');
      reasonCode = 'news';
      priority = 1;
      newsClusterIds = news.map((n: any) => n.id);
    }

    // Check for site update (P2)
    if (customer.recently_updated && !reasonCode) {
      signals.push('site_update');
      reasonCode = 'site_update';
      priority = 2;
    }

    // Check for LinkedIn signals (P2)
    if (customer.linkedin_summary && 
        (customer.linkedin_summary.toLowerCase().includes('new hire') || 
         customer.linkedin_summary.toLowerCase().includes('promoted')) &&
        !reasonCode) {
      signals.push('linkedin');
      reasonCode = 'linkedin';
      priority = 2;
    }

    // Check for stale contact (P3)
    const isStale = !customer.last_contacted_at || 
                    new Date(customer.last_contacted_at) < fourteenDaysAgo;
    
    if (isStale && !reasonCode) {
      signals.push('stale');
      reasonCode = 'stale';
      priority = 3;
    }

    // Skip if no signals
    if (!reasonCode) continue;

    // Create task
    tasks.push({
      customer_id: customer.id,
      recommended_at: today,
      reason_code: reasonCode,
      priority: priority,
      news_cluster_ids: newsClusterIds,
      reason: getReasonText(reasonCode, customer),
      status: 'open'
    });
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
  const today = new Date().toISOString().split('T')[0];

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

function getReasonText(reasonCode: string, customer: any): string {
  switch (reasonCode) {
    case 'news':
      return 'Recent company news';
    case 'site_update':
      return 'Website recently updated';
    case 'linkedin':
      return 'New hiring activity detected';
    case 'stale':
      const daysSince = customer.last_contacted_at 
        ? Math.floor((Date.now() - new Date(customer.last_contacted_at).getTime()) / (1000 * 60 * 60 * 24))
        : 999;
      return `No contact for ${daysSince} days`;
    default:
      return 'Outreach recommended';
  }
}
