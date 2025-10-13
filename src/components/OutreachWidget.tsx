import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import {
  Copy,
  CheckCircle,
  RefreshCw,
  ExternalLink,
  Loader2,
  Calendar
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { lastContactLabel } from "@/lib/dates";

interface OutreachTask {
  id: string;
  customer_id: string;
  recommended_at: string;
  reason_code: 'news' | 'site_update' | 'linkedin' | 'stale';
  priority: number;
  status: string;
  news_cluster_ids?: string[];
  news_group_labels?: string[];
  news_group_hashes?: string[];
  news_blurb_snippet?: string;
  news_sources_short?: string[];
  news_published_at?: string;
  news_relevance_reason?: string;
  customer: {
    id: string;
    name: string;
    url: string;
    last_contacted_at?: string;
  };
  news?: Array<{
    id: string;
    title: string;
    summary: string;
    published_at: string;
  }>;
}

interface OutreachWidgetProps {
  count: number;
  onCountChange: () => void;
}

export function OutreachWidget({ count, onCountChange }: OutreachWidgetProps) {
  const [open, setOpen] = useState(false);
  const [tasks, setTasks] = useState<OutreachTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [generatingMessage, setGeneratingMessage] = useState<string | null>(null);
  const [generatedMessages, setGeneratedMessages] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    if (open && tasks.length === 0) {
      loadTasks();
    }
  }, [open]);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('outreach', {
        body: { action: 'list_today' }
      });

      if (error) throw error;
      if (!data.ok) throw new Error('Failed to load tasks');

      const allTasks = data.tasks || [];
      setTasks(allTasks.slice(0, 5)); // Top 5 only
    } catch (error) {
      console.error('Error loading tasks:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const { data, error } = await supabase.functions.invoke('outreach', {
        body: { action: 'build_today', force: true }
      });

      if (error) throw error;
      if (!data.ok) throw new Error('Failed to rebuild tasks');

      toast({
        title: "Refreshed",
        description: `Found ${data.count} tasks for today`,
      });
      await loadTasks();
      onCountChange();
    } catch (error) {
      console.error('Error refreshing tasks:', error);
      toast({
        title: "Error",
        description: "Failed to refresh tasks",
        variant: "destructive",
      });
    } finally {
      setRefreshing(false);
    }
  };

  const handleGenerateMessage = async (task: OutreachTask) => {
    setGeneratingMessage(task.id);
    try {
      let userContext = '';
      
      // Use news-specific context if available
      if (task.reason_code === 'news' && task.news_blurb_snippet) {
        const newsLabel = task.news_group_labels?.[0] || 'recent news';
        userContext = `I saw your recent ${newsLabel.toLowerCase()}`;
      } else if (task.reason_code === 'news' && task.news?.[0]) {
        userContext = `I saw your recent news about "${task.news[0].title}"`;
      } else {
        userContext = `I wanted to reach out regarding ${task.customer.name}`;
      }

      const { data, error } = await supabase.functions.invoke('generate-outreach-message', {
        body: {
          url: task.customer.url,
          userContext,
          regenerate: !!generatedMessages[task.id],
          task: {
            reason_code: task.reason_code,
            news_blurb_snippet: task.news_blurb_snippet,
            news_group_labels: task.news_group_labels,
            news_sources_short: task.news_sources_short,
            news_published_at: task.news_published_at,
            news_relevance_reason: task.news_relevance_reason
          }
        }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error?.message);

      setGeneratedMessages(prev => ({
        ...prev,
        [task.id]: data.message
      }));

      toast({
        title: "Message generated",
        description: "Ready to copy",
      });
    } catch (error) {
      console.error('Error generating message:', error);
      toast({
        title: "Error",
        description: "Failed to generate message",
        variant: "destructive",
      });
    } finally {
      setGeneratingMessage(null);
    }
  };

  const handleCopyMessage = (taskId: string) => {
    const message = generatedMessages[taskId];
    if (message) {
      navigator.clipboard.writeText(message);
      toast({
        title: "Copied!",
        description: "Message copied to clipboard",
      });
    }
  };

  const handleMarkDone = async (task: OutreachTask) => {
    setTasks(prev => prev.filter(t => t.id !== task.id));

    try {
      const { data, error } = await supabase.functions.invoke('outreach', {
        body: {
          action: 'update',
          taskId: task.id,
          updates: { status: 'done' }
        }
      });

      if (error) throw error;
      if (!data.ok) throw new Error('Failed to mark as done');

      toast({
        title: "Done!",
        description: "Task marked as complete",
      });
      onCountChange();
    } catch (error) {
      console.error('Error marking done:', error);
      await loadTasks();
      toast({
        title: "Error",
        description: "Failed to mark as done",
        variant: "destructive",
      });
    }
  };

  const getReasonChip = (reasonCode: string) => {
    switch (reasonCode) {
      case 'news': return { emoji: '🔴', label: 'News', variant: 'destructive' as const };
      case 'site_update': return { emoji: '🔁', label: 'Site updated', variant: 'default' as const };
      case 'linkedin': return { emoji: '👥', label: 'New hire', variant: 'default' as const };
      case 'stale': return { emoji: '⏰', label: 'Follow-up', variant: 'secondary' as const };
      default: return { emoji: '', label: 'Other', variant: 'secondary' as const };
    }
  };

  const getContextLine = (task: OutreachTask) => {
    if (task.reason_code === 'news') {
      if (task.news_relevance_reason) {
        const label = task.news_group_labels?.[0] || 'News';
        return `${label} — ${task.news_relevance_reason}`;
      }
      if (task.news_blurb_snippet) {
        const label = task.news_group_labels?.[0] || 'Recent news';
        const snippet = task.news_blurb_snippet.slice(0, 80);
        return `${label} — ${snippet}...`;
      }
      if (task.news?.[0]) {
        return task.news[0].title;
      }
      return 'Recent company news';
    }
    if (task.reason_code === 'site_update') {
      return 'Website updated';
    }
    if (task.reason_code === 'stale') {
      return lastContactLabel(task.customer.last_contacted_at);
    }
    return 'Reach out recommended';
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild className="fixed bottom-6 right-6 z-50">
        <Button variant="outline" className="gap-2">
          <Calendar className="h-4 w-4" />
          Today's Outreach
          {count > 0 && (
            <Badge variant="default" className="ml-1">
              {count}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[500px] max-h-[80vh] overflow-hidden p-0" align="end" side="top" sideOffset={8}>
        <div className="p-4 border-b bg-muted/50">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Today's Outreach</h3>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="h-7 w-7 p-0"
            >
              {refreshing ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <RefreshCw className="h-3 w-3" />
              )}
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Top 5 priority tasks</p>
            <span className="text-xs text-muted-foreground">
              Updated • {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>

        <ScrollArea className="max-h-[calc(80vh-140px)]">
          {loading ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mx-auto mb-2" />
              Loading tasks...
            </div>
          ) : tasks.length === 0 ? (
            <div className="p-8 text-center">
              <CheckCircle className="h-8 w-8 mx-auto mb-2 text-primary" />
              <p className="text-sm font-medium mb-1">All caught up!</p>
              <p className="text-xs text-muted-foreground">No outreach tasks for today</p>
            </div>
          ) : (
            <div className="divide-y">
              {tasks.map((task) => {
                const chip = getReasonChip(task.reason_code);
                return (
                  <div key={task.id} className="p-4 hover:bg-muted/50 transition-colors space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <h4 className="font-medium text-sm">{task.customer.name}</h4>
                          <Badge variant={chip.variant} className="text-xs shrink-0">
                            {chip.emoji} {chip.label}
                          </Badge>
                        </div>
                        {task.reason_code === 'news' && task.news_relevance_reason ? (
                          <div className="space-y-2">
                            <div className="flex items-start gap-2">
                              <Badge variant="secondary" className="text-xs shrink-0">
                                {task.news_group_labels?.[0] || 'News'}
                              </Badge>
                              <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
                                {task.news_blurb_snippet || getContextLine(task)}
                              </p>
                            </div>
                            <div className="flex items-start gap-2 pl-1 border-l-2 border-primary/30">
                              <span className="text-xs font-medium text-primary shrink-0">Why →</span>
                              <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">
                                {task.news_relevance_reason}
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{getContextLine(task)}</p>
                        )}
                        {task.reason_code === 'news' && (
                          <button
                            onClick={() => {
                              setOpen(false);
                              navigate('/customers?tab=news');
                            }}
                            className="text-xs text-primary hover:underline mt-2 flex items-center gap-1"
                          >
                            View sources →
                          </button>
                        )}
                      </div>
                    </div>

                    {generatedMessages[task.id] && (
                      <div className="my-2 p-2 bg-primary/5 border border-primary/20 rounded text-xs">
                        <p className="line-clamp-2">{generatedMessages[task.id]}</p>
                      </div>
                    )}

                    <div className="flex gap-1 mt-2">
                      {generatedMessages[task.id] ? (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs flex-1"
                            onClick={() => handleCopyMessage(task.id)}
                          >
                            <Copy className="h-3 w-3 mr-1" />
                            Copy
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => handleGenerateMessage(task)}
                            disabled={generatingMessage === task.id}
                          >
                            {generatingMessage === task.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs flex-1"
                          onClick={() => handleGenerateMessage(task)}
                          disabled={generatingMessage === task.id}
                        >
                          {generatingMessage === task.id ? (
                            <>
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              Generating...
                            </>
                          ) : (
                            <>Generate</>
                          )}
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => handleMarkDone(task)}
                      >
                        <CheckCircle className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>

        <div className="p-3 border-t">
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={() => {
              setOpen(false);
              navigate('/customers?tab=outreach');
            }}
          >
            <ExternalLink className="h-3 w-3 mr-2" />
            Open full view
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
