import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  RefreshCw, 
  Copy, 
  CheckCircle, 
  Clock, 
  ExternalLink,
  Newspaper,
  Globe,
  Users,
  AlertCircle,
  Loader2
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate, useLocation } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDistanceToNow } from "date-fns";

interface OutreachTask {
  id: string;
  customer_id: string;
  recommended_at: string;
  reason_code: 'news' | 'site_update' | 'linkedin' | 'stale';
  priority: number;
  reason: string;
  status: string;
  news_cluster_ids?: string[];
  customer: {
    id: string;
    name: string;
    url: string;
    tags?: string[];
    last_contacted_at?: string;
  };
  news?: Array<{
    id: string;
    title: string;
    summary: string;
    quote?: string;
    published_at: string;
    sources: Array<{
      publisher: string;
      link: string;
    }>;
  }>;
}

export default function TodaysOutreach() {
  const [tasks, setTasks] = useState<OutreachTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [generatingMessage, setGeneratingMessage] = useState<string | null>(null);
  const [generatedMessages, setGeneratedMessages] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('outreach', {
        body: { action: 'list_today' }
      });

      if (error) throw error;
      if (!data.ok) throw new Error('Failed to load tasks');

      const tasks = data.tasks || [];
      setTasks(tasks);

      // Auto-build if empty on first load
      if (tasks.length === 0 && !refreshing) {
        console.log('No tasks found, auto-building...');
        await handleRefresh();
      }
    } catch (error) {
      console.error('Error loading tasks:', error);
      toast({
        title: "Error",
        description: "Failed to load today's outreach tasks",
        variant: "destructive",
      });
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
      const userContext = task.reason_code === 'news' && task.news?.[0]
        ? `I saw your recent news about "${task.news[0].title}"`
        : `I wanted to reach out regarding ${task.customer.name}`;

      const { data, error } = await supabase.functions.invoke('generate-outreach-message', {
        body: {
          url: task.customer.url,
          userContext,
          regenerate: !!generatedMessages[task.id]
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
        description: "Outreach message is ready to copy",
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
    // Optimistic update
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
    } catch (error) {
      console.error('Error marking done:', error);
      // Rollback
      await loadTasks();
      toast({
        title: "Error",
        description: "Failed to mark as done",
        variant: "destructive",
      });
    }
  };

  const handleSnooze = async (task: OutreachTask) => {
    const snoozeUntil = new Date();
    snoozeUntil.setDate(snoozeUntil.getDate() + 7);

    // Optimistic update
    setTasks(prev => prev.filter(t => t.id !== task.id));

    try {
      const { data, error } = await supabase.functions.invoke('outreach', {
        body: {
          action: 'update',
          taskId: task.id,
          updates: {
            status: 'snoozed',
            snooze_until: snoozeUntil.toISOString().split('T')[0]
          }
        }
      });

      if (error) throw error;
      if (!data.ok) throw new Error('Failed to snooze');

      toast({
        title: "Snoozed",
        description: "Task snoozed for 7 days",
      });
    } catch (error) {
      console.error('Error snoozing:', error);
      // Rollback
      await loadTasks();
      toast({
        title: "Error",
        description: "Failed to snooze task",
        variant: "destructive",
      });
    }
  };

  const getReasonIcon = (reasonCode: string) => {
    switch (reasonCode) {
      case 'news': return <Newspaper className="h-4 w-4" />;
      case 'site_update': return <Globe className="h-4 w-4" />;
      case 'linkedin': return <Users className="h-4 w-4" />;
      case 'stale': return <Clock className="h-4 w-4" />;
      default: return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getReasonLabel = (reasonCode: string) => {
    switch (reasonCode) {
      case 'news': return '📰 News';
      case 'site_update': return '🧩 Updated Profile';
      case 'linkedin': return '👤 New Hire';
      case 'stale': return '⏰ Follow-up Due';
      default: return 'Other';
    }
  };

  const getPriorityBadge = (priority: number) => {
    const variants = {
      1: { label: 'P1', variant: 'destructive' as const },
      2: { label: 'P2', variant: 'default' as const },
      3: { label: 'P3', variant: 'secondary' as const }
    };
    const config = variants[priority as keyof typeof variants] || variants[3];
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-96" />
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-48" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b bg-card">
        <div className="max-w-7xl mx-auto p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold">Today's Outreach</h1>
              <p className="text-muted-foreground">Companies you should reach out to today</p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={handleRefresh}
                disabled={refreshing}
              >
                {refreshing ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Refresh Tasks
              </Button>
              <Button variant="outline" onClick={() => navigate('/shortlist')}>
                Shortlist
              </Button>
              <Button variant="outline" onClick={() => navigate('/customers')}>
                Customers
              </Button>
              <Button variant="outline" onClick={() => navigate('/')}>
                Back to Analyze
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        {tasks.length === 0 ? (
          <div className="text-center py-24">
            <CheckCircle className="h-16 w-16 mx-auto mb-4 text-primary" />
            <p className="text-2xl font-semibold mb-4">
              All caught up! 🎉
            </p>
            <p className="text-muted-foreground mb-6">
              No outreach tasks for today. Check back tomorrow or refresh to rebuild.
            </p>
            <Button onClick={handleRefresh}>
              Refresh Tasks
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            {tasks.map((task) => (
              <Card key={task.id} className="hover:shadow-lg transition-all">
                <CardHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-xl font-semibold">{task.customer.name}</h3>
                        {getPriorityBadge(task.priority)}
                        <Badge variant="outline" className="flex items-center gap-1">
                          {getReasonIcon(task.reason_code)}
                          {getReasonLabel(task.reason_code)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <a 
                          href={task.customer.url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="hover:text-primary flex items-center gap-1"
                        >
                          {task.customer.url}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        {task.customer.tags && task.customer.tags.length > 0 && (
                          <div className="flex gap-1">
                            {task.customer.tags.slice(0, 3).map((tag, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-4">
                  {/* Context based on reason */}
                  <div className="bg-muted/50 rounded-lg p-4">
                    <p className="text-sm font-medium mb-2">{task.reason}</p>
                    
                    {task.reason_code === 'news' && task.news && task.news.length > 0 && (
                      <div className="space-y-3">
                        {task.news.slice(0, 2).map((newsItem, idx) => (
                          <div key={idx} className="border-l-2 border-primary pl-3">
                            <a
                              href={newsItem.sources[0]?.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium hover:underline text-sm"
                            >
                              {newsItem.title}
                            </a>
                            <p className="text-xs text-muted-foreground mt-1">
                              {newsItem.summary}
                            </p>
                            {newsItem.quote && (
                              <blockquote className="text-xs italic text-muted-foreground mt-2 border-l-2 pl-2">
                                "{newsItem.quote}"
                              </blockquote>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              {formatDistanceToNow(new Date(newsItem.published_at), { addSuffix: true })} 
                              {newsItem.sources.length > 1 && ` • ${newsItem.sources.length} sources`}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}

                    {task.reason_code === 'stale' && task.customer.last_contacted_at && (
                      <p className="text-xs text-muted-foreground">
                        Last contacted: {formatDistanceToNow(new Date(task.customer.last_contacted_at), { addSuffix: true })}
                      </p>
                    )}
                  </div>

                  {/* Generated message */}
                  {generatedMessages[task.id] && (
                    <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                      <p className="text-sm font-medium mb-2">Suggested Message:</p>
                      <p className="text-sm whitespace-pre-wrap">{generatedMessages[task.id]}</p>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex flex-wrap gap-2">
                    {generatedMessages[task.id] ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() => handleCopyMessage(task.id)}
                        >
                          <Copy className="h-4 w-4 mr-2" />
                          Copy Message
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleGenerateMessage(task)}
                          disabled={generatingMessage === task.id}
                        >
                          {generatingMessage === task.id ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <RefreshCw className="h-4 w-4 mr-2" />
                          )}
                          Generate New
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        onClick={() => handleGenerateMessage(task)}
                        disabled={generatingMessage === task.id}
                      >
                        {generatingMessage === task.id ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Copy className="h-4 w-4 mr-2" />
                        )}
                        Generate Message
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate('/', { state: { preloadUrl: task.customer.url, openEngagement: true } })}
                    >
                      View Insights
                    </Button>

                    <div className="ml-auto flex gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleSnooze(task)}
                            >
                              <Clock className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Snooze 7 days</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleMarkDone(task)}
                            >
                              <CheckCircle className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Mark Done</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
