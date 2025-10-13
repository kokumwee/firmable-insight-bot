import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Newspaper, RefreshCw, Trash2, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDistanceToNow } from "date-fns";

interface NewsSource {
  title: string;
  link: string;
  publisher: string;
  published_at: string;
}

interface NewsItem {
  id: string;
  source: string;
  title: string;
  summary: string;
  quote: string | null;
  link: string;
  published_at: string;
  relevance: number;
  reason: string | null;
  sources?: NewsSource[];
}

interface CompanyNewsProps {
  url: string;
}

export const CompanyNews = ({ url }: CompanyNewsProps) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [items, setItems] = useState<NewsItem[]>([]);
  const { toast } = useToast();

  const fetchNews = async () => {
    try {
      const { data: response, error } = await supabase.functions.invoke('news', {
        body: { action: 'list', url }
      });

      if (error) throw error;

      if (response.ok) {
        setItems(response.items || []);
      }
    } catch (error) {
      console.error('Error fetching news:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNews();
  }, [url]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const { data: response, error } = await supabase.functions.invoke('news', {
        body: { action: 'refresh', url }
      });

      if (error) throw error;

      if (response.ok) {
        setItems(response.items || []);
        toast({
          title: "News refreshed",
          description: `Found ${response.items?.length || 0} relevant items`,
        });
      } else {
        throw new Error(response.message || "Failed to refresh news");
      }
    } catch (error) {
      console.error('Error refreshing news:', error);
      toast({
        title: "Refresh failed",
        description: error instanceof Error ? error.message : "Failed to refresh news",
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleDelete = async (id: string) => {
    const previousItems = [...items];
    
    // Optimistic update
    setItems(prev => prev.filter(item => item.id !== id));

    try {
      const { data: response, error } = await supabase.functions.invoke('news', {
        body: { action: 'delete', id }
      });

      if (error) throw error;
      if (!response?.ok) throw new Error(response?.message || "Failed to delete");

      toast({
        title: "Removed",
        description: "News item deleted",
      });
    } catch (error) {
      console.error('Error deleting news:', error);
      setItems(previousItems);
      toast({
        title: "Delete failed",
        description: error instanceof Error ? error.message : "Failed to delete",
        variant: "destructive",
      });
    }
  };

  const getSourceBadge = (source: string) => {
    const variants: Record<string, { label: string; variant: "default" | "secondary" | "outline" }> = {
      news: { label: "News", variant: "default" },
      web: { label: "Web", variant: "secondary" },
      social: { label: "Social", variant: "outline" },
      ai_guess: { label: "AI Guess", variant: "outline" },
    };
    const config = variants[source] || { label: source, variant: "outline" as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  const getRelevanceBadge = (relevance: number) => {
    if (relevance >= 0.7) return <Badge variant="default">High</Badge>;
    if (relevance >= 0.4) return <Badge variant="secondary">Medium</Badge>;
    return <Badge variant="outline">Low</Badge>;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Newspaper className="h-5 w-5" />
            Company News
          </CardTitle>
          <CardDescription>Loading news...</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="space-y-2 pb-4 border-b last:border-0">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Newspaper className="h-5 w-5" />
              Company News
            </CardTitle>
            <CardDescription>
              {items.length === 0 
                ? "No recent items found" 
                : "AI summaries from recent news and posts. Max 5 items."}
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length === 0 ? (
          <div className="text-center py-6 text-sm text-muted-foreground">
            <p>No news in the last 30 days.</p>
          </div>
        ) : (
          items.map((item) => (
            <div key={item.id} className="space-y-2 pb-4 border-b last:border-0">
              {/* Title */}
              <div className="flex items-start justify-between gap-2">
                <a
                  href={item.link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-base font-semibold hover:underline flex items-center gap-1 flex-1"
                >
                  {item.title}
                  <ExternalLink className="h-3 w-3 opacity-50" />
                </a>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(item.id);
                  }}
                  className="h-8 w-8 p-0 shrink-0"
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>

              {/* Meta row */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {getSourceBadge(item.source)}
                <span>•</span>
                <span>{formatDistanceToNow(new Date(item.published_at), { addSuffix: true })}</span>
                <span>•</span>
                {getRelevanceBadge(item.relevance)}
              </div>

              {/* Summary */}
              <p className="text-sm text-muted-foreground">{item.summary}</p>

              {/* Quote */}
              {item.quote && (
                <blockquote className="border-l-2 border-primary/20 pl-3 py-1 text-sm italic text-muted-foreground bg-muted/30 rounded-r">
                  "{item.quote}"
                </blockquote>
              )}

              {/* Sources */}
              {item.sources && item.sources.length > 1 && (
                <div className="text-xs text-muted-foreground">
                  <span className="font-medium">Also reported by:</span>{' '}
                  {item.sources.slice(1, 4).map((src, idx) => (
                    <span key={idx}>
                      <a
                        href={src.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {src.publisher}
                      </a>
                      {idx < Math.min(item.sources!.length - 2, 2) && ', '}
                    </span>
                  ))}
                </div>
              )}

              {/* Reason */}
              {item.reason && (
                <p className="text-xs text-muted-foreground">
                  <span className="font-medium">Why relevant:</span> {item.reason}
                </p>
              )}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};