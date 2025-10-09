import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoadingSteps } from "@/components/LoadingSteps";
import { CompanyCard } from "@/components/CompanyCard";
import { ChatSection } from "@/components/ChatSection";
import { EngagementInsights } from "@/components/EngagementInsights";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
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

const Index = () => {
  const [url, setUrl] = useState("");
  const [state, setState] = useState<AppState>("idle");
  const [companyData, setCompanyData] = useState<CompanyData | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [crawlProgress, setCrawlProgress] = useState<{ stage: string; current: number; total: number; fullCrawl: boolean } | null>(null);
  const [fullSiteCrawlEnabled, setFullSiteCrawlEnabled] = useState(false);
  const { toast } = useToast();

  const normalizeUrl = (input: string): string => {
    if (!input) return input;
    let normalized = input.trim();
    if (!/^https?:\/\//i.test(normalized)) normalized = "https://" + normalized;
    try {
      const u = new URL(normalized);
      u.host = u.host.toLowerCase();
      u.hash = "";
      return u.toString();
    } catch { return normalized; }
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
    
    const initialStage = fullSiteCrawlEnabled ? "discovering" : "fetching";
    setCrawlProgress({ stage: initialStage, current: 0, total: 0, fullCrawl: fullSiteCrawlEnabled });

    try {
      // Simulate progress updates (in production, this would be real-time via websockets)
      const progressInterval = setInterval(() => {
        setCrawlProgress(prev => {
          if (!prev) return null;
          
          if (prev.fullCrawl) {
            // Full-site crawl stages
            if (prev.stage === "discovering") {
              return { ...prev, stage: "crawling", current: 0, total: 50 };
            } else if (prev.stage === "crawling" && prev.current < prev.total) {
              return { ...prev, current: prev.current + 5 };
            } else if (prev.stage === "crawling") {
              return { ...prev, stage: "extracting", current: 0, total: 0 };
            }
          } else {
            // Single-page stages
            if (prev.stage === "fetching") {
              return { ...prev, stage: "parsing" };
            } else if (prev.stage === "parsing") {
              return { ...prev, stage: "extracting" };
            }
          }
          return prev;
        });
      }, 1000);

      const { data, error } = await supabase.functions.invoke('analyze', {
        body: { 
          url: normalizeUrl(url.trim()),
          fullCrawl: fullSiteCrawlEnabled
        }
      });

      clearInterval(progressInterval);

      if (error) {
        throw error;
      }

      if (!data.ok) {
        setState("error");
        let errorMsg = data.error?.message || "We couldn't analyze this site. Please try another URL.";
        
        // Add contextual tip based on mode
        if (!fullSiteCrawlEnabled && data.error?.code === "BLOCKED_OR_EMPTY") {
          errorMsg = "We couldn't read this page. Tip: Try turning on Full-site crawl to discover About/Company pages.";
        } else if (fullSiteCrawlEnabled && data.error?.code === "EMPTY_SITE") {
          errorMsg = "Some pages were blocked or empty — we couldn't find enough content to analyze.";
        }
        
        setErrorMessage(errorMsg);
        
        toast({
          title: "Analysis Failed",
          description: errorMsg,
          variant: "destructive",
        });
        return;
      }

      setCompanyData(data.data as CompanyData);
      setState("success");
      
      toast({
        title: "Analysis Complete",
        description: "Company data has been successfully analyzed.",
      });
      
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
        <div className="max-w-2xl mx-auto mb-12 animate-slide-up space-y-4">
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
          
          {/* Full-site crawl toggle */}
          <div className="flex items-start gap-3 px-1">
            <Switch
              id="fullSiteCrawlEnabled"
              checked={fullSiteCrawlEnabled}
              onCheckedChange={setFullSiteCrawlEnabled}
              disabled={state === "loading"}
            />
            <div className="flex flex-col gap-1">
              <Label 
                htmlFor="fullSiteCrawlEnabled" 
                className="text-sm font-medium cursor-pointer"
              >
                Full-site crawl (slower)
              </Label>
              <p className="text-xs text-muted-foreground">
                {fullSiteCrawlEnabled 
                  ? "Crawls the whole site via sitemap/BFS. May take longer."
                  : "Analyzes just this page for fastest results."}
              </p>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {state === "loading" && <LoadingSteps progress={crawlProgress} />}

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
            <Tabs defaultValue="company" className="w-full max-w-4xl mx-auto">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="company">Company Insights</TabsTrigger>
                <TabsTrigger value="engagement">Engagement Insights</TabsTrigger>
              </TabsList>
              <TabsContent value="company" className="space-y-8">
                <CompanyCard data={companyData} onReanalyze={handleReanalyze} />
              </TabsContent>
              <TabsContent value="engagement">
                <EngagementInsights url={companyData.url} />
              </TabsContent>
            </Tabs>
            <ChatSection currentUrl={companyData.url} onAsk={handleAsk} />
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
