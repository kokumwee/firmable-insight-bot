import { useState, useEffect } from "react";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Grid, List, ExternalLink, Trash2, Copy, Mail, Eye, CheckCircle, Info } from "lucide-react";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatDistanceToNow } from "date-fns";

interface CustomerItem {
  id: string;
  url: string | null;
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

export default function Customers() {
  const [items, setItems] = useState<CustomerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<"cards" | "table">("cards");
  const [sortBy, setSortBy] = useState("created_at_desc");
  const [itemToRemove, setItemToRemove] = useState<CustomerItem | null>(null);
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadItems();
  }, [sortBy]);

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
              onClick={() => item.url && navigate('/', { state: { preloadUrl: item.url } })}
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
              onClick={() => item.url && navigate('/', { state: { preloadUrl: item.url, openEngagement: true } })}
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
                        onClick={() => item.url && navigate('/', { state: { preloadUrl: item.url } })}
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
                        onClick={() => item.url && navigate('/', { state: { preloadUrl: item.url, openEngagement: true } })}
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
      <div className="container mx-auto px-4 py-12">
        <header className="mb-8">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-4xl font-bold">Existing Customers</h1>
              <p className="text-muted-foreground mt-2">
                Manage your customer relationships and engagement history
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => navigate('/outreach')}>
                Today's Outreach
              </Button>
              <Button variant="outline" onClick={() => navigate('/shortlist')}>
                Shortlist
              </Button>
              <Button variant="outline" onClick={() => navigate('/')}>
                Back to Analyze
              </Button>
            </div>
          </div>

          <Alert className="mb-6">
            <Info className="h-4 w-4" />
            <AlertDescription>
              Core company data here is read-only. To refresh, re-analyze the company and click 
              'Add / Update as Customer' from Company Insights or My Shortlist.
            </AlertDescription>
          </Alert>

          <div className="flex flex-wrap gap-4 items-center justify-between">
            <div className="flex gap-2">
              <Button
                variant={viewMode === "cards" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("cards")}
              >
                <Grid className="h-4 w-4 mr-2" />
                Cards
              </Button>
              <Button
                variant={viewMode === "table" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("table")}
              >
                <List className="h-4 w-4 mr-2" />
                Table
              </Button>
            </div>

            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_at_desc">Newest First</SelectItem>
                <SelectItem value="name_asc">Name (A-Z)</SelectItem>
                <SelectItem value="last_contacted_desc">Last Contacted</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </header>

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
            <Button onClick={() => navigate('/')}>
              Go to Company Insights
            </Button>
          </div>
        ) : viewMode === "cards" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {items.map(renderCard)}
          </div>
        ) : (
          renderTable()
        )}
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
