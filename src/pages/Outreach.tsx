import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, RefreshCw, Copy, Check, Clock, Eye, MessageSquare, Loader2 } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

export default function Outreach() {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [generatingMessage, setGeneratingMessage] = useState<string | null>(null);
  const [messages, setMessages] = useState<Record<string, string>>({});
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadTasks();
  }, []);

  const loadTasks = async (force = false) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('outreach', {
        body: { action: 'build_today', force }
      });

      if (error) throw error;
      setTasks(data.data || []);

      // Pre-generate messages for first 3 tasks
      const firstThree = (data.data || []).slice(0, 3);
      for (const task of firstThree) {
        if (task.customer?.url) {
          generateMessage(task.id, task.customer.url);
        }
      }
    } catch (error: any) {
      toast({
        title: "Error loading outreach tasks",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const generateMessage = async (taskId: string, url: string) => {
    setGeneratingMessage(taskId);
    try {
      const { data, error } = await supabase.functions.invoke('generate-outreach-message', {
        body: { url, userContext: "Following up with an existing customer" }
      });

      if (error) throw error;
      setMessages(prev => ({ ...prev, [taskId]: data.message }));
    } catch (error: any) {
      console.error("Error generating message:", error);
      setMessages(prev => ({ ...prev, [taskId]: "Error generating message. Please try again." }));
    } finally {
      setGeneratingMessage(null);
    }
  };

  const handleMarkDone = async (taskId: string) => {
    setLoadingAction(taskId);
    try {
      const { error } = await supabase.functions.invoke('outreach', {
        body: { action: 'update', task_id: taskId, status: 'done' }
      });

      if (error) throw error;
      toast({ title: "Task marked as done" });
      loadTasks();
    } catch (error: any) {
      toast({
        title: "Error updating task",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSnooze = async (taskId: string, days: number) => {
    setLoadingAction(taskId);
    try {
      const snoozeDate = new Date();
      snoozeDate.setDate(snoozeDate.getDate() + days);

      const { error } = await supabase.functions.invoke('outreach', {
        body: {
          action: 'update',
          task_id: taskId,
          status: 'snoozed',
          snooze_until: snoozeDate.toISOString().split('T')[0]
        }
      });

      if (error) throw error;
      toast({ title: `Snoozed for ${days} days` });
      loadTasks();
    } catch (error: any) {
      toast({
        title: "Error snoozing task",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCopyMessage = (message: string) => {
    navigator.clipboard.writeText(message);
    toast({ title: "Message copied to clipboard" });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Today's Outreach</h1>
              <p className="text-muted-foreground">Recommended customers to follow up with today</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Badge variant="secondary">{tasks.length} tasks today</Badge>
            <Button onClick={() => loadTasks(true)} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {tasks.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-2xl mb-2">You're all caught up for today 🎉</p>
              <p className="text-muted-foreground mb-4">No outreach tasks at the moment</p>
              <Button onClick={() => navigate('/customers')}>
                Go to Existing Customers
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {tasks.map((task) => {
              const customer = task.customer;
              const message = messages[task.id];
              const isGenerating = generatingMessage === task.id;

              return (
                <Card key={task.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-lg flex items-center gap-2">
                          {customer?.url && (
                            <img
                              src={`https://www.google.com/s2/favicons?domain=${new URL(customer.url).hostname}&sz=32`}
                              alt=""
                              className="w-4 h-4"
                              onError={(e) => e.currentTarget.style.display = 'none'}
                            />
                          )}
                          {customer?.name}
                        </CardTitle>
                        {customer?.url && (
                          <CardDescription className="text-xs mt-1">
                            {new URL(customer.url).hostname}
                          </CardDescription>
                        )}
                      </div>
                      <Badge variant="secondary">{task.reason}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {customer?.usp?.value && (
                      <p className="text-sm text-muted-foreground">
                        {customer.usp.value.slice(0, 120)}...
                      </p>
                    )}

                    {customer?.url && (
                      <div className="border rounded-lg p-4 bg-muted/50">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="text-sm font-medium">Suggested Message</h4>
                          {!message && !isGenerating && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => generateMessage(task.id, customer.url)}
                            >
                              Generate
                            </Button>
                          )}
                        </div>
                        {isGenerating ? (
                          <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Generating message...
                          </div>
                        ) : message ? (
                          <div className="space-y-2">
                            <p className="text-sm whitespace-pre-wrap">{message}</p>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleCopyMessage(message)}
                            >
                              <Copy className="w-4 h-4 mr-2" />
                              Copy
                            </Button>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">Click Generate to create a personalized message</p>
                        )}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              onClick={() => handleMarkDone(task.id)}
                              disabled={loadingAction === task.id}
                            >
                              <Check className="w-4 h-4 mr-2" />
                              Mark Done
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Mark as contacted</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleSnooze(task.id, 7)}
                              disabled={loadingAction === task.id}
                            >
                              <Clock className="w-4 h-4 mr-2" />
                              Snooze 7d
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Remind me in 7 days</TooltipContent>
                        </Tooltip>

                        {customer?.url && (
                          <>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => navigate(`/?url=${encodeURIComponent(customer.url)}`)}
                                >
                                  <Eye className="w-4 h-4 mr-2" />
                                  View Insights
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Open company insights</TooltipContent>
                            </Tooltip>

                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => navigate(`/?url=${encodeURIComponent(customer.url)}&tab=outreach`)}
                                >
                                  <MessageSquare className="w-4 h-4 mr-2" />
                                  Generate Outreach
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>Open engagement insights</TooltipContent>
                            </Tooltip>
                          </>
                        )}
                      </TooltipProvider>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
