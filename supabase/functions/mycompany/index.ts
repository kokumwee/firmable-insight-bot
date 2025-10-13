import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_TONES = ['Professional', 'Friendly', 'Bold', 'Technical', 'Conversational'];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { action, payload } = await req.json();

    // GET profile
    if (action === 'get') {
      const { data, error } = await supabase
        .from('my_company_profile')
        .select('*')
        .limit(1)
        .maybeSingle();

      if (error) {
        console.error('Error fetching profile:', error);
        return new Response(
          JSON.stringify({ ok: false, message: error.message }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Return default values if no profile exists
      const profile = data || {
        name: '',
        industry: '',
        description: '',
        target_audience: '',
        value_proposition: '',
        tone: 'Professional',
        keywords: [],
        updated_at: null
      };

      return new Response(
        JSON.stringify({ ok: true, data: profile }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // UPDATE profile
    if (action === 'update') {
      // Validate and sanitize payload
      const name = payload.name?.trim().slice(0, 80) || '';
      const industry = payload.industry?.trim().slice(0, 80) || '';
      const description = payload.description?.trim().slice(0, 240) || '';
      const target_audience = payload.target_audience?.trim().slice(0, 120) || '';
      const value_proposition = payload.value_proposition?.trim().slice(0, 240) || '';
      
      // Validate tone
      const tone = VALID_TONES.includes(payload.tone) ? payload.tone : 'Professional';
      
      // Clean keywords: unique, lowercase, max 10
      let keywords: string[] = [];
      if (Array.isArray(payload.keywords)) {
        keywords = [...new Set(
          payload.keywords
            .map((k: any) => String(k).trim().toLowerCase())
            .filter((k: string) => k.length > 0)
        )].slice(0, 10) as string[];
      }

      const profileData = {
        name,
        industry,
        description,
        target_audience,
        value_proposition,
        tone,
        keywords,
        updated_at: new Date().toISOString()
      };

      // Check if a profile exists
      const { data: existing } = await supabase
        .from('my_company_profile')
        .select('id')
        .limit(1)
        .maybeSingle();

      let result;
      if (existing) {
        // Update existing profile
        result = await supabase
          .from('my_company_profile')
          .update(profileData)
          .eq('id', existing.id)
          .select()
          .single();
      } else {
        // Insert new profile
        result = await supabase
          .from('my_company_profile')
          .insert([profileData])
          .select()
          .single();
      }

      if (result.error) {
        console.error('Error saving profile:', result.error);
        return new Response(
          JSON.stringify({ ok: false, message: result.error.message }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ ok: true, data: result.data }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ ok: false, message: 'Invalid action' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in mycompany function:', error);
    return new Response(
      JSON.stringify({
        ok: false,
        message: error instanceof Error ? error.message : 'Unknown error'
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});