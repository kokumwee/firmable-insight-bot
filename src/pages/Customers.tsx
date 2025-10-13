import { useState, useEffect } from "react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Grid, List, ExternalLink, Trash2, Copy, Mail, Eye, CheckCircle, RefreshCw, Loader2, Clock, Newspaper, Globe, Users as UsersIcon, AlertCircle, ChevronDown } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate, useSearchParams } from "react-router-dom";
import { 
  AlertDialog, 
  AlertDialogAction, 
  AlertDialogCancel, 
  AlertDialogContent, 
  AlertDialogDescription, 
  AlertDialogFooter, 
  AlertDialogHeader, 
  AlertDialogTitle 
} from "@/components/ui/alert-dialog";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDistanceToNow } from "date-fns";
import { lastContactLabel } from "@/lib/dates";
import { useOutreachCount } from "@/hooks/useOutreachCount";

interface CustomerItem {
  id: string;
  url: string | null;
  url_key: string | null;
  name: string;
  industry: { value: string } | null;
  company_size: { value: string } | null;
  hq_location: { value: string } | null;
  usp: { value: string } | null;
  offerings_bulleted: any[] | null;
  target_audience_list: string[] | null;
  tone_summary: string | null;
  keywords_top: Array<{ term: string; weight: number }> | null;
  last_contacted_at: string | null;
  notes: string | null;
  tags: string[] | null;
  created_at: string;
  updated_at: string;
}

interface NewsGroup {
  label: string;
  blurb: string;
  why_it_matters?: string;
  items: Array<{
    title: string;
    publisher: string;
    published_at: string;
    link?: string;
  }>;
}

interface NewsSummary {
  url_key: string;
  company_name: string;
  summary: string;
  why_it_matters?: string;
  groups: NewsGroup[];
  sources: string[];
  article_count: number;
  generated_at: string;
}

interface OutreachTask {
  id: string;
  customer_id: string;
  recommended_at: string;
  reason_code: 'news' | 'site_update' | 'linkedin' | 'stale';
  priority: number;
  reason: string;
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

interface NewsItem {
  id: string;
  title: string;
  summary: string;
  quote?: string;
  published_at: string;
  source: string;
  link?: string;
  sources?: Array<{ publisher: string; link: string }>;
  url_key: string;
  relevance: number;
}

export default function Customers() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get('tab') || localStorage.getItem('ui.customers.activeTab') || 'customers';
  
  const [items, setItems] = useState<CustomerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"cards" | "table">(() => {
    const saved = localStorage.getItem('ui.view.customersList');
    return (saved as "cards" | "table") || "cards";
  });
  const [sortBy, setSortBy] = useState("created_at_desc");
  const [itemToRemove, setItemToRemove] = useState<CustomerItem | null>(null);
  
  // Outreach tab state
  const [outreachTasks, setOutreachTasks] = useState<OutreachTask[]>([]);
  const [outreachLoading, setOutreachLoading] = useState(false);
  const [refreshingOutreach, setRefreshingOutreach] = useState(false);
  const [generatingMessage, setGeneratingMessage] = useState<string | null>(null);
  const [generatedMessages, setGeneratedMessages] = useState<Record<string, string>>({});
  const { refetch: refetchOutreachCount } = useOutreachCount();
  
