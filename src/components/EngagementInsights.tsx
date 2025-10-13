import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, TrendingUp, MessageSquare, Lightbulb, Sparkles, RefreshCw, Newspaper, ChevronDown, ChevronUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { formatDistanceToNow } from "date-fns";

interface Keyword {
  term: string;
  weight: number;
}

interface EngagementData {
  brand_voice: {
    tone_summary: string;
    sentiment_score: number;
    style_traits: string[];
    explanation: string;
  };
  key_messages: {
    summary: string;
    keywords: Keyword[];
  };
  outreach_guidance: {
    recommended_tone: string;
    recommended_words: string[];
    example_message: string;
  };
}

interface NewsGroup {
  label: string;
  blurb: string;
  why_it_matters?: string;
}

interface NewsSummary {
  summary: string;
  why_it_matters?: string;
  groups?: NewsGroup[];
  article_count: number;
  generated_at: string;
}

interface EngagementInsightsProps {
  url: string;
}

export const EngagementInsights = ({ url }: EngagementInsightsProps) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<EngagementData | null>(null);
  const [newsLoading, setNewsLoading] = useState(true);
  const [newsSummary, setNewsSummary] = useState<NewsSummary | null>(null);
  const [showGroups, setShowGroups] = useState(false);
  const [assistantState, setAssistantState] = useState<'idle' | 'active' | 'result'>('idle');
  const [userContext, setUserContext] = useState('');
  const [generatedMessage, setGeneratedMessage] = useState('');
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  const toUrlKey = (url: string) => {
    return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '');
  };

  useEffect(() => {
    const fetchInsights = async () => {
      setLoading(true);
      try {
        const { data: response, error } = await supabase.functions.invoke('engagement-insights', {
          body: { url }
        });

        if (error) throw error;

        if (!response.ok) {
          throw new Error(response.error?.message || "Failed to fetch insights");
        }

        setData(response.data);
      } catch (error) {
        console.error('Error fetching engagement insights:', error);
        toast({
          title: "Analysis Failed",
          description: error instanceof Error ? error.message : "Failed to analyze engagement insights",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchInsights();
  }, [url, toast]);

  useEffect(() => {
    const fetchNews = async () => {
      setNewsLoading(true);
      try {
        const urlKey = toUrlKey(url);
        
        // Check cache first
        const { data: existing } = await supabase
          .from('company_news_summaries')
          .select('*')
          .eq('url_key', urlKey)
          .maybeSingle();

        const now = Date.now();
        const isStale = existing && (now - new Date(existing.generated_at).getTime() > 24 * 60 * 60 * 1000);
        
        // Fetch fresh if missing or stale
        if (!existing || existing.article_count === 0 || isStale) {
          const { data: response, error } = await supabase.functions.invoke('news-summary', {
            body: { action: 'build', url_key: urlKey, force: true }
          });

          if (error) throw error;
          
          if (response?.ok && response?.summary) {
            setNewsSummary({
              ...response.summary,
              groups: (response.summary.groups || []) as unknown as NewsGroup[]
            });
          } else {
            setNewsSummary(null);
          }
        } else {
          setNewsSummary({
            ...existing,
            groups: (existing.groups || []) as unknown as NewsGroup[]
          });
        }
      } catch (error) {
        console.error('Error fetching company news:', error);
        // Don't show error toast for news, just fail silently
        setNewsSummary(null);
      } finally {
        setNewsLoading(false);
      }
    };

    fetchNews();
  }, [url, toast]);

  const refreshNews = async () => {
    setNewsLoading(true);
    try {
      const urlKey = toUrlKey(url);
      const { data: response, error } = await supabase.functions.invoke('news-summary', {
        body: { action: 'build', url_key: urlKey, force: true }
      });

      if (error) throw error;
      
      if (response?.ok && response?.summary) {
        setNewsSummary({
          ...response.summary,
          groups: (response.summary.groups || []) as unknown as NewsGroup[]
        });
        toast({
          title: "News refreshed",
          description: "Company news summary has been updated",
        });
      }
    } catch (error) {
      console.error('Error refreshing news:', error);
      toast({
        title: "Refresh failed",
        description: "Could not refresh company news",
        variant: "destructive",
      });
    } finally {
      setNewsLoading(false);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard`,
    });
  };

  const generateMessage = async (regenerate = false) => {
    if (!userContext.trim() && !regenerate) {
      toast({
        title: "Input required",
        description: "Please describe your outreach goal",
        variant: "destructive",
      });
      return;
    }

    setGenerating(true);
    try {
      const { data: response, error } = await supabase.functions.invoke('generate-outreach-message', {
        body: { 
          url, 
          userContext: regenerate ? userContext : userContext.trim(),
          regenerate,
          source: 'engagement_insights'
        }
      });

      if (error) throw error;

      if (!response.ok) {
        throw new Error(response.error?.message || "Failed to generate message");
      }

      setGeneratedMessage(response.message);
      setAssistantState('result');
      toast({
        title: "Message generated!",
        description: "Your personalized outreach message is ready",
      });
    } catch (error) {
      console.error('Error generating message:', error);
      toast({
        title: "Generation failed",
        description: error instanceof Error ? error.message : "Failed to generate outreach message",
        variant: "destructive",
      });
    } finally {
      setGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="text-center space-y-2">
          <h3 className="text-2xl font-semibold">Engagement Insights</h3>
          <p className="text-muted-foreground">
            Analyzing brand voice and communication style...
          </p>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-5/6" />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <Skeleton className="h-6 w-48" />
            </CardHeader>
            <CardContent className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">No engagement insights available</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="text-center space-y-2">
        <h3 className="text-2xl font-semibold">Engagement Insights</h3>
        <p className="text-muted-foreground">
          Understand how this company communicates — and how to engage them effectively.
        </p>
      </div>

      {/* Brand Voice Overview */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Brand Voice Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Tone</p>
            <p className="text-lg font-semibold">{data.brand_voice.tone_summary}</p>
          </div>
          
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Sentiment</p>
            <div className="flex items-center gap-2">
              <div className="flex-1 bg-muted rounded-full h-2">
                <div
                  className="bg-primary rounded-full h-2 transition-all"
                  style={{ width: `${data.brand_voice.sentiment_score * 100}%` }}
                />
              </div>
              <span className="text-sm font-medium">
                {(data.brand_voice.sentiment_score * 100).toFixed(0)}% positive
              </span>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Style Traits</p>
            <div className="flex flex-wrap gap-2">
              {data.brand_voice.style_traits.map((trait, idx) => (
                <Badge key={idx} variant="secondary">
                  {trait}
                </Badge>
              ))}
            </div>
          </div>

          <p className="text-sm text-muted-foreground italic">
            {data.brand_voice.explanation}
          </p>
        </CardContent>
      </Card>

      {/* Key Messaging & Emphasis */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Key Messaging & Emphasis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {data.key_messages.summary}
          </p>
          
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Most Frequent Terms</p>
            <div className="flex flex-wrap gap-2">
              {data.key_messages.keywords
                .sort((a, b) => b.weight - a.weight)
                .map((keyword, idx) => (
                  <Badge
                    key={idx}
                    variant="outline"
                    className="text-sm"
                    style={{
                      fontSize: `${0.75 + keyword.weight * 0.25}rem`,
                      padding: `${0.25 + keyword.weight * 0.25}rem ${0.5 + keyword.weight * 0.5}rem`
                    }}
                  >
                    {keyword.term}
                  </Badge>
                ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Company News */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Newspaper className="h-5 w-5" />
              Company News (last 30 days)
            </CardTitle>
            {!newsLoading && newsSummary && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Last updated • {formatDistanceToNow(new Date(newsSummary.generated_at), { addSuffix: true })}</span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={refreshNews}
                  disabled={newsLoading}
                >
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            AI-generated summary based on recent public coverage
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {newsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          ) : !newsSummary || newsSummary.article_count === 0 ? (
            <p className="text-sm text-muted-foreground italic">
              No company news in the last 30 days.
            </p>
          ) : (
            <>
              {/* Neutral summary */}
              <p className="text-sm leading-relaxed">{newsSummary.summary}</p>

              {/* Why this matters */}
              {newsSummary.why_it_matters && (
                <div className="border-l-4 border-primary bg-primary/5 p-4 rounded-r-lg space-y-1">
                  <p className="text-sm font-semibold text-primary flex items-center gap-2">
                    <Lightbulb className="h-4 w-4" />
                    Why this matters to you
                  </p>
                  <p className="text-sm text-foreground leading-relaxed">
                    {newsSummary.why_it_matters}
                  </p>
                </div>
              )}

              {/* Groups toggle */}
              {newsSummary.groups && newsSummary.groups.length > 0 && (
                <div className="space-y-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowGroups(!showGroups)}
                    className="w-full"
                  >
                    {showGroups ? (
                      <>
                        <ChevronUp className="h-4 w-4 mr-2" />
                        Hide groups
                      </>
                    ) : (
                      <>
                        <ChevronDown className="h-4 w-4 mr-2" />
                        View groups ({newsSummary.groups.length})
                      </>
                    )}
                  </Button>

                  {showGroups && (
                    <div className="space-y-3 pl-4 border-l-2 border-muted">
                      {newsSummary.groups.map((group, idx) => (
                        <div key={idx} className="space-y-1">
                          <p className="text-sm font-medium">{group.label}</p>
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {group.blurb}
                          </p>
                          {group.why_it_matters && (
                            <p className="text-xs italic text-muted-foreground">
                              💡 Why it matters: {group.why_it_matters}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Outreach Guidance */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="h-5 w-5" />
            Outreach Guidance
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium text-muted-foreground mb-1">Recommended Tone</p>
            <p className="text-base font-semibold">{data.outreach_guidance.recommended_tone}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Power Words to Use</p>
            <div className="flex flex-wrap gap-2">
              {data.outreach_guidance.recommended_words.map((word, idx) => (
                <Badge key={idx} variant="secondary">
                  {word}
                </Badge>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground mb-2">Example Outreach Opener</p>
            <div className="bg-muted p-4 rounded-lg relative group">
              <p className="text-sm italic">{data.outreach_guidance.example_message}</p>
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => copyToClipboard(data.outreach_guidance.example_message, "Outreach message")}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* AI Outreach Assistant */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" />
            AI Outreach Assistant
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {assistantState === 'idle' && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Would you like me to create a message to someone at this company?
                Tell me a bit about yourself, your goal, who you're reaching out to, and the platform (e.g., email, LinkedIn).
                I'll use the company's brand tone and language style to help you craft a perfect outreach message.
              </p>
              <Button onClick={() => setAssistantState('active')} className="w-full">
                Start Message Builder
              </Button>
            </div>
          )}

          {assistantState === 'active' && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-2 block">
                  Describe your outreach goal…
                </label>
                <Textarea
                  value={userContext}
                  onChange={(e) => setUserContext(e.target.value)}
                  placeholder="I'm a SaaS founder reaching out to a payments lead at Stripe to explore partnership opportunities via LinkedIn."
                  rows={4}
                  className="resize-none"
                />
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={() => generateMessage(false)} 
                  disabled={generating || !userContext.trim()}
                  className="flex-1"
                >
                  {generating ? "Generating..." : "Generate Message"}
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setAssistantState('idle');
                    setUserContext('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {assistantState === 'result' && (
            <div className="space-y-4">
              <div className="bg-muted p-4 rounded-lg border-2 border-primary/20">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <p className="text-sm font-semibold">Your Outreach Message</p>
                </div>
                <p className="text-sm whitespace-pre-wrap leading-relaxed mb-3">
                  {generatedMessage}
                </p>
                <p className="text-xs text-muted-foreground italic">
                  Based on the company's brand tone and your input.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="default"
                  size="sm"
                  onClick={() => copyToClipboard(generatedMessage, "Outreach message")}
                  className="flex-1"
                >
                  <Copy className="h-4 w-4 mr-2" />
                  Copy Message
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => generateMessage(true)}
                  disabled={generating}
                  className="flex-1"
                >
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Regenerate
                </Button>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setAssistantState('active');
                  setGeneratedMessage('');
                }}
                className="w-full"
              >
                Create New Message
              </Button>
              <p className="text-xs text-muted-foreground text-center italic">
                💡 Tip: You can adjust the message tone — try "more casual" or "more formal" in your description next time.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
