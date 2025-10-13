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
    console.log(`[customers] action=${action}`, params);

    switch (action) {
      case 'add_from_analysis': {
        const { url } = params;
        
        // Load company card
        const { data: card, error: cardError } = await supabase
          .from('company_cards')
          .select('*')
          .eq('url', url)
          .single();

        if (cardError) {
          throw new Error(`Company card not found for ${url}`);
        }

        // Load engagement insights (optional)
        const { data: insights } = await supabase
          .from('engagement_insights')
          .select('*')
          .eq('url', url)
          .maybeSingle();

        // Upsert customer
        const customerData = {
          url,
          name: card.name || new URL(url).hostname,
          industry: card.industry,
          company_size: card.company_size,
          hq_location: card.hq_location,
          usp: card.usp,
          offerings_bulleted: card.offerings,
          target_audience_list: card.target_audience,
          tone_summary: insights?.brand_voice?.value || null,
          keywords_top: null, // Can enhance later
        };

        const { error: upsertError } = await supabase
          .from('customers')
          .upsert(customerData, { onConflict: 'url' });

        if (upsertError) throw upsertError;

        // Add "Customer" tag to shortlist if exists
        const { data: shortlistItem } = await supabase
          .from('shortlist')
          .select('tags')
          .eq('url', url)
          .maybeSingle();

        if (shortlistItem) {
          const tags = shortlistItem.tags || [];
          if (!tags.includes('Customer')) {
            await supabase
              .from('shortlist')
              .update({ tags: [...tags, 'Customer'] })
              .eq('url', url);
          }
        }

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'add_manual': {
        const { name, url, industry, company_size, hq_location, notes, tags } = params;
        
        const customerData = {
          name,
          url: url || null,
          industry: industry || null,
          company_size: company_size || null,
          hq_location: hq_location || null,
          notes: notes || null,
          tags: tags || [],
        };

        const { data, error } = await supabase
          .from('customers')
          .insert(customerData)
          .select()
          .single();

        if (error) throw error;

        return new Response(JSON.stringify({ ok: true, data }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'list': {
        const { filters = {}, sort = 'created_desc', limit = 50, offset = 0 } = params;
        
        let query = supabase.from('customers').select('*', { count: 'exact' });

        // Apply filters
        if (filters.tags && filters.tags.length > 0) {
          query = query.overlaps('tags', filters.tags);
        }
        if (filters.recently_updated) {
          query = query.eq('recently_updated', true);
        }
        if (filters.last_contacted) {
          const days = parseInt(filters.last_contacted);
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - days);
          query = query.or(`last_contacted_at.is.null,last_contacted_at.lt.${cutoff.toISOString()}`);
        }

        // Apply sort
        switch (sort) {
          case 'last_contacted_desc':
            query = query.order('last_contacted_at', { ascending: false, nullsFirst: true });
            break;
          case 'name_asc':
            query = query.order('name', { ascending: true });
            break;
          case 'created_desc':
          default:
            query = query.order('created_at', { ascending: false });
        }

        query = query.range(offset, offset + limit - 1);

        const { data, error, count } = await query;
        if (error) throw error;

        return new Response(JSON.stringify({ data, count }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'update': {
        const { id, patch } = params;
        
        const { error } = await supabase
          .from('customers')
          .update(patch)
          .eq('id', id);

        if (error) throw error;

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'mark_contacted': {
        const { id } = params;
        
        const { error } = await supabase
          .from('customers')
          .update({ last_contacted_at: new Date().toISOString() })
          .eq('id', id);

        if (error) throw error;

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      case 'remove': {
        const { id } = params;
        
        const { error } = await supabase
          .from('customers')
          .delete()
          .eq('id', id);

        if (error) throw error;

        return new Response(JSON.stringify({ ok: true }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }
  } catch (error) {
    console.error('[customers] error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
