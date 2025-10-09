import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoadingSteps } from "@/components/LoadingSteps";
import { CompanyCard } from "@/components/CompanyCard";
import { ChatSection } from "@/components/ChatSection";
import { useToast } from "@/hooks/use-toast";

type AppState = "idle" | "loading" | "error" | "success";

interface Evidence {
  snippet: string;
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
  const { toast } = useToast();

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
      // TODO: Replace with actual API endpoint when backend is deployed
      // Simulating API call with mock data for now
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Mock response
      const mockData: CompanyData = {
        name: "Acme Inc.",
        url: url,
        industry: {
          value: "Software",
          confidence: "high",
          evidence: [{ snippet: "Acme builds cutting-edge SaaS products for enterprises." }]
        },
        company_size: {
          value: "11–50",
          confidence: "medium",
          evidence: [{ snippet: "A small but dedicated team of experts." }]
        },
        hq_location: {
          value: "San Francisco, CA",
          confidence: "high",
          evidence: [{ snippet: "Headquartered in the heart of San Francisco." }]
        },
        usp: {
          value: "We simplify complex logistics workflows",
          confidence: "high",
          evidence: [{ snippet: "Our mission is to simplify logistics workflows for modern businesses." }]
        },
        offerings: [
          { snippet: "Logistics automation platform" },
          { snippet: "Real-time tracking and analytics" },
          { snippet: "API integrations with major carriers" }
        ],
        target_audience: {
          value: "Small to medium businesses",
          confidence: "medium",
          evidence: [{ snippet: "Helping small businesses streamline their operations." }]
        },
        contacts: {
          emails: ["info@acme.com", "support@acme.com"],
          phones: ["+1 (123) 456-7890"],
          socials: {
            linkedin: "https://linkedin.com/company/acme",
            twitter: "https://twitter.com/acme",
            facebook: "https://facebook.com/acme"
          }
        },
        analyzed_at: new Date().toISOString()
      };

      setCompanyData(mockData);
      setState("success");
      
      // Smooth scroll to results
      setTimeout(() => {
        document.getElementById("results")?.scrollIntoView({ behavior: "smooth" });
      }, 100);
    } catch (error) {
      setState("error");
      setErrorMessage("We couldn't analyze this site. Please try again.");
    }
  };

  const handleAsk = async (query: string) => {
    // TODO: Replace with actual API endpoint when backend is deployed
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    return {
      answer: `Based on the homepage, ${query} relates to their core mission of simplifying logistics workflows.`,
      citations: [{ snippet: "Acme provides end-to-end logistics automation solutions." }],
      guardrail: "on_homepage"
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

        {/* Loading State */}
        {state === "loading" && <LoadingSteps />}

        {/* Error State */}
        {state === "error" && (
          <Alert variant="destructive" className="max-w-2xl mx-auto animate-fade-in">
            <AlertDescription className="flex items-center justify-between">
              <span>{errorMessage}</span>
              <Button variant="outline" size="sm" onClick={handleAnalyze}>
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Success State */}
        {state === "success" && companyData && (
          <div id="results" className="space-y-8">
            <CompanyCard data={companyData} onReanalyze={handleReanalyze} />
            <ChatSection currentUrl={companyData.url} onAsk={handleAsk} />
          </div>
        )}
      </div>
    </div>
  );
};

export default Index;
