import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { action, ...params } = await req.json();
    console.log(`[customers] action=${action}`, params);

    switch (action) {
      case 'add_from_analysis':
        return await handleAddFromAnalysis(supabaseClient, params);
      case 'add_from_shortlist':
        return await handleAddFromShortlist(supabaseClient, params);
      case 'list':
        return await handleList(supabaseClient, params);
      case 'update_meta':
        return await handleUpdateMeta(supabaseClient, params);
      case 'mark_contacted':
        return await handleMarkContacted(supabaseClient, params);
      case 'remove':
        return await handleRemove(supabaseClient, params);
      default:
        return new Response(
          JSON.stringify({ ok: false, error: { message: 'Unknown action' } }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }
  } catch (error) {
    console.error('[customers] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ ok: false, error: { message } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function handleAddFromAnalysis(supabase: any, params: { url: string }) {
  const { url } = params;
  
  // Load company_cards
  const { data: companyCard, error: cardError } = await supabase
    .from('company_cards')
    .select('*')
    .eq('url', url)
    .single();

  if (cardError || !companyCard) {
    return new Response(
      JSON.stringify({ ok: false, error: { message: 'Company analysis not found. Please analyze first.' } }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Load engagement_insights
  const { data: engagement } = await supabase
    .from('engagement_insights')
    .select('*')
    .eq('url', url)
    .maybeSingle();

  // Extract offerings as bulleted array (match shortlist structure)
  const offerings = companyCard.offerings?.value 
    ? (typeof companyCard.offerings.value === 'string' 
        ? companyCard.offerings.value.split('\n').map((s: string) => s.trim()).filter(Boolean)
        : companyCard.offerings.value)
    : [];

  // Extract target audience as array (match shortlist structure)
  const targetAudience = companyCard.target_audience?.value
    ? (typeof companyCard.target_audience.value === 'string'
        ? companyCard.target_audience.value.split('\n').map((s: string) => s.trim()).filter(Boolean)
        : companyCard.target_audience.value)
    : [];

  // Extract top keywords from engagement insights
  const keywords = engagement?.key_messages?.slice(0, 5).map((msg: any) => ({
    term: msg.message || msg.term || msg,
    weight: msg.confidence || msg.weight || 1
  })) || [];

  // Extract tone summary from engagement insights
  const toneSummary = engagement?.outreach_guidance?.recommended_tone 
    || engagement?.brand_voice?.value
    || null;

  // Map data to customers table (identical to shortlist structure)
  const customerData = {
    url,
    name: companyCard.name || "Unknown company",
    industry: companyCard.industry,
    company_size: companyCard.company_size,
    hq_location: companyCard.hq_location,
    usp: companyCard.usp,
    offerings_bulleted: offerings,
    target_audience_list: targetAudience,
    tone_summary: toneSummary,
    keywords_top: keywords,
    tags: ['Customer'],
  };

  // Upsert
  const { data: customer, error: upsertError } = await supabase
    .from('customers')
    .upsert(customerData, { onConflict: 'url' })
    .select()
    .single();

  if (upsertError) {
    return new Response(
      JSON.stringify({ ok: false, error: { message: upsertError.message } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

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

  console.log('[customers] Created/updated from analysis:', url);
  return new Response(
    JSON.stringify({ ok: true, data: customer, message: 'Customer record created/updated successfully.' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleAddFromShortlist(supabase: any, params: { url: string }) {
  const { url } = params;
  
  // Load shortlist row
  const { data: shortlistItem, error: shortlistError } = await supabase
    .from('shortlist')
    .select('*')
    .eq('url', url)
    .single();

  if (shortlistError || !shortlistItem) {
    return new Response(
      JSON.stringify({ ok: false, error: { message: 'Company not found in shortlist.' } }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Copy all fields from shortlist (exact structure)
  const customerData = {
    url,
    name: shortlistItem.name || "Unknown company",
    industry: shortlistItem.industry,
    company_size: shortlistItem.company_size,
    hq_location: shortlistItem.hq_location,
    usp: shortlistItem.usp,
    offerings_bulleted: shortlistItem.offerings_bulleted || [],
    target_audience_list: shortlistItem.target_audience_list || [],
    tone_summary: shortlistItem.tone_summary,
    keywords_top: shortlistItem.keywords_top || [],
    tags: ['Customer'],
    notes: shortlistItem.notes,
  };

  // Upsert into customers
  const { data: customer, error: upsertError } = await supabase
    .from('customers')
    .upsert(customerData, { onConflict: 'url' })
    .select()
    .single();

  if (upsertError) {
    return new Response(
      JSON.stringify({ ok: false, error: { message: upsertError.message } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  // Delete from shortlist (move, not copy)
  const { error: deleteError } = await supabase
    .from('shortlist')
    .delete()
    .eq('url', url);

  if (deleteError) {
    console.error('[customers] Failed to delete from shortlist:', deleteError);
    // Don't fail the request - customer was created successfully
  }

  console.log('[customers] Moved from shortlist to customers:', url);
  return new Response(
    JSON.stringify({ ok: true, data: customer, message: 'Moved to Existing Customers.' }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleList(supabase: any, params: any) {
  const { filters = {}, sort = 'created_at_desc', limit = 100, offset = 0 } = params;

  let query = supabase
    .from('customers')
    .select('*', { count: 'exact' });

  // Apply filters
  if (filters.tags && filters.tags.length > 0) {
    query = query.contains('tags', filters.tags);
  }

  if (filters.last_contacted_days) {
    const daysAgo = new Date();
    daysAgo.setDate(daysAgo.getDate() - filters.last_contacted_days);
    query = query.or(`last_contacted_at.is.null,last_contacted_at.lt.${daysAgo.toISOString()}`);
  }

  // Apply sort
  if (sort === 'last_contacted_desc') {
    query = query.order('last_contacted_at', { ascending: false, nullsFirst: false });
  } else if (sort === 'name_asc') {
    query = query.order('name', { ascending: true });
  } else if (sort === 'created_at_desc') {
    query = query.order('created_at', { ascending: false });
  }

  // Apply pagination
  query = query.range(offset, offset + limit - 1);

  const { data, error, count } = await query;

  if (error) {
    return new Response(
      JSON.stringify({ ok: false, error: { message: error.message } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ ok: true, data: data || [], count }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleUpdateMeta(supabase: any, params: { id: string; notes?: string; tags?: string[] }) {
  const { id, notes, tags, ...rest } = params;

  // Validate: reject if trying to update core fields
  const coreFields = ['industry', 'company_size', 'hq_location', 'usp', 'offerings_bulleted', 
                      'target_audience_list', 'tone_summary', 'keywords_top', 'name', 'url'];
  
  const attemptedCoreFields = Object.keys(rest).filter(k => coreFields.includes(k));
  if (attemptedCoreFields.length > 0) {
    return new Response(
      JSON.stringify({ 
        ok: false, 
        error: { 
          code: 'CORE_FIELDS_READ_ONLY',
          message: `Cannot update core fields: ${attemptedCoreFields.join(', ')}. Update from Company Insights.`
        } 
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const updates: any = {};
  if (notes !== undefined) updates.notes = notes;
  if (tags !== undefined) updates.tags = tags;

  const { data, error } = await supabase
    .from('customers')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return new Response(
      JSON.stringify({ ok: false, error: { message: error.message } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ ok: true, data }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleMarkContacted(supabase: any, params: { id: string }) {
  const { id } = params;

  const { data, error } = await supabase
    .from('customers')
    .update({ last_contacted_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();

  if (error) {
    return new Response(
      JSON.stringify({ ok: false, error: { message: error.message } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ ok: true, data }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}

async function handleRemove(supabase: any, params: { id: string }) {
  const { id } = params;

  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', id);

  if (error) {
    return new Response(
      JSON.stringify({ ok: false, error: { message: error.message } }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({ ok: true }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
