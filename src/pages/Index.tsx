import { useState, useEffect } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoadingSteps } from "@/components/LoadingSteps";
import { CompanyCard } from "@/components/CompanyCard";
import { ChatSection } from "@/components/ChatSection";
import { IcpForm } from "@/components/IcpForm";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type AppState = "idle" | "loading" | "error" | "success";

interface Evidence {
  snippet: string;
  source?: string;
  offset?: number;
}

interface FieldWithConfidence {
  value: string;
  confidence: "high" | "medium" | "low";
  evidence: Evidence[];
}

interface CompanyData {
  name: string;
  url: string;
  industry: FieldWithConfidence;
  company_size: FieldWithConfidence;
  hq_location: FieldWithConfidence;
  usp: FieldWithConfidence;
  offerings: Evidence[];
  target_audience: FieldWithConfidence;
  contacts: {
    emails: string[];
    phones: string[];
    socials: {
      linkedin?: string;
      twitter?: string;
      facebook?: string;
      instagram?: string;
    };
  };
  analyzed_at: string;
}

interface IcpData {
  industries: string[];
  size: string;
  regions: string[];
  audience: string;
  offering_keywords: string;
  weights: {
    industry: number;
    size: number;
    region: number;
    audience: number;
    offerings: number;
  };
}

interface IcpFit {
  score: number;
  status: string;
  rationale: string;
  subscores?: Record<string, number>;
}

