import { useState, useEffect } from "react";
import { Search, Bookmark, List, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoadingSteps } from "@/components/LoadingSteps";
import { CompanyCard } from "@/components/CompanyCard";
import { ChatSection } from "@/components/ChatSection";
import { EngagementInsights } from "@/components/EngagementInsights";
import { MarketNeighbors } from "@/components/MarketNeighbors";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate, useLocation } from "react-router-dom";

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
  const [crawlProgress, setCrawlProgress] = useState<{ stage: string; current: number; total: number } | null>(null);
  const [engagementData, setEngagementData] = useState<any>(null);
  const [savingToShortlist, setSavingToShortlist] = useState(false);
  const [savingToCustomers, setSavingToCustomers] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("insights");
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  // Handle preload from navigation state
  useEffect(() => {
    const state = location.state as { preloadUrl?: string; openEngagement?: boolean } | null;
    if (state?.preloadUrl) {
      setUrl(state.preloadUrl);
      if (state.openEngagement) {
        setActiveTab("engagement");
      }
      // Trigger analysis
      handleAnalyze(state.preloadUrl);
      // Clear navigation state
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state]);

  const handleAnalyze = async (urlToAnalyze?: string) => {
    const targetUrl = urlToAnalyze || url;
    if (!targetUrl.trim()) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid website URL.",
        variant: "destructive",
      });
      return;
    }

    setState("loading");
    setErrorMessage("");
    setCrawlProgress({ stage: "fetching", current: 0, total: 0 });

    try {
      // Simulate progress updates
      const progressInterval = setInterval(() => {
        setCrawlProgress(prev => {
          if (!prev) return null;
          if (prev.stage === "fetching") {
            return { stage: "parsing", current: 0, total: 0 };
          } else if (prev.stage === "parsing") {
            return { stage: "extracting", current: 0, total: 0 };
          } else if (prev.stage === "extracting") {
            return { stage: "summarising", current: 0, total: 0 };
          }
          return prev;
        });
      }, 1500);

      const { data, error } = await supabase.functions.invoke('analyze', {
        body: { url: targetUrl.trim() }
      });

      clearInterval(progressInterval);

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

  const handleSaveToShortlist = async () => {
    if (!companyData) return;
    
    setSavingToShortlist(true);
    try {
      // Fetch engagement insights if not already loaded
      let engagement = engagementData;
      if (!engagement) {
        const { data: engData } = await supabase.functions.invoke('engagement-insights', {
          body: { url: companyData.url }
        });
        if (engData?.ok) {
          engagement = engData.data;
          setEngagementData(engagement);
        }
      }

      const { data, error } = await supabase.functions.invoke('shortlist', {
        body: {
          action: 'add',
          companyCard: companyData,
          engagement: engagement
        }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error?.message);

      toast({
        title: "Saved to Shortlist!",
        description: "Company added to your shortlist successfully",
      });
    } catch (error) {
      console.error('Error saving to shortlist:', error);
      toast({
        title: "Error",
        description: "Failed to save to shortlist",
        variant: "destructive",
      });
    } finally {
      setSavingToShortlist(false);
    }
  };

  const handleSaveToCustomers = async () => {
    if (!companyData?.url) return;
    
    setSavingToCustomers(true);
    try {
      const { data, error } = await supabase.functions.invoke('customers', {
        body: {
          action: 'add_from_analysis',
          url: companyData.url
        }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error?.message);

      toast({
        title: "Saved to Customers!",
        description: "Customer added successfully",
      });
    } catch (error) {
      console.error('Error saving to customers:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save to customers",
        variant: "destructive",
      });
    } finally {
      setSavingToCustomers(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-12">
        {/* Header */}
        <header className="text-center mb-12 animate-fade-in">
          <div className="flex justify-end gap-2 mb-4">
            <Button variant="outline" onClick={() => navigate('/shortlist')}>
              <List className="h-4 w-4 mr-2" />
              My Shortlist
            </Button>
            <Button variant="outline" onClick={() => navigate('/customers')}>
              <Users className="h-4 w-4 mr-2" />
              Existing Customers
            </Button>
          </div>
          <h1 className="text-5xl font-bold text-foreground mb-4">
            Firmable Demo – Kokum
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            Paste a homepage URL to analyze and chat with company data.
          </p>
        </header>

        {/* URL Input Section */}
        <div className="max-w-2xl mx-auto mb-12 animate-slide-up">
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
              onClick={() => handleAnalyze()}
              disabled={state === "loading"}
              size="lg"
              className="px-8"
            >
              <Search className="h-5 w-5 mr-2" />
              Analyze
            </Button>
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
                <Button variant="outline" size="sm" onClick={() => handleAnalyze()}>
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
            <div className="flex justify-center gap-3 mb-6">
              <Button 
                onClick={handleSaveToShortlist}
                disabled={savingToShortlist}
                size="lg"
                className="gap-2"
              >
                <Bookmark className="h-5 w-5" />
                {savingToShortlist ? "Saving..." : "Add to My Shortlist"}
              </Button>
              <Button 
                onClick={handleSaveToCustomers}
                disabled={savingToCustomers}
                size="lg"
                variant="secondary"
                className="gap-2"
              >
                <Users className="h-5 w-5" />
                {savingToCustomers ? "Saving..." : "Add / Update as Customer"}
              </Button>
            </div>
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full max-w-4xl mx-auto">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="insights">Company Insights</TabsTrigger>
                <TabsTrigger value="engagement">Engagement Insights</TabsTrigger>
                <TabsTrigger value="neighbors">Market Neighbors</TabsTrigger>
              </TabsList>
              <TabsContent value="insights" className="space-y-8">
                <CompanyCard data={companyData} onReanalyze={handleReanalyze} />
              </TabsContent>
              <TabsContent value="engagement">
                <EngagementInsights url={companyData.url} />
              </TabsContent>
              <TabsContent value="neighbors">
            <MarketNeighbors 
              currentUrl={companyData.url} 
              companyCard={companyData}
              engagement={engagementData}
            />
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
