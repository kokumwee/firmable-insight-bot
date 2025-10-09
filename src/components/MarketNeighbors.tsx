import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from "@/components/ui/sheet";
import { Building2, Users, MapPin, Sparkles, ExternalLink, Bookmark, Target, Loader2, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { ConfidenceBadge } from "./ConfidenceBadge";
import { Separator } from "@/components/ui/separator";

interface Neighbor {
  name: string;
  website: string;
  description?: string;
}

interface MarketNeighborsProps {
  url: string;
}

export const MarketNeighbors = ({ url }: MarketNeighborsProps) => {
  const [neighbors, setNeighbors] = useState<Neighbor[]>([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarLoading, setSidebarLoading] = useState(false);
  const [sidebarUrl, setSidebarUrl] = useState("");
  const [sidebarData, setSidebarData] = useState<any>(null);
  const [sidebarTone, setSidebarTone] = useState<any>(null);
  const [analyzingUrls, setAnalyzingUrls] = useState<string[]>([]);
  const { toast } = useToast();
  const navigate = useNavigate();

  // Fetch market neighbors on mount
  useEffect(() => {
    const fetchNeighbors = async () => {
      try {
        const { data, error } = await supabase
          .from('market_neighbors')
          .select('neighbors')
          .eq('url', url)
          .single();

        if (error && error.code !== 'PGRST116') throw error;
        
        if (data?.neighbors && Array.isArray(data.neighbors)) {
          setNeighbors(data.neighbors as unknown as Neighbor[]);
        } else {
          // If no neighbors found, show empty state
          setNeighbors([]);
        }
      } catch (error) {
        console.error('Error fetching neighbors:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchNeighbors();
  }, [url]);

  const handleAnalyzeNeighbor = async (neighbor: Neighbor) => {
    setSidebarOpen(true);
    setSidebarLoading(true);
    setSidebarUrl(neighbor.website);
    setSidebarData(null);
    setSidebarTone(null);
    setAnalyzingUrls(prev => [...prev, neighbor.website]);

    try {
      // Call analyze edge function
      const { data: analyzeResponse, error: analyzeError } = await supabase.functions.invoke('analyze', {
        body: { url: neighbor.website }
      });

      if (analyzeError) throw analyzeError;
      if (!analyzeResponse.ok) {
        throw new Error(analyzeResponse.error?.message || 'Analysis failed');
      }

      setSidebarData(analyzeResponse.data);

      // Try to fetch engagement insights in parallel (best effort)
      try {
        const { data: engagementResponse } = await supabase.functions.invoke('engagement-insights', {
          body: { url: neighbor.website }
        });
        if (engagementResponse?.ok) {
          setSidebarTone(engagementResponse.data);
        }
      } catch (e) {
        console.log('Engagement insights failed (non-critical):', e);
      }
    } catch (error) {
      console.error('Error analyzing neighbor:', error);
      toast({
        title: "Analysis Failed",
        description: error instanceof Error ? error.message : "Couldn't analyze this site",
        variant: "destructive",
      });
      setSidebarOpen(false);
    } finally {
      setSidebarLoading(false);
      setAnalyzingUrls(prev => prev.filter(u => u !== neighbor.website));
    }
  };

  const handleAddToShortlist = async () => {
    if (!sidebarData) return;

    try {
      const { data, error } = await supabase.functions.invoke('shortlist', {
        body: {
          action: 'add',
          companyCard: sidebarData,
          engagement: sidebarTone
        }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error?.message);

      toast({
        title: "✅ Added to My Shortlist",
        description: `${sidebarData.name} has been saved to your shortlist`,
      });
    } catch (error) {
      console.error('Error adding to shortlist:', error);
      toast({
        title: "Error",
        description: "Failed to add to shortlist",
        variant: "destructive",
      });
    }
  };

  const handleOpenFullInsights = () => {
    setSidebarOpen(false);
    navigate('/', { 
      state: { 
        preloadUrl: sidebarUrl,
        openEngagement: false 
      } 
    });
  };

  const handleCloseSidebar = () => {
    setSidebarOpen(false);
    setSidebarData(null);
    setSidebarTone(null);
    setSidebarUrl("");
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Market Neighbors</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="p-4 border rounded-lg space-y-2">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-8 w-24" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (neighbors.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Market Neighbors</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No similar companies found in this market space.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Market Neighbors
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {neighbors.map((neighbor, idx) => (
              <div
                key={idx}
                className="p-4 border rounded-lg hover:border-primary/50 transition-colors space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1">
                    <h4 className="font-semibold text-base">{neighbor.name}</h4>
                    <a
                      href={neighbor.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                    >
                      {neighbor.website}
                      <ExternalLink className="h-3 w-3" />
                    </a>
                    {neighbor.description && (
                      <p className="text-sm text-muted-foreground mt-1">{neighbor.description}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleAnalyzeNeighbor(neighbor)}
                    disabled={analyzingUrls.includes(neighbor.website)}
                  >
                    {analyzingUrls.includes(neighbor.website) ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Analyzing...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Analyze
                      </>
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Analysis Sidebar */}
      <Sheet open={sidebarOpen} onOpenChange={handleCloseSidebar}>
        <SheetContent className="w-full sm:max-w-[540px] overflow-y-auto">
          <SheetHeader className="sticky top-0 bg-background pb-4 border-b">
            <div className="flex items-center gap-3">
              <img
                src={`https://www.google.com/s2/favicons?domain=${sidebarUrl}&sz=32`}
                alt="favicon"
                className="h-6 w-6"
              />
              <SheetTitle className="flex-1 text-left">
                {sidebarData?.name || sidebarUrl}
              </SheetTitle>
            </div>
          </SheetHeader>

          {sidebarLoading ? (
            <div className="py-8 space-y-4">
              <div className="flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
              <p className="text-center text-sm text-muted-foreground">Analyzing company...</p>
            </div>
          ) : sidebarData ? (
            <div className="py-6 space-y-6">
              {/* Quick Facts Grid */}
              <div className="grid grid-cols-1 gap-4">
                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                    <Building2 className="h-3 w-3" />
                    Industry
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{sidebarData.industry?.value || "—"}</p>
                    {sidebarData.industry?.confidence && (
                      <ConfidenceBadge level={sidebarData.industry.confidence} />
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                    <Users className="h-3 w-3" />
                    Company Size
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{sidebarData.company_size?.value || "—"}</p>
                    {sidebarData.company_size?.confidence && (
                      <ConfidenceBadge level={sidebarData.company_size.confidence} />
                    )}
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                    <MapPin className="h-3 w-3" />
                    HQ Location
                  </p>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold">{sidebarData.hq_location?.value || "—"}</p>
                    {sidebarData.hq_location?.confidence && (
                      <ConfidenceBadge level={sidebarData.hq_location.confidence} />
                    )}
                  </div>
                </div>
              </div>

              <Separator />

              {/* USP */}
              <div className="space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Unique Value Proposition</p>
                <p className="text-sm line-clamp-2">{sidebarData.usp?.value || "—"}</p>
              </div>

              <Separator />

              {/* Offerings */}
              {(sidebarData.offerings_bulleted?.length > 0 || sidebarData.offerings?.length > 0) && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Offerings</p>
                  <div className="flex flex-wrap gap-2">
                    {(sidebarData.offerings_bulleted || sidebarData.offerings)?.slice(0, 5).map((item: any, idx: number) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {item.bullet || item.snippet}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Target Audience */}
              {(sidebarData.target_audience_list?.length > 0 || sidebarData.target_audience?.value) && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-2">
                    <Target className="h-3 w-3" />
                    Target Audience
                  </p>
                  {sidebarData.target_audience_list ? (
                    <ul className="list-disc list-inside space-y-1">
                      {sidebarData.target_audience_list.slice(0, 5).map((audience: string, idx: number) => (
                        <li key={idx} className="text-sm">{audience}</li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm">{sidebarData.target_audience?.value}</p>
                  )}
                </div>
              )}

              {/* Tone & Keywords (if available) */}
              {sidebarTone && (
                <>
                  <Separator />
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <p className="text-xs font-medium text-muted-foreground">Brand Tone</p>
                      <p className="text-sm">{sidebarTone.brand_voice?.tone_summary || "—"}</p>
                    </div>
                    {sidebarTone.key_messages?.keywords && (
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">Keywords</p>
                        <div className="flex flex-wrap gap-2">
                          {sidebarTone.key_messages.keywords.slice(0, 3).map((kw: any, idx: number) => (
                            <Badge key={idx} variant="outline" className="text-xs">
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

          <SheetFooter className="sticky bottom-0 bg-background pt-4 border-t mt-6">
            <div className="flex flex-col gap-2 w-full">
              <Button onClick={handleAddToShortlist} className="w-full">
                <Bookmark className="h-4 w-4 mr-2" />
                Add to My Shortlist
              </Button>
              <Button onClick={handleOpenFullInsights} variant="outline" className="w-full">
                <ExternalLink className="h-4 w-4 mr-2" />
                Open Full Insights
              </Button>
              <Button onClick={handleCloseSidebar} variant="ghost" className="w-full">
                <X className="h-4 w-4 mr-2" />
                Close
              </Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
};
