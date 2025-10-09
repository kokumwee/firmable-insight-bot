import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Copy, TrendingUp, MessageSquare, Lightbulb } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Skeleton } from "@/components/ui/skeleton";

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

interface EngagementInsightsProps {
  url: string;
}

export const EngagementInsights = ({ url }: EngagementInsightsProps) => {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<EngagementData | null>(null);
  const { toast } = useToast();

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

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: "Copied!",
      description: `${label} copied to clipboard`,
    });
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
    </div>
  );
};
