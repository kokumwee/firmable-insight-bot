import { useState, useEffect } from "react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Grid, List, ExternalLink, Trash2, Copy, Sparkles, RefreshCw, Eye, Mail } from "lucide-react";
import { ConfidenceBadge, ConfidenceLevel } from "@/components/ConfidenceBadge";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigate } from "react-router-dom";
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

interface ShortlistItem {
  id: string;
  url: string;
  name: string;
  industry: { value: string; confidence: ConfidenceLevel } | null;
  company_size: { value: string; confidence: ConfidenceLevel } | null;
  hq_location: { value: string; confidence: ConfidenceLevel } | null;
  usp: { value: string } | null;
  offerings_bulleted: any[] | null;
  target_audience_list: string[] | null;
  contacts: any | null;
  tone_summary: string | null;
  keywords_top: Array<{ term: string; weight: number }> | null;
  avg_confidence: string;
  icp_fit: string | null;
  tags: string[] | null;
  notes: string | null;
  analyzed_at: string;
  created_at: string;
}

export default function Shortlist() {
  const [items, setItems] = useState<ShortlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [sortBy, setSortBy] = useState("created_at_desc");
  const [selectedItem, setSelectedItem] = useState<ShortlistItem | null>(null);
  const [editingTags, setEditingTags] = useState<string>("");
  const [editingNotes, setEditingNotes] = useState<string>("");
  const [reanalyzingUrl, setReanalyzingUrl] = useState<string | null>(null);
  const [itemToRemove, setItemToRemove] = useState<ShortlistItem | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadItems();
  }, [sortBy]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('shortlist', {
        body: { 
          action: 'list',
          sort: sortBy
        }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error?.message);

      setItems(data.data || []);
    } catch (error) {
      console.error('Error loading shortlist:', error);
      toast({
        title: "Error",
        description: "Failed to load shortlist",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = async () => {
    if (!itemToRemove) return;
    
    try {
      const { data, error } = await supabase.functions.invoke('shortlist', {
        body: { action: 'remove', url: itemToRemove.url }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error?.message);

      toast({
        title: "Removed",
        description: "Company removed from shortlist",
      });
      setItems(items.filter(item => item.url !== itemToRemove.url));
      setItemToRemove(null);
    } catch (error) {
      console.error('Error removing item:', error);
      toast({
        title: "Error",
        description: "Failed to remove company",
        variant: "destructive",
      });
    }
  };

  const handleReanalyze = async (url: string) => {
    setReanalyzingUrl(url);
    try {
      const { data, error } = await supabase.functions.invoke('shortlist', {
        body: { action: 'reanalyze', url }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error?.message);

      toast({
        title: "Re-analyzed successfully",
        description: "Company data has been updated",
      });
      
      // Update the specific item in the list
      setItems(items.map(item => 
        item.url === url 
          ? { ...item, analyzed_at: data.data.analyzed_at, avg_confidence: data.data.avg_confidence }
          : item
      ));
    } catch (error) {
      console.error('Error re-analyzing:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Couldn't re-analyze this site",
        variant: "destructive",
      });
    } finally {
      setReanalyzingUrl(null);
    }
  };

  const handleViewInsights = (url: string) => {
    navigate('/', { state: { preloadUrl: url } });
  };

  const handleGenerateOutreach = (url: string) => {
    navigate('/', { state: { preloadUrl: url, openEngagement: true } });
  };

  const handleCopySummary = (item: ShortlistItem) => {
    const summary = `${item.name} — ${item.url}
Industry: ${item.industry?.value || "N/A"} | Size: ${item.company_size?.value || "N/A"} | HQ: ${item.hq_location?.value || "N/A"}
USP: ${item.usp?.value || "N/A"}
Offerings: ${(item.offerings_bulleted || []).slice(0, 5).map((o: any) => o.bullet).join(", ") || "N/A"}
Audience: ${(item.target_audience_list || []).slice(0, 5).join(", ") || "N/A"}
Tone: ${item.tone_summary || "N/A"} | Keywords: ${(item.keywords_top || []).slice(0, 3).map(k => k.term).join(", ") || "N/A"}
Analyzed: ${formatDate(item.analyzed_at)}`;

    navigator.clipboard.writeText(summary);
    toast({
      title: "Copied!",
      description: "Summary copied to clipboard",
    });
  };

  const handleUpdateMeta = async (url: string) => {
    try {
      const tags = editingTags.split(',').map(t => t.trim()).filter(Boolean);
      const { data, error } = await supabase.functions.invoke('shortlist', {
        body: { 
          action: 'update_meta',
          url,
          tags,
          notes: editingNotes
        }
      });

      if (error) throw error;
      if (!data.ok) throw new Error(data.error?.message);

      toast({
        title: "Updated",
        description: "Notes and tags saved",
      });
      loadItems();
    } catch (error) {
      console.error('Error updating meta:', error);
      toast({
        title: "Error",
        description: "Failed to update",
        variant: "destructive",
      });
    }
  };


  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    
    if (diffDays > 7) return `${Math.floor(diffDays / 7)}w ago`;
    if (diffDays > 0) return `${diffDays}d ago`;
    if (diffHours > 0) return `${diffHours}h ago`;
    return "Just now";
  };

  const truncateText = (text: string | undefined, maxLength: number) => {
    if (!text) return "—";
    return text.length > maxLength ? text.slice(0, maxLength) + "..." : text;
  };

  const formatOfferings = (offerings: any[] | null) => {
    if (!offerings || offerings.length === 0) return "—";
    return offerings.slice(0, 3).map((o: any) => o.bullet).join(" • ");
  };

  const formatAudience = (audience: string[] | null) => {
    if (!audience || audience.length === 0) return "—";
    return audience.slice(0, 3).join(" • ");
  };

  const formatKeywords = (keywords: Array<{ term: string; weight: number }> | null) => {
    if (!keywords || keywords.length === 0) return "—";
    return keywords.slice(0, 3).map(k => k.term).join(", ");
  };

  const getDomain = (url: string) => {
    try {
      return new URL(url).hostname.replace('www.', '');
    } catch {
      return url;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-8">
        <div className="max-w-7xl mx-auto space-y-6">
          <Skeleton className="h-12 w-64" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <Skeleton key={i} className="h-64" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="max-w-7xl mx-auto p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-3xl font-bold">My Shortlist</h1>
              <p className="text-muted-foreground">Saved companies and insights</p>
            </div>
            <Button variant="outline" onClick={() => window.location.href = "/"}>
              Back to Analyze
            </Button>
          </div>

          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row gap-4 items-center">
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at_desc">Newest First</SelectItem>
                <SelectItem value="name_asc">Name A-Z</SelectItem>
                <SelectItem value="confidence_desc">Confidence</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex gap-2 ml-auto">
              <Button
                variant={viewMode === "cards" ? "default" : "outline"}
                size="icon"
                onClick={() => setViewMode("cards")}
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "table" ? "default" : "outline"}
                size="icon"
                onClick={() => setViewMode("table")}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto p-6">
        {items.length === 0 ? (
          <div className="text-center py-24">
            <p className="text-2xl font-semibold text-muted-foreground mb-4">
              Your shortlist is empty.
            </p>
            <p className="text-muted-foreground mb-6">
              Analyze a company and click Add to My Shortlist to save it here.
            </p>
            <Button onClick={() => navigate('/')}>
              Go to Company Insights
            </Button>
          </div>
        ) : viewMode === "cards" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map((item) => (
              <Sheet key={item.id}>
                <SheetTrigger asChild>
                  <Card 
                    className="cursor-pointer hover:shadow-lg transition-all"
                    onClick={() => {
                      setSelectedItem(item);
                      setEditingTags(item.tags?.join(', ') || '');
                      setEditingNotes(item.notes || '');
                    }}
                  >
                    <CardHeader className="space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-lg line-clamp-1">{item.name}</h3>
                          <p className="text-sm text-muted-foreground line-clamp-1">{item.url}</p>
                        </div>
                        <ConfidenceBadge level={item.avg_confidence as ConfidenceLevel} />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Analyzed: {formatDate(item.analyzed_at)}
                      </p>
                    </CardHeader>

                    <CardContent className="space-y-3">
                      <div className="flex flex-wrap gap-2 text-sm">
                        {item.industry && (
                          <Badge variant="secondary">{item.industry.value}</Badge>
                        )}
                        {item.company_size && (
                          <Badge variant="secondary">{item.company_size.value}</Badge>
                        )}
                        {item.hq_location && (
                          <Badge variant="secondary">{item.hq_location.value}</Badge>
                        )}
                      </div>

                      {item.usp && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {item.usp.value}
                        </p>
                      )}

                      {item.tone_summary && (
                        <div className="flex items-center gap-2 text-sm">
                          <Sparkles className="h-3 w-3 text-primary" />
                          <span className="text-muted-foreground">{item.tone_summary}</span>
                        </div>
                      )}

                      {item.keywords_top && item.keywords_top.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {item.keywords_top.slice(0, 3).map((kw, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {kw.term}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </CardContent>

                    <CardFooter className="flex flex-wrap gap-2 pt-4 border-t">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleReanalyze(item.url);
                              }}
                              disabled={reanalyzingUrl === item.url}
                            >
                              {reanalyzingUrl === item.url ? (
                                <RefreshCw className="h-4 w-4 animate-spin" />
                              ) : (
                                <RefreshCw className="h-4 w-4" />
                              )}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Re-Analyze</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleViewInsights(item.url);
                              }}
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
                              onClick={(e) => {
                                e.stopPropagation();
                                handleGenerateOutreach(item.url);
                              }}
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
                              onClick={(e) => {
                                e.stopPropagation();
                                handleCopySummary(item);
                              }}
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
                              onClick={(e) => {
                                e.stopPropagation();
                                setItemToRemove(item);
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Remove</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </CardFooter>
                  </Card>
                </SheetTrigger>

                <SheetContent className="overflow-y-auto w-full sm:max-w-xl">
                  {selectedItem && selectedItem.id === item.id && (
                    <>
                      <SheetHeader>
                        <SheetTitle>{selectedItem.name}</SheetTitle>
                      </SheetHeader>
                      
                      <div className="space-y-6 mt-6">
                        <div>
                          <a
                            href={selectedItem.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-primary hover:underline flex items-center gap-1"
                          >
                            {selectedItem.url}
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>

                        {selectedItem.usp && (
                          <div>
                            <h4 className="font-semibold mb-2">Value Proposition</h4>
                            <p className="text-sm text-muted-foreground">{selectedItem.usp.value}</p>
                          </div>
                        )}

                        {selectedItem.offerings_bulleted && selectedItem.offerings_bulleted.length > 0 && (
                          <div>
                            <h4 className="font-semibold mb-2">Offerings</h4>
                            <ul className="space-y-1">
                              {selectedItem.offerings_bulleted.slice(0, 5).map((off: any, idx: number) => (
                                <li key={idx} className="text-sm">• {off.bullet}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {selectedItem.target_audience_list && selectedItem.target_audience_list.length > 0 && (
                          <div>
                            <h4 className="font-semibold mb-2">Target Audience</h4>
                            <ul className="space-y-1">
                              {selectedItem.target_audience_list.map((aud, idx) => (
                                <li key={idx} className="text-sm">• {aud}</li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {selectedItem.contacts?.emails && selectedItem.contacts.emails.length > 0 && (
                          <div>
                            <h4 className="font-semibold mb-2">Contacts</h4>
                            {selectedItem.contacts.emails.map((email: string, idx: number) => (
                              <div key={idx} className="flex items-center gap-2">
                                <span className="text-sm">{email}</span>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    navigator.clipboard.writeText(email);
                                    toast({ title: "Copied!", description: "Email copied to clipboard" });
                                  }}
                                >
                                  <Copy className="h-3 w-3" />
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}

                        <div>
                          <h4 className="font-semibold mb-2">Tags</h4>
                          <Input
                            placeholder="Add tags (comma separated)"
                            value={editingTags}
                            onChange={(e) => setEditingTags(e.target.value)}
                          />
                        </div>

                        <div>
                          <h4 className="font-semibold mb-2">Notes</h4>
                          <Textarea
                            placeholder="Add your notes..."
                            value={editingNotes}
                            onChange={(e) => setEditingNotes(e.target.value)}
                            rows={4}
                          />
                        </div>

                        <Button
                          onClick={() => handleUpdateMeta(selectedItem.url)}
                          className="w-full"
                        >
                          Save Changes
                        </Button>
                      </div>
                    </>
                  )}
                </SheetContent>
              </Sheet>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border bg-card overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[200px]">Company</TableHead>
                  <TableHead>Industry</TableHead>
                  <TableHead>Size</TableHead>
                  <TableHead>HQ</TableHead>
                  <TableHead className="w-[200px]">USP</TableHead>
                  <TableHead className="w-[180px]">Offerings</TableHead>
                  <TableHead className="w-[180px]">Audience</TableHead>
                  <TableHead>Tone</TableHead>
                  <TableHead className="w-[150px]">Keywords</TableHead>
                  <TableHead>Confidence</TableHead>
                  <TableHead>Analyzed</TableHead>
                  <TableHead className="w-[200px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <div className="space-y-1">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium hover:underline flex items-center gap-2"
                        >
                          <img 
                            src={`https://www.google.com/s2/favicons?domain=${getDomain(item.url)}&sz=32`} 
                            alt="" 
                            className="w-4 h-4"
                          />
                          {item.name}
                        </a>
                        <p className="text-xs text-muted-foreground">{getDomain(item.url)}</p>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">{item.industry?.value || "—"}</TableCell>
                    <TableCell className="text-sm">{item.company_size?.value || "—"}</TableCell>
                    <TableCell className="text-sm">{item.hq_location?.value || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {truncateText(item.usp?.value, 120)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatOfferings(item.offerings_bulleted)}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatAudience(item.target_audience_list)}
                    </TableCell>
                    <TableCell className="text-sm">{item.tone_summary || "—"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatKeywords(item.keywords_top)}
                    </TableCell>
                    <TableCell>
                      <ConfidenceBadge level={item.avg_confidence as ConfidenceLevel} />
                    </TableCell>
                    <TableCell>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-sm cursor-help">{formatRelativeTime(item.analyzed_at)}</span>
                        </TooltipTrigger>
                        <TooltipContent>{formatDate(item.analyzed_at)}</TooltipContent>
                      </Tooltip>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleReanalyze(item.url)}
                                disabled={reanalyzingUrl === item.url}
                              >
                                {reanalyzingUrl === item.url ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-4 w-4" />
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Re-Analyze</TooltipContent>
                          </Tooltip>

                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleViewInsights(item.url)}
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
                                size="icon"
                                onClick={() => handleGenerateOutreach(item.url)}
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
                                size="icon"
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
                                size="icon"
                                onClick={() => setItemToRemove(item)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Remove</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* Remove confirmation dialog */}
      <AlertDialog open={!!itemToRemove} onOpenChange={() => setItemToRemove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from shortlist?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove {itemToRemove?.name} from My Shortlist? This action cannot be undone.
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
