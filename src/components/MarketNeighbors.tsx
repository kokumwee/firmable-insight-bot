import { useState, useEffect } from "react";
import { ExternalLink, Sparkles, AlertCircle, Bookmark } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfidenceBadge } from "@/components/ConfidenceBadge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";

interface Neighbor {
  name: string;
  website: string | null;
  relation: "competitor" | "alternative" | "partner" | "adjacent";
  confidence: "high" | "medium" | "low" | "speculative";
  reason: string;
  source?: "verified" | "ai_suggested" | "ai_potential" | "websearch";
  ai_type?: "suggested" | "competitor" | null;
  evidence?: Array<{ snippet: string; source_url: string }>;
}

interface CompactCard {
  name: string;
  url: string;
  industry?: { value: string; confidence: "high" | "medium" | "low"; evidence: any[] };
  company_size?: { value: string; confidence: "high" | "medium" | "low"; evidence: any[] };
  hq_location?: { value: string; confidence: "high" | "medium" | "low"; evidence: any[] };
  usp?: { value: string; evidence: any[] };
  offerings_bulleted?: Array<{ bullet: string; details: string; evidence: any[] }>;
  target_audience_list?: string[];
  analyzed_at?: string;
}

interface EngagementData {
  brand_voice?: { tone_summary: string };
  key_messages?: { keywords: Array<{ term: string; weight: number }> };
}

interface MarketNeighborsProps {
  currentUrl: string;
  companyCard?: any;
  engagement?: any;
}

