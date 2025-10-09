import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Search, Copy, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Neighbor {
  name: string;
  url: string;
  description: string;
  similarity_reason: string;
  similarity_score: number;
  tags: string[];
  favicon_url?: string;
}

interface MarketNeighborsProps {
  url: string;
  onAnalyzeNeighbor: (url: string) => void;
}

export const MarketNeighbors = ({ url, onAnalyzeNeighbor }: MarketNeighborsProps) => {
  const [neighbors, setNeighbors] = useState<Neighbor[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadNeighbors();
  }, [url]);

  const loadNeighbors = async () => {
    if (!url) return;
    
    setLoading(true);
    setError(null);

    try {
      const { data, error: functionError } = await supabase.functions.invoke('suggest-market-neighbors', {
        body: { url }
      });

      if (functionError) throw functionError;

      if (!data.ok) {
        setError(data.error?.message || 'Failed to load neighbors');
        return;
      }

      setNeighbors(data.data || []);
    } catch (err) {
      console.error('Error loading neighbors:', err);
      setError('Failed to load market neighbors. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const copyAsList = () => {
    if (neighbors.length === 0) return;
    
    const list = neighbors.map(n => `${n.name} — ${n.url}`).join('\n');
    navigator.clipboard.writeText(list);
    toast.success("Copied to clipboard");
  };

  const getSimilarityTag = (score: number) => {
    if (score >= 0.75) return { label: "High Match", variant: "default" as const };
    if (score >= 0.5) return { label: "Med Match", variant: "secondary" as const };
    return { label: "Low Match", variant: "outline" as const };
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center space-y-3">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="text-sm text-muted-foreground">Finding related companies…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-8">
        <Card className="border-destructive/50">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
            <Button onClick={loadNeighbors} variant="outline" size="sm" className="mt-4">
              Try Again
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (neighbors.length === 0) {
    return (
      <div className="py-8">
        <Card>
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-muted-foreground">
              No close neighbors identified. Try re-analyzing or broadening your search.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Market Neighbors</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Discover related organizations based on product, industry, and audience.
          </p>
        </div>
        {neighbors.length > 0 && (
          <Button onClick={copyAsList} variant="outline" size="sm">
            <Copy className="h-4 w-4 mr-2" />
            Copy as list
          </Button>
        )}
      </div>

      {neighbors.length < 3 && (
        <p className="text-sm text-muted-foreground italic">
          Showing closest matches I could verify.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {neighbors.map((neighbor, index) => {
          const similarityTag = getSimilarityTag(neighbor.similarity_score);
          
          return (
            <Card key={index} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-muted flex items-center justify-center text-sm font-semibold">
                    {neighbor.favicon_url ? (
                      <img 
                        src={neighbor.favicon_url} 
                        alt={neighbor.name}
                        className="w-6 h-6"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          if (e.currentTarget.nextSibling) {
                            (e.currentTarget.nextSibling as HTMLElement).style.display = 'block';
                          }
                        }}
                      />
                    ) : null}
                    <span style={{ display: neighbor.favicon_url ? 'none' : 'block' }}>
                      {getInitials(neighbor.name)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base leading-tight">
                      <a 
                        href={neighbor.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="hover:underline flex items-center gap-1"
                      >
                        {neighbor.name}
                        <ExternalLink className="h-3 w-3 flex-shrink-0" />
                      </a>
                    </CardTitle>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <CardDescription className="text-sm">
                  {neighbor.description}
                </CardDescription>
                
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Badge variant={similarityTag.variant} className="text-xs">
                    {similarityTag.label}
                  </Badge>
                  <span className="line-clamp-1">{neighbor.similarity_reason}</span>
                </div>

                {neighbor.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {neighbor.tags.map((tag, i) => (
                      <Badge key={i} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 pt-2">
                  <Button
                    onClick={async () => {
                      try {
                        await onAnalyzeNeighbor(neighbor.url);
                      } catch (err: any) {
                        // Handle EMPTY_SITE error specifically
                        if (err?.message?.includes("couldn't find readable pages")) {
                          toast.error("Couldn't analyze this neighbor (blocked or empty). Try another.");
                        } else {
                          toast.error("Failed to analyze neighbor. Please try again.");
                        }
                      }
                    }}
                    size="sm"
                    variant="default"
                    className="flex-1"
                  >
                    <Search className="h-3 w-3 mr-1" />
                    Analyze
                  </Button>
                  <Button
                    onClick={() => toast.info("Compare feature coming soon")}
                    size="sm"
                    variant="outline"
                  >
                    <Plus className="h-3 w-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground text-center pt-4 border-t">
        AI suggestions based on industry, products, and messaging; verify before outreach.
      </p>
    </div>
  );
};