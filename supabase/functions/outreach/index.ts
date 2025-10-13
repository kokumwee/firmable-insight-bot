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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { action, ...params } = await req.json();
    console.log(`[outreach] action=${action}`, params);

    switch (action) {
      case 'build_today': {
        const { force = false } = params;
        const today = new Date().toISOString().split('T')[0];

        // Check if already built today (unless force)
        if (!force) {
          const { data: existing, error: existingError } = await supabase
            .from('outreach_tasks')
            .select('id')
            .eq('recommended_at', today)
            .limit(1);

          if (!existingError && existing && existing.length > 0) {
            // Already built, just return today's list
            return await listToday(supabase, today);
          }
        }

        // Delete old tasks if force rebuild
        if (force) {
          await supabase
            .from('outreach_tasks')
            .delete()
            .eq('recommended_at', today);
        }

        // Find customers needing outreach
        const fourteenDaysAgo = new Date();
        fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

        const { data: customers, error: customersError } = await supabase
          .from('customers')
          .select('*')
          .or(`recently_updated.eq.true,last_contacted_at.is.null,last_contacted_at.lt.${fourteenDaysAgo.toISOString()}`);

        if (customersError) throw customersError;

        // Filter out customers with existing open tasks or snoozed
        const { data: existingTasks } = await supabase
          .from('outreach_tasks')
          .select('customer_id, snooze_until')
          .in('customer_id', customers.map(c => c.id));

        const excludedIds = new Set(
          (existingTasks || [])
            .filter(t => t.snooze_until && new Date(t.snooze_until) > new Date())
            .map(t => t.customer_id)
        );

        const tasksToCreate = customers
          .filter(c => !excludedIds.has(c.id))
          .map(c => {
            let reason = 'Follow-up recommended';
            if (c.recently_updated) {
              reason = 'Site changed recently';
            } else if (!c.last_contacted_at) {
              reason = 'Never contacted';
            } else {
              const daysSince = Math.floor(
                (Date.now() - new Date(c.last_contacted_at).getTime()) / (1000 * 60 * 60 * 24)
              );
              reason = `Not contacted ${daysSince}d`;
            }
            if (c.linkedin_summary && /new|hire|join/i.test(c.linkedin_summary)) {
              reason = c.linkedin_summary.slice(0, 100);
            }

            return {
              customer_id: c.id,
              reason,
              recommended_at: today,
              status: 'open',
            };
          });

        if (tasksToCreate.length > 0) {
          const { error: insertError } = await supabase
            .from('outreach_tasks')
            .insert(tasksToCreate);

          if (insertError) throw insertError;
        }

        return await listToday(supabase, today);
      }

      case 'list_today': {
        const today = new Date().toISOString().split('T')[0];
        return await listToday(supabase, today);
      }

      case 'update': {
        const { task_id, status, snooze_until } = params;
        
        const updates: any = {};
        if (status) updates.status = status;
        if (snooze_until) updates.snooze_until = snooze_until;

        const { error } = await supabase
          .from('outreach_tasks')
          .update(updates)
          .eq('id', task_id);

        if (error) throw error;

        // If marking done, update customer last_contacted_at
        if (status === 'done') {
          const { data: task } = await supabase
            .from('outreach_tasks')
            .select('customer_id')
            .eq('id', task_id)
            .single();

          if (task) {
            await supabase
              .from('customers')
              .update({ last_contacted_at: new Date().toISOString() })
              .eq('id', task.customer_id);
          }
        }

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('[outreach] error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

async function listToday(supabase: any, today: string) {
  const { data, error } = await supabase
    .from('outreach_tasks')
    .select(`
      *,
      customer:customers(*)
    `)
    .eq('recommended_at', today)
    .eq('status', 'open')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return new Response(JSON.stringify({ data }), {
    headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
  });
}
