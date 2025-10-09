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
    const { action, ...params } = await req.json();
    
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (action === 'add') {
      return await handleAdd(supabase, params);
    } else if (action === 'list') {
      return await handleList(supabase, params);
    } else if (action === 'update_meta') {
      return await handleUpdateMeta(supabase, params);
    } else if (action === 'remove') {
      return await handleRemove(supabase, params);
    } else {
      return new Response(
        JSON.stringify({ ok: false, error: { message: "Invalid action" } }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
  } catch (error) {
    console.error('Error in shortlist function:', error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: { message: error instanceof Error ? error.message : "Unknown error" }
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function handleAdd(supabase: any, params: any) {
  const { companyCard, engagement } = params;
  
  // Compute average confidence
  const confidences = [
    companyCard.industry?.confidence,
    companyCard.company_size?.confidence,
    companyCard.hq_location?.confidence,
    companyCard.usp?.confidence,
    companyCard.target_audience?.confidence,
  ].filter(Boolean);
  
  const confMap: Record<string, number> = { high: 3, medium: 2, low: 1 };
  const avgScore = confidences.reduce((sum, c) => sum + (confMap[c] || 0), 0) / confidences.length;
  const avgConfidence = avgScore >= 2.5 ? 'high' : avgScore >= 1.5 ? 'medium' : 'low';
  
  // Extract top 5 keywords
  const keywords = engagement?.key_messages?.keywords
    ?.sort((a: any, b: any) => b.weight - a.weight)
    .slice(0, 5) || [];
  
  const shortlistData = {
    url: companyCard.url,
    name: companyCard.name,
    industry: companyCard.industry || null,
    company_size: companyCard.company_size || null,
    hq_location: companyCard.hq_location || null,
    usp: companyCard.usp || null,
    offerings_bulleted: companyCard.offerings_bulleted || null,
    target_audience_list: companyCard.target_audience_list || null,
    contacts: companyCard.contacts || null,
    tone_summary: engagement?.brand_voice?.tone_summary || null,
    keywords_top: keywords,
    avg_confidence: avgConfidence,
    analyzed_at: companyCard.analyzed_at || new Date().toISOString(),
  };

  // Upsert into shortlist
  const { data, error } = await supabase
    .from('shortlist')
    .upsert(shortlistData, { onConflict: 'url' })
    .select()
    .single();

  if (error) throw error;

  // Add to history
  await supabase
    .from('shortlist_history')
    .insert({
      shortlist_url: companyCard.url,
      snapshot: companyCard
    });

  return new Response(
    JSON.stringify({ ok: true, data }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleList(supabase: any, params: any) {
  const { q, filters, sort, view } = params;
  
  let query = supabase.from('shortlist').select('*');
  
  // Search
  if (q) {
    query = query.or(`name.ilike.%${q}%,url.ilike.%${q}%,usp->>value.ilike.%${q}%`);
  }
  
  // Filters
  if (filters?.industry) {
    query = query.eq('industry->>value', filters.industry);
  }
  if (filters?.company_size) {
    query = query.eq('company_size->>value', filters.company_size);
  }
  if (filters?.hq_location) {
    query = query.eq('hq_location->>value', filters.hq_location);
  }
  if (filters?.avg_confidence) {
    query = query.eq('avg_confidence', filters.avg_confidence);
  }
  if (filters?.icp_fit) {
    query = query.eq('icp_fit', filters.icp_fit);
  }
  if (filters?.tags && filters.tags.length > 0) {
    query = query.contains('tags', filters.tags);
  }
  
  // Sorting
  if (sort === 'name_asc') {
    query = query.order('name', { ascending: true });
  } else if (sort === 'confidence_desc') {
    query = query.order('avg_confidence', { ascending: false });
  } else {
    query = query.order('created_at', { ascending: false });
  }
  
  const { data, error } = await query;
  
  if (error) throw error;
  
  return new Response(
    JSON.stringify({ ok: true, data }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleUpdateMeta(supabase: any, params: any) {
  const { url, tags, notes, icp_fit } = params;
  
  const updates: any = {};
  if (tags !== undefined) updates.tags = tags;
  if (notes !== undefined) updates.notes = notes;
  if (icp_fit !== undefined) updates.icp_fit = icp_fit;
  
  const { data, error } = await supabase
    .from('shortlist')
    .update(updates)
    .eq('url', url)
    .select()
    .single();
  
  if (error) throw error;
  
  return new Response(
    JSON.stringify({ ok: true, data }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleRemove(supabase: any, params: any) {
  const { url } = params;
  
  const { error } = await supabase
    .from('shortlist')
    .delete()
    .eq('url', url);
  
  if (error) throw error;
  
  return new Response(
    JSON.stringify({ ok: true }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