  // News tab state
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsViewMode, setNewsViewMode] = useState<"cards" | "table">(() => {
    const saved = localStorage.getItem('ui.view.companyNews');
    return (saved as "cards" | "table") || "cards";
  });
  const [newsSortBy, setNewsSortBy] = useState("newest");
  const [newsSummaries, setNewsSummaries] = useState<any[]>([]);
  const [summariesLoading, setSummariesLoading] = useState(false);
  const [refreshingSummary, setRefreshingSummary] = useState<string | null>(null);
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>([]);
  
  const { toast } = useToast();
  const navigate = useNavigate();
  
  const handleTabChange = (value: string) => {
    setSearchParams({ tab: value });
    localStorage.setItem('ui.customers.activeTab', value);
  };

  const handleViewModeChange = (mode: "cards" | "table") => {
    setViewMode(mode);
    localStorage.setItem('ui.view.customersList', mode);
  };
  
  const handleNewsViewModeChange = (mode: "cards" | "table") => {
    setNewsViewMode(mode);
    localStorage.setItem('ui.view.companyNews', mode);
  };

  useEffect(() => {
    loadItems();
  }, [sortBy]);
  
  useEffect(() => {
    if (activeTab === 'outreach') {
      loadOutreachTasks();
    } else if (activeTab === 'news') {
      loadNews();
    }
  }, [activeTab]);
  
  useEffect(() => {
    if (activeTab === 'news' && items.length > 0) {
      loadNews();
    }
  }, [newsSortBy]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('customers', {
        body: { 
          action: 'list',
          sort: sortBy
        }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error?.message);

      setItems(data.data || []);
    } catch (error) {
      console.error('Error loading customers:', error);
      toast({
        title: "Error",
        description: "Failed to load customers",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };
  
  const loadOutreachTasks = async () => {
    setOutreachLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('outreach', {
        body: { action: 'list_today' }
      });

      if (error) throw error;
      if (!data.ok) throw new Error('Failed to load tasks');

      const tasks = data.tasks || [];
      setOutreachTasks(tasks);

      if (tasks.length === 0) {
        await handleRefreshOutreach();
      }
    } catch (error) {
      console.error('Error loading outreach tasks:', error);
      toast({
        title: "Error",
        description: "Failed to load outreach tasks",
        variant: "destructive",
      });
    } finally {
      setOutreachLoading(false);
    }
  };
  
  const loadNews = async () => {
    setSummariesLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('news-summary', {
        body: { action: 'get_all', force: false }
      });

      if (error) throw error;
      if (!data.ok) throw new Error('Failed to load summaries');

      let summaries = data.summaries || [];
      
      // Apply company filter
      if (selectedCompanies.length > 0) {
        summaries = summaries.filter((s: any) => selectedCompanies.includes(s.url_key));
      }
      
      // Apply sorting
      if (newsSortBy === 'company') {
        summaries.sort((a: any, b: any) => a.company_name.localeCompare(b.company_name));
      } else if (newsSortBy === 'oldest') {
        summaries.sort((a: any, b: any) => new Date(a.generated_at).getTime() - new Date(b.generated_at).getTime());
      }

      setNewsSummaries(summaries);
    } catch (error) {
      console.error('Error loading news summaries:', error);
      toast({
        title: "Error",
        description: "Failed to load company news summaries",
        variant: "destructive",
      });
    } finally {
      setSummariesLoading(false);
    }
  };
  
  const handleRefreshSummary = async (url_key: string) => {
    setRefreshingSummary(url_key);
    try {
      const { data, error } = await supabase.functions.invoke('news-summary', {
        body: { action: 'build', url_key, force: true }
      });

      if (error) throw error;
      if (!data.ok) throw new Error('Failed to refresh summary');

      toast({
        title: "Refreshed",
        description: "Summary updated successfully",
      });
      await loadNews();
    } catch (error) {
      console.error('Error refreshing summary:', error);
      toast({
        title: "Error",
        description: "Failed to refresh summary",
        variant: "destructive",
      });
    } finally {
      setRefreshingSummary(null);
    }
  };
  
  const handleRefreshAllSummaries = async () => {
    setSummariesLoading(true);
    try {
      const companiesToRefresh = selectedCompanies.length > 0 
        ? items.filter(item => selectedCompanies.includes(item.url_key))
        : items;
      
      for (const item of companiesToRefresh) {
        await supabase.functions.invoke('news-summary', {
          body: { action: 'build', url_key: item.url_key, force: true }
        });
        await new Promise(resolve => setTimeout(resolve, 200));
      }

      toast({
        title: "Refreshed",
        description: `Updated summaries for ${companiesToRefresh.length} companies`,
      });
      await loadNews();
    } catch (error) {
      console.error('Error refreshing summaries:', error);
      toast({
        title: "Error",
        description: "Failed to refresh summaries",
        variant: "destructive",
      });
    } finally {
      setSummariesLoading(false);
    }
  };
  
  const handleRefreshOutreach = async () => {
    setRefreshingOutreach(true);
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
      await loadOutreachTasks();
      refetchOutreachCount();
    } catch (error) {
      console.error('Error refreshing tasks:', error);
      toast({
        title: "Error",
        description: "Failed to refresh tasks",
        variant: "destructive",
      });
    } finally {
      setRefreshingOutreach(false);
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
    setOutreachTasks(prev => prev.filter(t => t.id !== task.id));

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
      refetchOutreachCount();
    } catch (error) {
      console.error('Error marking done:', error);
      await loadOutreachTasks();
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
    setOutreachTasks(prev => prev.filter(t => t.id !== task.id));

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
      refetchOutreachCount();
    } catch (error) {
      console.error('Error snoozing:', error);
      await loadOutreachTasks();
      toast({
        title: "Error",
        description: "Failed to snooze task",
        variant: "destructive",
      });
    }
  };

  const handleRemove = async () => {
    if (!itemToRemove) return;
    
    try {
      const { data, error } = await supabase.functions.invoke('customers', {
        body: { action: 'remove', id: itemToRemove.id }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error?.message);

      toast({
        title: "Removed",
        description: "Customer removed successfully",
      });

      setItems(items.filter(i => i.id !== itemToRemove.id));
    } catch (error) {
      console.error('Error removing customer:', error);
      toast({
        title: "Error",
        description: "Failed to remove customer",
        variant: "destructive",
      });
    } finally {
      setItemToRemove(null);
    }
  };

  const handleMarkContacted = async (id: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('customers', {
        body: { action: 'mark_contacted', id }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error?.message);

      toast({
        title: "Updated",
        description: "Marked as contacted",
      });

      setItems(items.map(i => i.id === id ? { ...i, last_contacted_at: new Date().toISOString() } : i));
    } catch (error) {
      console.error('Error marking contacted:', error);
      toast({
        title: "Error",
        description: "Failed to update",
        variant: "destructive",
      });
    }
  };

  const handleNotesUpdate = async (id: string, notes: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('customers', {
        body: { action: 'update_meta', id, notes }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error?.message);

      setItems(items.map(i => i.id === id ? { ...i, notes } : i));
    } catch (error) {
      console.error('Error updating notes:', error);
      toast({
        title: "Error",
        description: "Failed to update notes",
        variant: "destructive",
      });
    }
  };

  const handleTagsUpdate = async (id: string, tags: string[]) => {
    try {
      const { data, error } = await supabase.functions.invoke('customers', {
        body: { action: 'update_meta', id, tags }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error?.message);

      setItems(items.map(i => i.id === id ? { ...i, tags } : i));
      toast({
        title: "Updated",
        description: "Tags updated successfully",
      });
    } catch (error) {
      console.error('Error updating tags:', error);
      toast({
        title: "Error",
        description: "Failed to update tags",
        variant: "destructive",
      });
    }
  };

  const handleCopySummary = (item: CustomerItem) => {
    const summary = `
Company: ${item.name}
Industry: ${item.industry?.value || "—"}
Size: ${item.company_size?.value || "—"}
HQ: ${item.hq_location?.value || "—"}
USP: ${item.usp?.value || "—"}
Offerings: ${(item.offerings_bulleted || []).map((o: any) => o.bullet || o).join(", ")}
Audience: ${(item.target_audience_list || []).join(", ")}
    `.trim();

    navigator.clipboard.writeText(summary);
    toast({
      title: "Copied!",
      description: "Summary copied to clipboard",
    });
  };

  const truncate = (text: string | undefined, length: number) => {
    if (!text) return "—";
    return text.length > length ? text.substring(0, length) + "..." : text;
  };

  const normalizeUrl = (url: string | null) => {
    if (!url) return null;
    try {
      // Add protocol if missing
      const urlWithProtocol = url.startsWith('http://') || url.startsWith('https://') 
        ? url 
        : `https://${url}`;
      return new URL(urlWithProtocol);
    } catch {
      return null;
    }
  };

  const getFaviconUrl = (url: string | null) => {
    const normalized = normalizeUrl(url);
    if (!normalized) return null;
    return `https://www.google.com/s2/favicons?domain=${normalized.hostname}&sz=32`;
  };

  const getReasonIcon = (reasonCode: string) => {
    switch (reasonCode) {
      case 'news': return <Newspaper className="h-4 w-4" />;
      case 'site_update': return <Globe className="h-4 w-4" />;
      case 'linkedin': return <UsersIcon className="h-4 w-4" />;
      case 'stale': return <Clock className="h-4 w-4" />;
      default: return <AlertCircle className="h-4 w-4" />;
    }
  };

  const getReasonLabel = (reasonCode: string) => {
    switch (reasonCode) {
      case 'news': return '🔴 News';
      case 'site_update': return '🔁 Site updated';
      case 'linkedin': return '👥 New hire';
      case 'stale': return '⏰ Follow-up';
      default: return 'Other';
    }
  };

  const getReasonText = (task: OutreachTask): string => {
    if (task.reason_code === 'news') {
      if (task.news_relevance_reason) {
        const label = task.news_group_labels?.[0] || 'News';
        return `${label} — ${task.news_relevance_reason}`;
      }
      if (task.news_blurb_snippet) {
        const label = task.news_group_labels?.[0] || 'Recent news';
        const snippet = task.news_blurb_snippet.slice(0, 100);
        return `${label} — ${snippet}...`;
      }
      if (task.news && task.news.length > 0) {
        return `${task.customer.name} has ${task.news.length} recent news ${task.news.length === 1 ? 'article' : 'articles'}`;
      }
      return `${task.customer.name} has recent news`;
    }
    
    switch (task.reason_code) {
      case 'site_update':
        return `${task.customer.name}'s website was recently updated`;
      case 'linkedin':
        return `${task.customer.name} has new LinkedIn activity`;
      case 'stale':
        return `${task.customer.name} • ${lastContactLabel(task.customer.last_contacted_at)}`;
      default:
        return `Reach out to ${task.customer.name}`;
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

  const renderCard = (item: CustomerItem) => (
    <Card key={item.id} className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {item.url && getFaviconUrl(item.url) && (
              <img 
                src={getFaviconUrl(item.url)!} 
                alt="" 
                className="w-8 h-8 rounded flex-shrink-0"
                onError={(e) => e.currentTarget.style.display = 'none'}
              />
            )}
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-lg truncate">{item.name}</h3>
              {item.url && (
                <a 
                  href={normalizeUrl(item.url)?.href || item.url} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-sm text-muted-foreground hover:underline flex items-center gap-1 truncate"
                >
                  {normalizeUrl(item.url)?.hostname || item.url}
                  <ExternalLink className="h-3 w-3 flex-shrink-0" />
                </a>
              )}
            </div>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span className="text-muted-foreground">Industry:</span>
            <p className="font-medium">{item.industry?.value || "—"}</p>
          </div>
          <div>
            <span className="text-muted-foreground">Size:</span>
            <p className="font-medium">{item.company_size?.value || "—"}</p>
          </div>
          <div className="col-span-2">
            <span className="text-muted-foreground">HQ:</span>
            <p className="font-medium">{item.hq_location?.value || "—"}</p>
          </div>
        </div>

        {item.usp?.value && (
          <div>
            <span className="text-sm text-muted-foreground">USP:</span>
            <p className="text-sm mt-1">{truncate(item.usp.value, 120)}</p>
          </div>
        )}

        {item.offerings_bulleted && item.offerings_bulleted.length > 0 && (
          <div>
            <span className="text-sm text-muted-foreground">Offerings:</span>
            <div className="flex flex-wrap gap-1 mt-1">
              {item.offerings_bulleted.slice(0, 3).map((o: any, i: number) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {typeof o === 'string' ? o : o.bullet}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {item.target_audience_list && item.target_audience_list.length > 0 && (
          <div>
            <span className="text-sm text-muted-foreground">Audience:</span>
            <p className="text-sm mt-1">{item.target_audience_list.slice(0, 3).join(" • ")}</p>
          </div>
        )}

        {item.tone_summary && (
          <div>
            <span className="text-sm text-muted-foreground">Tone:</span>
            <p className="text-sm mt-1">{item.tone_summary}</p>
          </div>
        )}

        {item.keywords_top && item.keywords_top.length > 0 && (
          <div>
            <span className="text-sm text-muted-foreground">Keywords:</span>
            <p className="text-sm mt-1">{item.keywords_top.slice(0, 3).map(k => k.term).join(", ")}</p>
          </div>
        )}

        <div>
          <span className="text-sm text-muted-foreground">Last Contacted:</span>
          <p className="text-sm mt-1">
            {item.last_contacted_at 
              ? formatDistanceToNow(new Date(item.last_contacted_at), { addSuffix: true })
              : "Never"}
          </p>
        </div>

        <div>
          <span className="text-sm text-muted-foreground">Tags:</span>
          <div className="flex flex-wrap gap-1 mt-1">
            {(item.tags || []).map((tag, i) => (
              <Badge key={i} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        </div>

        <div>
          <span className="text-sm text-muted-foreground">Notes:</span>
          <Textarea
            value={item.notes || ""}
            onChange={(e) => handleNotesUpdate(item.id, e.target.value)}
            placeholder="Add notes..."
            className="mt-1 min-h-[60px] text-sm"
          />
        </div>
      </CardContent>

      <CardFooter className="flex flex-wrap gap-2 pt-4">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => item.url && navigate('/analyze', { state: { preloadUrl: item.url } })}
              disabled={!item.url}
            >
              <Eye className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>View Insights</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => item.url && navigate('/analyze', { state: { preloadUrl: item.url, openEngagement: true } })}
              disabled={!item.url}
            >
              <Mail className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Generate Outreach</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleMarkContacted(item.id)}
            >
              <CheckCircle className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Mark Contacted</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleCopySummary(item)}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Copy Summary</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setItemToRemove(item)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Remove</TooltipContent>
        </Tooltip>
      </CardFooter>
    </Card>
  );

  const renderTable = () => (
    <div className="rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Industry</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>HQ</TableHead>
            <TableHead>USP</TableHead>
            <TableHead>Offerings</TableHead>
            <TableHead>Audience</TableHead>
            <TableHead>Last Contacted</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.map((item) => (
            <TableRow key={item.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  {item.url && getFaviconUrl(item.url) && (
                    <img 
                      src={getFaviconUrl(item.url)!} 
                      alt="" 
                      className="w-5 h-5 rounded flex-shrink-0"
                      onError={(e) => e.currentTarget.style.display = 'none'}
                    />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium truncate">{item.name}</div>
                    {item.url && (
                      <a 
                        href={normalizeUrl(item.url)?.href || item.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs text-muted-foreground hover:underline truncate block"
                      >
                        {normalizeUrl(item.url)?.hostname || item.url}
                      </a>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell>{item.industry?.value || "—"}</TableCell>
              <TableCell>{item.company_size?.value || "—"}</TableCell>
              <TableCell>{item.hq_location?.value || "—"}</TableCell>
              <TableCell className="max-w-xs">
                <div className="truncate text-sm">{truncate(item.usp?.value, 80)}</div>
              </TableCell>
              <TableCell>
                <div className="text-sm">
                  {(item.offerings_bulleted || [])
                    .slice(0, 3)
                    .map((o: any) => typeof o === 'string' ? o : o.bullet)
                    .join(" • ")}
                </div>
              </TableCell>
              <TableCell>
                <div className="text-sm">
                  {(item.target_audience_list || []).slice(0, 3).join(" • ")}
                </div>
              </TableCell>
              <TableCell>
                <div className="text-sm">
                  {item.last_contacted_at 
                    ? formatDistanceToNow(new Date(item.last_contacted_at), { addSuffix: true })
                    : "Never"}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => item.url && navigate('/analyze', { state: { preloadUrl: item.url } })}
                        disabled={!item.url}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>View Insights</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => item.url && navigate('/analyze', { state: { preloadUrl: item.url, openEngagement: true } })}
                        disabled={!item.url}
                      >
                        <Mail className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Generate Outreach</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleMarkContacted(item.id)}
                      >
                        <CheckCircle className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Mark Contacted</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopySummary(item)}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Copy Summary</TooltipContent>
                  </Tooltip>

                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setItemToRemove(item)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Remove</TooltipContent>
                  </Tooltip>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-7xl mx-auto p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold">Existing Customers</h1>
              <p className="text-muted-foreground">Current customers and engagement history.</p>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={handleTabChange}>
            <TabsList>
              <TabsTrigger value="customers">Customer List</TabsTrigger>
              <TabsTrigger value="outreach">
                Outreach List
                {outreachTasks.length > 0 && (
                  <Badge variant="default" className="ml-2">
                    {outreachTasks.length}
                  </Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="news">Company News</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">
        <Tabs value={activeTab} onValueChange={handleTabChange}>
          {/* Tab A: Customer List */}
          <TabsContent value="customers" className="mt-0">
            <div className="flex flex-col sm:flex-row gap-4 items-center mb-6">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="created_at_desc">Newest First</SelectItem>
                  <SelectItem value="name_asc">Name A-Z</SelectItem>
                  <SelectItem value="last_contacted_asc">Stale First</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex gap-2 ml-auto">
                <Button
                  variant={viewMode === "cards" ? "default" : "outline"}
                  size="icon"
                  onClick={() => handleViewModeChange("cards")}
                >
                  <Grid className="h-4 w-4" />
                </Button>
                <Button
                  variant={viewMode === "table" ? "default" : "outline"}
                  size="icon"
                  onClick={() => handleViewModeChange("table")}
                >
                  <List className="h-4 w-4" />
                </Button>
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-8 w-3/4" />
                    </CardHeader>
                    <CardContent>
                      <Skeleton className="h-40" />
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : items.length === 0 ? (
              <div className="text-center py-16">
                <p className="text-muted-foreground mb-4">
                  No customers yet. Add one from Company Insights or My Shortlist.
                </p>
                <Button onClick={() => navigate('/analyze')}>
                  Go to Analyze Companies
                </Button>
              </div>
            ) : viewMode === "cards" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {items.map(renderCard)}
              </div>
            ) : (
              renderTable()
            )}
          </TabsContent>

          {/* Tab B: Outreach List */}
          <TabsContent value="outreach" className="mt-0">
            <div className="flex items-center justify-between mb-6">
              <p className="text-sm text-muted-foreground">
                Companies you should reach out to today
              </p>
              <Button
                variant="outline"
                onClick={handleRefreshOutreach}
                disabled={refreshingOutreach}
              >
                {refreshingOutreach ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Refresh Tasks
              </Button>
            </div>

            {outreachLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-48" />
                ))}
              </div>
            ) : outreachTasks.length === 0 ? (
              <div className="text-center py-24">
                <CheckCircle className="h-16 w-16 mx-auto mb-4 text-primary" />
                <p className="text-2xl font-semibold mb-4">All caught up! 🎉</p>
                <p className="text-muted-foreground mb-6">
                  No outreach tasks for today. Check back tomorrow or refresh to rebuild.
                </p>
                <Button onClick={handleRefreshOutreach}>Refresh Tasks</Button>
              </div>
            ) : (
              <TooltipProvider>
                <div className="space-y-4">
                  {outreachTasks.map((task) => (
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
                        <div className="bg-muted/50 rounded-lg p-4">
                          <p className="text-sm leading-relaxed line-clamp-2">{getReasonText(task)}</p>
                          {task.reason_code === 'news' && task.customer?.url && (
                            <button
                              onClick={() => navigate('/customers?tab=news')}
                              className="text-xs text-primary hover:underline mt-2"
                            >
                              View sources →
                            </button>
                          )}
                          
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
                        </div>

                        {generatedMessages[task.id] && (
                          <div className="bg-primary/5 border border-primary/20 rounded-lg p-4">
                            <p className="text-sm font-medium mb-2">Suggested Message:</p>
                            <p className="text-sm whitespace-pre-wrap">{generatedMessages[task.id]}</p>
                          </div>
                        )}

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
                            onClick={() => navigate('/analyze', { state: { preloadUrl: task.customer.url, openEngagement: true } })}
                          >
                            View Insights
                          </Button>

                          <div className="ml-auto flex gap-2">
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
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </TooltipProvider>
            )}
          </TabsContent>

          {/* Tab C: Company News */}
          <TabsContent value="news" className="mt-0">
            <div className="flex flex-col sm:flex-row gap-4 items-center mb-6">
              <Select value={newsSortBy} onValueChange={setNewsSortBy}>
                <SelectTrigger className="w-full sm:w-[180px]">
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="oldest">Oldest</SelectItem>
                  <SelectItem value="company">Company A-Z</SelectItem>
                </SelectContent>
              </Select>
              
              <Button
                onClick={handleRefreshAllSummaries}
                disabled={summariesLoading}
                variant="outline"
                className="ml-auto"
              >
                {summariesLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Refresh All
              </Button>
            </div>

            {summariesLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-48" />
                ))}
              </div>
            ) : newsSummaries.length === 0 ? (
              <div className="text-center py-24">
                <Newspaper className="h-16 w-16 mx-auto mb-4 text-muted-foreground" />
                <p className="text-xl font-semibold mb-2">No company news found</p>
                <p className="text-muted-foreground">
                  No recent news detected for these companies in the past 30 days.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {newsSummaries.map((summary) => {
                  const customer = items.find(i => i.url_key === summary.url_key);
                  const hasNews = summary.article_count > 0;
                  
                  return (
                    <Card key={summary.url_key} className="overflow-hidden">
                      <CardHeader className="border-b bg-card">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h3 className="text-xl font-semibold">{summary.company_name}</h3>
                              <Badge variant="secondary" className="text-xs">
                                Last updated • {formatDistanceToNow(new Date(summary.generated_at), { addSuffix: true })}
                              </Badge>
                              {!hasNews && (
                                <Badge variant="outline" className="text-xs">
                                  No recent news
                                </Badge>
                              )}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRefreshSummary(summary.url_key)}
                              disabled={refreshingSummary === summary.url_key}
                            >
                              {refreshingSummary === summary.url_key ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                            </Button>
                            {customer && (
                              <Button
                                size="sm"
                                variant="ghost"
                                asChild
                              >
                                <a href={customer.url} target="_blank" rel="noopener noreferrer">
                                  <ExternalLink className="h-4 w-4" />
                                </a>
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      
                      {hasNews && (
                        <CardContent className="pt-6">
                          <div className="space-y-4">
                            <div>
                              <p className="text-sm leading-relaxed">{summary.summary}</p>
                            </div>
                            
                            {summary.why_it_matters && (
                              <div className="mt-4 p-3 bg-primary/5 border border-primary/20 rounded-lg">
                                <p className="text-xs font-semibold text-primary mb-1">Why this matters to you</p>
                                <p className="text-sm text-foreground">{summary.why_it_matters}</p>
                              </div>
                            )}
                            
                            {summary.groups && summary.groups.length > 0 && (
                              <Collapsible>
                                <CollapsibleTrigger className="flex items-center gap-2 text-sm font-medium hover:underline">
                                  <ChevronDown className="h-4 w-4" />
                                  View themes ({summary.groups.length})
                                </CollapsibleTrigger>
                                <CollapsibleContent className="mt-4 space-y-4">
                                  {summary.groups.map((group: any, idx: number) => (
                                    <div key={idx} className="border-l-2 border-primary pl-4">
                                      <h4 className="font-medium text-sm mb-1">{group.label}</h4>
                                      <p className="text-sm text-muted-foreground mb-2">{group.blurb}</p>
                                      {group.why_it_matters && (
                                        <p className="text-xs text-muted-foreground/80 italic mb-2">
                                          Why it matters: {group.why_it_matters}
                                        </p>
                                      )}
                                      <div className="text-xs text-muted-foreground">
                                        Sources:{' '}
                                        {group.items.slice(0, 3).map((item: any, i: number) => (
                                          <span key={i}>
                                            <a
                                              href={item.link}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="hover:underline"
                                            >
                                              {item.publisher}
                                            </a>
                                            {i < Math.min(group.items.length - 1, 2) && ', '}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </CollapsibleContent>
                              </Collapsible>
                            )}
                            
                            {summary.sources && summary.sources.length > 0 && (
                              <div className="text-xs text-muted-foreground pt-2 border-t">
                                <span className="font-medium">Coverage:</span> {summary.article_count} articles from {summary.sources.join(', ')}
                              </div>
                            )}
                          </div>
                        </CardContent>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <AlertDialog open={!!itemToRemove} onOpenChange={() => setItemToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Customer</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove "{itemToRemove?.name}" from your customers? 
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleRemove}>Remove</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
