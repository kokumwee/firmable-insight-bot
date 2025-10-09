import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { companyCard, icpIndustries, icpSize, icpContinent } = await req.json();

    console.log("Calculating ICP fit for:", companyCard?.name);

    // If no ICP filters set, return 0
    if ((!icpIndustries || icpIndustries.trim() === '') && 
        (!icpSize || icpSize === 'Any') && 
        (!icpContinent || icpContinent === 'Any')) {
      return new Response(
        JSON.stringify({
          ok: true,
          data: {
            rating: 0,
            explanation: "No ICP filters set."
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let score = 0;
    const matches: string[] = [];
    const partials: string[] = [];
    const misses: string[] = [];

    // Normalize inputs
    const industries = (icpIndustries || '').toLowerCase().split(',').map((i: string) => i.trim()).filter(Boolean);
    const targetSize = (icpSize || '').toLowerCase();
    const targetContinent = (icpContinent || '').toLowerCase();
    
    const companyIndustry = (companyCard?.industry?.value || '').toLowerCase();
    const companySize = (companyCard?.company_size?.value || '').toLowerCase();
    const companyHQ = (companyCard?.hq_location?.value || '').toLowerCase();

    // Industry matching (0-2 points)
    if (industries.length > 0 && companyIndustry) {
      let industryScore = 0;
      let matched = false;
      
      for (const ind of industries) {
        if (companyIndustry.includes(ind) || ind.includes(companyIndustry)) {
          industryScore = 2;
          matched = true;
          matches.push(`industry matches "${ind}"`);
          break;
        }
        // Check for partial keyword match
        const indWords = ind.split(/\s+/);
        const compWords = companyIndustry.split(/\s+/);
        for (const iw of indWords) {
          for (const cw of compWords) {
            if (iw.length > 3 && cw.length > 3 && (iw.includes(cw) || cw.includes(iw))) {
              industryScore = Math.max(industryScore, 1);
              matched = true;
              partials.push(`industry partially matches "${ind}"`);
              break;
            }
          }
        }
      }
      
      score += industryScore;
      if (!matched) {
        misses.push("industry mismatch");
      }
    }

    // Size matching (0-2 points)
    if (targetSize && targetSize !== 'any' && companySize) {
      const sizeOrder = [
        "1–10 employees",
        "11–50 employees", 
        "51–200 employees",
        "201–500 employees",
        "501–1000 employees",
        "1001+ employees"
      ];
      
      const targetIdx = sizeOrder.findIndex(s => s.toLowerCase() === targetSize);
      let companyIdx = -1;
      
      // Try to match company size
      for (let i = 0; i < sizeOrder.length; i++) {
        if (companySize.includes(sizeOrder[i].toLowerCase()) || 
            sizeOrder[i].toLowerCase().includes(companySize)) {
          companyIdx = i;
          break;
        }
      }
      
      if (targetIdx !== -1 && companyIdx !== -1) {
        const diff = Math.abs(targetIdx - companyIdx);
        if (diff === 0) {
          score += 2;
          matches.push("company size exact match");
        } else if (diff === 1) {
          score += 1;
          partials.push("company size adjacent range");
        } else {
          misses.push("company size different");
        }
      } else if (companySize) {
        misses.push("company size unclear");
      }
    }

    // Continent matching (0-1 point)
    if (targetContinent && targetContinent !== 'any' && companyHQ) {
      const continentKeywords: Record<string, string[]> = {
        'north america': ['usa', 'us', 'united states', 'canada', 'mexico', 'america'],
        'south america': ['brazil', 'argentina', 'chile', 'peru', 'colombia'],
        'europe': ['uk', 'france', 'germany', 'spain', 'italy', 'netherlands', 'sweden', 'europe'],
        'asia': ['china', 'japan', 'india', 'singapore', 'korea', 'thailand', 'asia'],
        'africa': ['south africa', 'kenya', 'nigeria', 'egypt', 'africa'],
        'oceania': ['australia', 'new zealand', 'au', 'nz', 'sydney', 'melbourne', 'oceania']
      };
      
      const keywords = continentKeywords[targetContinent] || [targetContinent];
      let matched = false;
      
      for (const kw of keywords) {
        if (companyHQ.includes(kw)) {
          score += 1;
          matches.push(`HQ in ${targetContinent}`);
          matched = true;
          break;
        }
      }
      
      if (!matched) {
        misses.push("continent mismatch");
      }
    }

    // Clamp score to 0-5
    score = Math.min(5, Math.max(0, score));

    // Build explanation
    let explanation = "";
    if (matches.length > 0) {
      explanation += matches.join("; ") + ". ";
    }
    if (partials.length > 0) {
      explanation += partials.join("; ") + ". ";
    }
    if (misses.length > 0) {
      explanation += "Gaps: " + misses.join(", ") + ".";
    }
    
    if (!explanation) {
      explanation = "No meaningful comparison possible with available data.";
    }

    // Check for missing fields
    const missingFields = [];
    if (!companyIndustry) missingFields.push("industry");
    if (!companySize) missingFields.push("size");
    if (!companyHQ) missingFields.push("HQ location");
    
    if (missingFields.length > 0) {
      explanation += ` Some fields missing (${missingFields.join(", ")}) — may be inaccurate.`;
    }

    console.log(`ICP fit calculated: ${score}/5`);

    return new Response(
      JSON.stringify({
        ok: true,
        data: {
          rating: score,
          explanation: explanation.trim()
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error calculating ICP fit:', error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: { message: error instanceof Error ? error.message : "Failed to calculate ICP fit" }
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