export const MarketNeighbors = ({ currentUrl, companyCard, engagement }: MarketNeighborsProps) => {
  const [verifiedNeighbors, setVerifiedNeighbors] = useState<Neighbor[]>([]);
  const [aiNeighbors, setAINeighbors] = useState<Neighbor[]>([]);
  const [loadingVerified, setLoadingVerified] = useState(false);
  const [loadingAI, setLoadingAI] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [drawerCard, setDrawerCard] = useState<CompactCard | null>(null);
  const [drawerEngagement, setDrawerEngagement] = useState<EngagementData | null>(null);
  const [activeUrl, setActiveUrl] = useState("");
  const [analyzingUrls, setAnalyzingUrls] = useState<string[]>([]);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadVerifiedNeighbors();
  }, [currentUrl]);

  const loadVerifiedNeighbors = async () => {
    setLoadingVerified(true);
    try {
      const { data, error } = await supabase.functions.invoke('neighbors', {
        body: { url: currentUrl, mode: 'verified', companyCard, engagement }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error?.message || "Failed to load verified neighbors");

      setVerifiedNeighbors(data.data || []);
    } catch (error) {
      console.error('Error loading verified neighbors:', error);
      toast({
        title: "Error",
        description: "Failed to load verified neighbors",
        variant: "destructive",
      });
      setVerifiedNeighbors([]);
    } finally {
      setLoadingVerified(false);
    }
  };

  const loadAINeighbors = async () => {
    setLoadingAI(true);
    try {
      const { data, error } = await supabase.functions.invoke('neighbors', {
        body: { url: currentUrl, mode: 'ai', companyCard, engagement }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error?.message || "Failed to load AI neighbors");

      setAINeighbors(data.data || []);
    } catch (error) {
      console.error('Error loading AI neighbors:', error);
      toast({
        title: "Error",
        description: "Failed to load AI neighbors",
        variant: "destructive",
      });
      setAINeighbors([]);
    } finally {
      setLoadingAI(false);
    }
  };

  const normalizeUrl = (url: string): string => {
    try {
      if (!url.startsWith('http')) {
        url = 'https://' + url;
      }
      const urlObj = new URL(url);
      return urlObj.href;
    } catch {
      return url;
    }
  };

  const handleAnalyze = async (neighbor: Neighbor) => {
    if (!neighbor.website) {
      toast({
        title: "No URL",
        description: "This neighbor has no website",
        variant: "destructive",
      });
      return;
    }

    const normalizedUrl = normalizeUrl(neighbor.website);
    setActiveUrl(normalizedUrl);
    setDrawerOpen(true);
    setDrawerLoading(true);
    setDrawerCard(null);
    setDrawerEngagement(null);
    setAnalyzingUrls(prev => [...prev, neighbor.website!]);

    try {
      const { data: analyzeData, error: analyzeError } = await supabase.functions.invoke('analyze', {
        body: { url: normalizedUrl }
      });

      if (analyzeError) throw analyzeError;
      if (!analyzeData.ok) {
        throw new Error(analyzeData.error?.message || "Analysis failed");
      }

      const companyData = analyzeData.data;
      setDrawerCard({
        name: companyData.name,
        url: companyData.url,
        industry: companyData.industry,
        company_size: companyData.company_size,
        hq_location: companyData.hq_location,
        usp: companyData.usp,
        offerings_bulleted: companyData.offerings_bulleted,
        target_audience_list: companyData.target_audience_list,
        analyzed_at: companyData.analyzed_at,
      });

      // Fetch engagement insights in parallel (best effort)
      supabase.functions.invoke('engagement-insights', {
        body: { url: normalizedUrl }
      }).then(({ data: engData }) => {
        if (engData?.ok) {
          setDrawerEngagement(engData.data);
        }
      }).catch(() => {
        // Ignore engagement fetch failures
      });
    } catch (error) {
      console.error('Error analyzing neighbor:', error);
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Couldn't analyze this site",
        variant: "destructive",
      });
      setDrawerOpen(false);
    } finally {
      setDrawerLoading(false);
      setAnalyzingUrls(prev => prev.filter(u => u !== neighbor.website));
    }
  };

  const handleAddToShortlist = async () => {
    if (!drawerCard) return;

    try {
      const { data, error } = await supabase.functions.invoke('shortlist', {
        body: {
          action: 'add',
          companyCard: drawerCard,
          engagement: drawerEngagement
        }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error?.message);

      toast({
        title: "✅ Added to My Shortlist",
        description: `${drawerCard.name} has been saved`,
      });
    } catch (error) {
      console.error('Error saving to shortlist:', error);
      toast({
        title: "Error",
        description: "Failed to add to shortlist",
        variant: "destructive",
      });
    }
  };

  const handleOpenFullInsights = () => {
    if (!drawerCard) return;
    setDrawerOpen(false);
    navigate('/', { state: { preloadUrl: drawerCard.url } });
  };

  const NeighborCard = ({ neighbor, isAnalyzing }: { neighbor: Neighbor; isAnalyzing: boolean }) => {
    const getRelationBadgeVariant = (relation: string) => {
      if (relation === "competitor") return "destructive";
      if (relation === "alternative") return "default";
      if (relation === "partner") return "secondary";
      return "outline";
    };

    const getConfidenceBadgeLevel = (confidence: string): "high" | "medium" | "low" => {
      if (confidence === "high") return "high";
      if (confidence === "medium") return "medium";
      return "low";
    };

    const hasWebsite = neighbor.website && neighbor.website.trim().length > 0;

    return (
      <Card className="hover:shadow-md transition-shadow">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                {hasWebsite && (
                  <img 
                    src={`https://www.google.com/s2/favicons?domain=${new URL(neighbor.website!).hostname}&sz=32`}
                    alt="" 
                    className="w-4 h-4"
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                )}
                <h3 className="font-semibold text-base truncate">{neighbor.name}</h3>
              </div>
              {hasWebsite && (
                <a
                  href={neighbor.website!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-muted-foreground hover:underline inline-flex items-center gap-1"
                >
                  {neighbor.website!.replace(/^https?:\/\/(www\.)?/, '')}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {!hasWebsite && (
                <p className="text-xs text-muted-foreground">No website provided</p>
              )}
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge variant={getRelationBadgeVariant(neighbor.relation)} className="text-xs capitalize">
                {neighbor.relation}
              </Badge>
              <ConfidenceBadge level={getConfidenceBadgeLevel(neighbor.confidence)} />
              {neighbor.source === "websearch" && (
                <Badge variant="outline" className="text-xs text-muted-foreground">
                  from web search
                </Badge>
              )}
              {neighbor.ai_type === "competitor" && (
                <Badge variant="outline" className="text-xs border-purple-300 text-purple-700">
                  Competitor (AI)
                </Badge>
              )}
              {neighbor.ai_type === "suggested" && (
                <Badge variant="outline" className="text-xs border-blue-300 text-blue-700">
                  Suggested (AI)
                </Badge>
              )}
            </div>
          </div>
          
          {neighbor.reason && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {neighbor.reason}
            </p>
          )}

          <div className="flex items-center gap-2 pt-2">
            <Button
              size="sm"
              onClick={() => handleAnalyze(neighbor)}
              disabled={!hasWebsite || isAnalyzing}
              className="flex-1"
            >
              {isAnalyzing ? "Analyzing..." : "Analyze"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleAnalyze(neighbor)}
              disabled={!hasWebsite}
            >
              <Bookmark className="h-4 w-4" />
            </Button>
            {hasWebsite && (
              <Button
                size="sm"
                variant="ghost"
                asChild
              >
                <a href={neighbor.website!} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const LoadingSkeleton = () => (
    <div className="space-y-4">
      {[1, 2, 3].map(i => (
        <Card key={i}>
          <CardContent className="p-4">
            <Skeleton className="h-20 w-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );

  return (
    <>
      <Tabs defaultValue="verified" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="verified">
            Verified on Page ({verifiedNeighbors.length})
          </TabsTrigger>
          <TabsTrigger value="ai" onClick={() => !loadingAI && aiNeighbors.length === 0 && loadAINeighbors()}>
            AI Neighbors ({aiNeighbors.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="verified" className="space-y-4">
          {loadingVerified ? (
            <LoadingSkeleton />
          ) : verifiedNeighbors.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">No market neighbors found on this page.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {verifiedNeighbors.map((neighbor, idx) => (
                <NeighborCard
                  key={idx}
                  neighbor={neighbor}
                  isAnalyzing={analyzingUrls.includes(neighbor.website || '')}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="ai" className="space-y-4">
          <Alert className="border-blue-200 bg-blue-50">
            <AlertCircle className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              AI-generated neighbors based on company traits and market knowledge. May include speculative results and web search.
            </AlertDescription>
          </Alert>
          {loadingAI ? (
            <LoadingSkeleton />
          ) : aiNeighbors.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">No AI neighbors available.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {aiNeighbors.map((neighbor, idx) => (
                <NeighborCard
                  key={idx}
                  neighbor={neighbor}
                  isAnalyzing={analyzingUrls.includes(neighbor.website || '')}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              {drawerLoading ? (
                "Analyzing..."
              ) : drawerCard ? (
                <>
                  {drawerCard.url && (
                    <img 
                      src={`https://www.google.com/s2/favicons?domain=${new URL(drawerCard.url).hostname}&sz=32`}
                      alt=""
                      className="w-5 h-5"
                      onError={(e) => (e.currentTarget.style.display = 'none')}
                    />
                  )}
                  <span>{drawerCard.name}</span>
                </>
              ) : null}
            </SheetTitle>
            {drawerCard?.url && !drawerLoading && (
              <SheetDescription className="text-left">
                <a
                  href={drawerCard.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  {drawerCard.url.replace(/^https?:\/\/(www\.)?/, '')}
                  <ExternalLink className="h-3 w-3" />
                </a>
              </SheetDescription>
            )}
          </SheetHeader>

          {drawerLoading ? (
            <div className="space-y-4 mt-6">
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : drawerCard ? (
            <div className="space-y-6 mt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs font-medium text-muted-foreground">Industry</p>
                    {drawerCard.industry?.confidence && (
                      <ConfidenceBadge level={drawerCard.industry.confidence} />
                    )}
                  </div>
                  <p className="text-sm font-semibold">{drawerCard.industry?.value || "—"}</p>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs font-medium text-muted-foreground">Size</p>
                    {drawerCard.company_size?.confidence && (
                      <ConfidenceBadge level={drawerCard.company_size.confidence} />
                    )}
                  </div>
                  <p className="text-sm font-semibold">{drawerCard.company_size?.value || "—"}</p>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs font-medium text-muted-foreground">HQ</p>
                    {drawerCard.hq_location?.confidence && (
                      <ConfidenceBadge level={drawerCard.hq_location.confidence} />
                    )}
                  </div>
                  <p className="text-sm font-semibold">{drawerCard.hq_location?.value || "—"}</p>
                </div>
              </div>

              {drawerCard.usp?.value && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">USP</p>
                  <p className="text-sm line-clamp-2">{drawerCard.usp.value}</p>
                </div>
              )}

              {drawerCard.offerings_bulleted && drawerCard.offerings_bulleted.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Offerings</p>
                  <div className="flex flex-wrap gap-2">
                    {drawerCard.offerings_bulleted.slice(0, 6).map((offering, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {offering.bullet}
                      </Badge>
                    ))}
                    {drawerCard.offerings_bulleted.length > 6 && (
                      <Badge variant="outline" className="text-xs">
                        +{drawerCard.offerings_bulleted.length - 6} more
                      </Badge>
                    )}
                  </div>
                </div>
              )}

              {drawerCard.target_audience_list && drawerCard.target_audience_list.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">Target Audience</p>
                  <ul className="list-disc list-inside space-y-1">
                    {drawerCard.target_audience_list.slice(0, 5).map((audience, idx) => (
                      <li key={idx} className="text-sm">{audience}</li>
                    ))}
                  </ul>
                </div>
              )}

              {drawerEngagement && (
                <>
                  <div className="border-t pt-4" />
                  <div className="space-y-3">
                    {drawerEngagement.brand_voice?.tone_summary && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-1">Tone</p>
                        <Badge variant="outline">{drawerEngagement.brand_voice.tone_summary}</Badge>
                      </div>
                    )}
                    {drawerEngagement.key_messages?.keywords && drawerEngagement.key_messages.keywords.length > 0 && (
                      <div>
                        <p className="text-xs font-medium text-muted-foreground mb-2">Keywords</p>
                        <div className="flex flex-wrap gap-2">
                          {drawerEngagement.key_messages.keywords.slice(0, 3).map((kw, idx) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {kw.term}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          ) : null}

          <SheetFooter className="mt-6 flex-col sm:flex-row gap-2">
            <Button
              onClick={handleAddToShortlist}
              disabled={!drawerCard || drawerLoading}
              className="w-full sm:w-auto"
            >
              <Bookmark className="h-4 w-4 mr-2" />
              Add to My Shortlist
            </Button>
            <Button
              variant="secondary"
              onClick={handleOpenFullInsights}
              disabled={!drawerCard || drawerLoading}
              className="w-full sm:w-auto"
            >
              Open Full Insights
            </Button>
            <Button
              variant="outline"
              onClick={() => setDrawerOpen(false)}
              className="w-full sm:w-auto"
            >
              Close
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
};
