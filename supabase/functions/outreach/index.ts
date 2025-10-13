import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Timezone-safe "today" in Australia/Melbourne
function localTodayAU(): string {
  const now = new Date();
  const au = new Intl.DateTimeFormat('en-AU', { 
    timeZone: 'Australia/Melbourne', 
    year: 'numeric', 
    month: '2-digit', 
    day: '2-digit' 
  }).formatToParts(now).reduce((a, p) => {
    a[p.type] = p.value;
    return a;
  }, {} as any);
  return `${au.year}-${au.month}-${au.day}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { action, taskId, updates, force, debug } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (action === 'build_today') {
      return await buildToday(supabase, force, debug);
    } else if (action === 'list_today') {
      return await listToday(supabase);
    } else if (action === 'update') {
      return await updateTask(supabase, taskId, updates);
    }

    return new Response(
      JSON.stringify({ ok: false, message: 'INVALID_ACTION' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in outreach function:', error);
    return new Response(
      JSON.stringify({ 
        ok: false, 
        message: 'FUNCTION_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function buildToday(supabase: any, force: boolean, debug?: boolean) {
  try {
    const today = localTodayAU();
    const debugInfo: any = { today, signals: { stale: 0, site_update: 0, linkedin: 0, news: 0 } };

    if (debug) console.log('[DEBUG] Today:', today);

    // 1) Optionally clear today's tasks on force
    if (force) {
      const { error: delError } = await supabase
        .from('outreach_tasks')
        .delete()
        .eq('recommended_at', today);
      
      if (delError) {
        console.error('DELETE_FAIL:', delError.message);
        return new Response(
          JSON.stringify({ ok: false, message: 'DELETE_FAIL', details: delError.message }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (debug) console.log('[DEBUG] Cleared existing tasks for today');
    }

    // 2) Fetch active customers
    const { data: customers, error: cErr } = await supabase
      .from('customers')
      .select('id, url, url_key, last_contacted_at, recently_updated, linkedin_summary');

    if (cErr) {
      console.error('CUSTOMERS_READ_FAIL:', cErr.message);
      return new Response(
        JSON.stringify({ ok: false, message: 'CUSTOMERS_READ_FAIL', details: cErr.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (debug) console.log('[DEBUG] Customers read:', customers?.length || 0);

    const tasksToUpsert = [];
    const now = Date.now();
    const fourteenDaysMs = 14 * 24 * 3600 * 1000;
    const thirtyDaysMs = 30 * 24 * 3600 * 1000;

    // 3) For each customer, compute signals
    for (const c of customers || []) {
      const urlKey = c.url_key ?? (c.url ? c.url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0] : null);

      // stale
      const stale = !c.last_contacted_at || (new Date(c.last_contacted_at).getTime() < now - fourteenDaysMs);
      if (stale) debugInfo.signals.stale++;

      // site update
      const site_update = !!c.recently_updated;
      if (site_update) debugInfo.signals.site_update++;

      // linkedin
      const linkedinText = (c.linkedin_summary || '').toLowerCase();
      const linkedin = /new .*hire|promoted|joins as|vp |head /.test(linkedinText);
      if (linkedin) debugInfo.signals.linkedin++;

      // news in last 30d
      let news = false;
      let newsIds: string[] = [];
      if (urlKey) {
        const { data: topNews } = await supabase
          .from('company_news')
          .select('id')
          .eq('url_key', urlKey)
          .eq('deleted', false)
          .gte('published_at', new Date(now - thirtyDaysMs).toISOString())
          .order('published_at', { ascending: false })
          .limit(2);
        
        news = (topNews?.length ?? 0) > 0;
        newsIds = (topNews ?? []).map((n: any) => n.id);
        if (news) debugInfo.signals.news++;
      }

      if (!stale && !site_update && !linkedin && !news) continue;

      // choose reason & priority
      let reason_code: 'news' | 'site_update' | 'linkedin' | 'stale' = 'stale';
      let priority = 3;
      if (news) { reason_code = 'news'; priority = 1; }
      else if (site_update) { reason_code = 'site_update'; priority = 2; }
      else if (linkedin) { reason_code = 'linkedin'; priority = 2; }

      tasksToUpsert.push({
        customer_id: c.id,
        recommended_at: today,
        status: 'open',
        reason_code,
        priority,
        news_cluster_ids: news ? newsIds : null
      });
    }

    debugInfo.upsertCount = tasksToUpsert.length;
    if (debug) console.log('[DEBUG] Tasks to upsert:', debugInfo);

    // 4) Upsert (dedupe per customer/day)
    for (const t of tasksToUpsert) {
      const { error: tErr } = await supabase
        .from('outreach_tasks')
        .upsert(t, { onConflict: 'customer_id,recommended_at' });
      
      if (tErr) {
        console.error('UPSERT_TASK_FAIL:', tErr.message, t);
        if (tErr.message.includes('permission denied') || tErr.message.includes('policy')) {
          return new Response(
            JSON.stringify({ ok: false, message: 'RLS_DENIED', details: tErr.message }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, inserted: tasksToUpsert.length, debug: debug ? debugInfo : undefined }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('BUILD_TODAY_ERROR:', error);
    return new Response(
      JSON.stringify({ 
        ok: false, 
        message: 'BUILD_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function listToday(supabase: any) {
  try {
    const today = localTodayAU();

    const { data: tasks, error } = await supabase
      .from('outreach_tasks')
      .select(`
        id, status, reason_code, priority, news_cluster_ids, created_at,
        customers:customer_id ( id, name, url, url_key, notes, tags, last_contacted_at )
      `)
      .eq('recommended_at', today)
      .eq('status', 'open')
      .order('priority', { ascending: true });

    if (error) {
      console.error('TASKS_READ_FAIL:', error.message);
      return new Response(
        JSON.stringify({ ok: false, message: 'TASKS_READ_FAIL', details: error.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // For news tasks, fetch the news details
    const enrichedTasks = await Promise.all(
      (tasks || []).map(async (task: any) => {
        // Rename the embedded customers object to customer for consistency
        const customer = task.customers;
        delete task.customers;
        task.customer = customer;

        if (task.reason_code === 'news' && task.news_cluster_ids) {
          const { data: newsItems } = await supabase
            .from('company_news')
            .select('id, title, summary, quote, published_at, sources')
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

  } catch (error) {
    console.error('LIST_TODAY_ERROR:', error);
    return new Response(
      JSON.stringify({ 
        ok: false, 
        message: 'LIST_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}

async function updateTask(supabase: any, taskId: string, updates: any) {
  try {
    const { status, snooze_until } = updates;

    const updateData: any = {};
    if (status) updateData.status = status;
    if (snooze_until) updateData.snooze_until = snooze_until;

    const { data: task, error } = await supabase
      .from('outreach_tasks')
      .update(updateData)
      .eq('id', taskId)
      .select(`
        id, status, reason_code, priority, news_cluster_ids,
        customers:customer_id ( id, name, url, url_key, notes, tags, last_contacted_at )
      `)
      .single();

    if (error) {
      console.error('UPDATE_TASK_FAIL:', error.message);
      return new Response(
        JSON.stringify({ ok: false, message: 'UPDATE_FAIL', details: error.message }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rename the embedded customers object to customer for consistency
    const customer = task.customers;
    delete task.customers;
    task.customer = customer;

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

  } catch (error) {
    console.error('UPDATE_TASK_ERROR:', error);
    return new Response(
      JSON.stringify({ 
        ok: false, 
        message: 'UPDATE_ERROR',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
}