const Index = () => {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<AppState>("idle");
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [icp, setIcp] = useState<IcpData>({
    industries: [],
    size: "",
    regions: [],
    audience: "",
    offering_keywords: "",
    weights: { industry: 3, size: 2, region: 2, audience: 2, offerings: 2 }
  });
  const [icpFit, setIcpFit] = useState<IcpFit>({ score: 0, status: "", rationale: "" });
  const [isSavingIcp, setIsSavingIcp] = useState(false);
  const { toast } = useToast();

  // Load ICP from DB on mount
  useEffect(() => {
    loadIcp();
  }, []);

  const loadIcp = async () => {
    try {
      const { data, error } = await supabase
        .from('user_icp')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      if (data?.icp_json) {
        const icpData = data.icp_json as any;
        if (icpData && typeof icpData === 'object') {
          setIcp({
            industries: icpData.industries || [],
            size: icpData.size || "",
            regions: icpData.regions || [],
            audience: icpData.audience || "",
            offering_keywords: icpData.offering_keywords || "",
            weights: icpData.weights || { industry: 3, size: 2, region: 2, audience: 2, offerings: 2 }
          });
        }
      }
    } catch (error) {
      console.error('Error loading ICP:', error);
    }
  };

  const saveIcp = async () => {
    setIsSavingIcp(true);
    try {
      // First check if record exists
      const { data: existing } = await supabase
        .from('user_icp')
        .select('id')
        .eq('owner_id', 'default')
        .maybeSingle();

      const record = {
        owner_id: 'default',
        icp_json: icp as any,
        updated_at: new Date().toISOString()
      };

      let error;
      if (existing) {
        ({ error } = await supabase
          .from('user_icp')
          .update(record)
          .eq('id', existing.id));
      } else {
        ({ error } = await supabase
          .from('user_icp')
          .insert([record]));
      }

      if (error) throw error;

      toast({
        title: "ICP Saved",
        description: "Your Ideal Customer Profile has been saved.",
      });

      // Recalculate fit if company is loaded
      if (companyData?.url) {
        await computeFit(companyData.url);
      }
    } catch (error) {
      console.error('Error saving ICP:', error);
      toast({
        title: "Save Failed",
        description: "Failed to save ICP. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSavingIcp(false);
    }
  };

  const resetIcp = () => {
    setIcp({
      industries: [],
      size: "",
      regions: [],
      audience: "",
      offering_keywords: "",
      weights: { industry: 3, size: 2, region: 2, audience: 2, offerings: 2 }
    });
    setIcpFit({ score: 0, status: "", rationale: "" });
  };

  const computeFit = async (targetUrl: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('compute-icp-fit', {
        body: { url: targetUrl, icp }
      });

      if (error) throw error;

      if (data.ok) {
        setIcpFit(data.data);
      } else {
        console.error('Fit computation failed:', data.error);
        setIcpFit({ score: 0, status: "Unknown", rationale: "Unable to compute fit." });
      }
    } catch (error) {
      console.error('Error computing fit:', error);
      setIcpFit({ score: 0, status: "Unknown", rationale: "Error computing fit." });
    }
  };

  const handleAnalyze = async () => {
    if (!url.trim()) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid website URL.",
        variant: "destructive",
      });
      return;
    }

    setState("loading");
    setErrorMessage("");

    try {
      const { data, error } = await supabase.functions.invoke('analyze', {
        body: { url: url.trim() }
      });

      if (error) {
        throw error;
      }

      if (!data.ok) {
        setState("error");
        const errorMsg = data.error?.message || "We couldn't analyze this site. Please try another URL.";
        setErrorMessage(errorMsg);
        
        toast({
          title: "Analysis Failed",
          description: errorMsg,
          variant: "destructive",
        });
        return;
      }

      const compData = data.data as CompanyData;
      setCompanyData(compData);
      setState("success");
      
      toast({
        title: "Analysis Complete",
        description: "Company data has been successfully analyzed.",
      });

      // Compute ICP fit
      await computeFit(compData.url);
      
      setTimeout(() => {
        document.getElementById("results")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (error) {
      console.error('Analysis error:', error);
      setState("error");
      const errorMsg = error instanceof Error ? error.message : "We couldn't analyze this site. Please try another URL.";
      setErrorMessage(errorMsg);
      
      toast({
        title: "Analysis Failed",
        description: errorMsg,
        variant: "destructive",
      });
    }
  };

  const handleAsk = async (query: string) => {
    if (!companyData?.url) {
      throw new Error("No company data available");
    }

    const { data, error } = await supabase.functions.invoke('ask', {
      body: { url: companyData.url, query }
    });

    if (error) {
      throw error;
    }

    if (!data.ok) {
      throw new Error(data.error?.message || "Failed to process question");
    }

    return {
      answer: data.data.answer,
      citations: data.data.citations || [],
      guardrail: data.data.guardrail || "on_homepage"
    };
  };

  const handleReanalyze = () => {
    handleAnalyze();
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <header className="text-center mb-12 animate-fade-in">
          <h1 className="text-5xl font-bold text-foreground mb-4">
            Firmable Demo – Kokum
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Paste a homepage URL to analyze and chat with company data.
          </p>
        </header>

        {/* URL Input Section */}
        <div className="max-w-2xl mx-auto mb-8 animate-slide-up">
          <div className="flex gap-4">
            <Input
              type="url"
              placeholder="Enter website URL (e.g., https://example.com)"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAnalyze()}
              disabled={state === "loading"}
              className="flex-1 text-base"
            />
            <Button
              onClick={handleAnalyze}
              disabled={state === "loading"}
              size="lg"
              className="px-8"
            >
              <Search className="h-5 w-5 mr-2" />
              Analyze
            </Button>
          </div>
        </div>

        {/* ICP Section */}
        <div className="mb-12 animate-slide-up">
          <IcpForm 
            icp={icp} 
            onUpdate={setIcp} 
            onSave={saveIcp}
            onReset={resetIcp}
            isSaving={isSavingIcp}
          />
        </div>

        {/* Loading State */}
        {state === "loading" && <LoadingSteps />}

        {/* Error State */}
        {state === "error" && (
          <Alert variant="destructive" className="max-w-2xl mx-auto animate-fade-in">
            <AlertDescription>
              <div className="flex items-center justify-between mb-2">
                <span>{errorMessage}</span>
                <Button variant="outline" size="sm" onClick={handleAnalyze}>
                  Retry
                </Button>
              </div>
              <p className="text-sm opacity-80 mt-2">
                Tip: Some sites block automated reads. Try a different URL or a less JS-heavy page.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {/* Success State */}
        {state === "success" && companyData && (
          <div id="results" className="space-y-8">
            <CompanyCard 
              data={companyData} 
              onReanalyze={handleReanalyze}
              icpFit={icpFit.status ? icpFit : undefined}
            />
            <ChatSection currentUrl={companyData.url} onAsk={handleAsk} />
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
