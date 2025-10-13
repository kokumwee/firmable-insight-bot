import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutGrid, Table as TableIcon, ArrowLeft, Plus, RefreshCw, ExternalLink, MessageSquare, Eye, Copy, Trash2, Check } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatDistanceToNow } from "date-fns";

type ViewMode = "cards" | "table";

export default function Customers() {
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [customers, setCustomers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [selectedCustomers, setSelectedCustomers] = useState<Set<string>>(new Set());
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", url: "", notes: "" });
  const { toast } = useToast();
  const navigate = useNavigate();

  useEffect(() => {
    loadCustomers();
  }, []);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('customers', {
        body: { action: 'list', sort: 'created_desc', limit: 100 }
      });

      if (error) throw error;
      setCustomers(data.data || []);
    } catch (error: any) {
      toast({
        title: "Error loading customers",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddCustomer = async () => {
    if (!newCustomer.name) {
      toast({ title: "Name required", variant: "destructive" });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('customers', {
        body: { action: 'add_manual', ...newCustomer }
      });

      if (error) throw error;
      toast({ title: "Customer added successfully" });
      setAddModalOpen(false);
      setNewCustomer({ name: "", url: "", notes: "" });
      loadCustomers();
    } catch (error: any) {
      toast({
        title: "Error adding customer",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleMarkContacted = async (id: string) => {
    setLoadingAction(id);
    try {
      const { error } = await supabase.functions.invoke('customers', {
        body: { action: 'mark_contacted', id }
      });

      if (error) throw error;
      toast({ title: "Marked as contacted" });
      loadCustomers();
    } catch (error: any) {
      toast({
        title: "Error updating customer",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRemove = async (id: string) => {
    if (!confirm("Remove this customer?")) return;
    
    setLoadingAction(id);
    try {
      const { error } = await supabase.functions.invoke('customers', {
        body: { action: 'remove', id }
      });

      if (error) throw error;
      toast({ title: "Customer removed" });
      loadCustomers();
    } catch (error: any) {
      toast({
        title: "Error removing customer",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCopySummary = (customer: any) => {
    const summary = `${customer.name}
Industry: ${customer.industry?.value || "—"}
Size: ${customer.company_size?.value || "—"}
HQ: ${customer.hq_location?.value || "—"}
USP: ${customer.usp?.value || "—"}
Offerings: ${(customer.offerings_bulleted || []).map((o: any) => o.bullet).join(", ")}
Target Audience: ${(customer.target_audience_list || []).join(", ")}`;

    navigator.clipboard.writeText(summary);
    toast({ title: "Summary copied to clipboard" });
  };

  const handleUpdateNotes = async (id: string, notes: string) => {
    try {
      await supabase.functions.invoke('customers', {
        body: { action: 'update', id, patch: { notes } }
      });
    } catch (error: any) {
      toast({
        title: "Error updating notes",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const truncate = (text: string | undefined, length: number) => {
    if (!text) return "—";
    return text.length > length ? text.slice(0, length) + "..." : text;
  };

  const getConfidenceBadge = (customer: any) => {
    const conf = customer.avg_confidence || "medium";
    const colors = {
      high: "bg-green-500/10 text-green-700 dark:text-green-400",
      medium: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
      low: "bg-red-500/10 text-red-700 dark:text-red-400"
    };
    return <Badge className={colors[conf as keyof typeof colors] || colors.medium}>{conf}</Badge>;
  };

  const renderCards = () => (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {customers.map((customer) => (
        <Card key={customer.id}>
          <CardHeader>
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <CardTitle className="text-lg flex items-center gap-2">
                  {customer.url && (
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${new URL(customer.url).hostname}&sz=32`}
                      alt=""
                      className="w-4 h-4"
                      onError={(e) => e.currentTarget.style.display = 'none'}
                    />
                  )}
                  {customer.name}
                </CardTitle>
                {customer.url && (
                  <CardDescription className="text-xs mt-1">
                    {new URL(customer.url).hostname}
                  </CardDescription>
                )}
              </div>
              {customer.recently_updated && (
                <Badge variant="secondary" className="ml-2">Updated</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-sm space-y-1">
              <div><strong>Industry:</strong> {customer.industry?.value || "—"}</div>
              <div><strong>Size:</strong> {customer.company_size?.value || "—"}</div>
              <div><strong>HQ:</strong> {customer.hq_location?.value || "—"}</div>
              <div><strong>USP:</strong> {truncate(customer.usp?.value, 80)}</div>
              {customer.last_contacted_at && (
                <div><strong>Last contacted:</strong> {formatDistanceToNow(new Date(customer.last_contacted_at), { addSuffix: true })}</div>
              )}
            </div>

            {customer.notes && (
              <Textarea
                value={customer.notes}
                onChange={(e) => {
                  const updated = customers.map(c =>
                    c.id === customer.id ? { ...c, notes: e.target.value } : c
                  );
                  setCustomers(updated);
                }}
                onBlur={(e) => handleUpdateNotes(customer.id, e.target.value)}
                className="text-sm"
                placeholder="Add notes..."
              />
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/?url=${encodeURIComponent(customer.url || '')}`)}
                      disabled={!customer.url}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>View Insights</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/?url=${encodeURIComponent(customer.url || '')}&tab=outreach`)}
                      disabled={!customer.url}
                    >
                      <MessageSquare className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Generate Outreach</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleMarkContacted(customer.id)}
                      disabled={loadingAction === customer.id}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Mark Contacted</TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleCopySummary(customer)}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Copy Summary</TooltipContent>
                </Tooltip>

                {customer.url && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => window.open(customer.url, '_blank')}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>Open Site</TooltipContent>
                  </Tooltip>
                )}

                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleRemove(customer.id)}
                      disabled={loadingAction === customer.id}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Remove</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );

  const renderTable = () => (
    <div className="border rounded-lg">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Company</TableHead>
            <TableHead>Industry</TableHead>
            <TableHead>Size</TableHead>
            <TableHead>HQ</TableHead>
            <TableHead>Last Contacted</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {customers.map((customer) => (
            <TableRow key={customer.id}>
              <TableCell>
                <div className="flex items-center gap-2">
                  {customer.url && (
                    <img
                      src={`https://www.google.com/s2/favicons?domain=${new URL(customer.url).hostname}&sz=32`}
                      alt=""
                      className="w-4 h-4"
                      onError={(e) => e.currentTarget.style.display = 'none'}
                    />
                  )}
                  <div>
                    <div className="font-medium">{customer.name}</div>
                    {customer.url && (
                      <div className="text-xs text-muted-foreground">
                        {new URL(customer.url).hostname}
                      </div>
                    )}
                  </div>
                  {customer.recently_updated && (
                    <Badge variant="secondary" className="ml-2">Updated</Badge>
                  )}
                </div>
              </TableCell>
              <TableCell>{customer.industry?.value || "—"}</TableCell>
              <TableCell>{customer.company_size?.value || "—"}</TableCell>
              <TableCell>{customer.hq_location?.value || "—"}</TableCell>
              <TableCell>
                {customer.last_contacted_at
                  ? formatDistanceToNow(new Date(customer.last_contacted_at), { addSuffix: true })
                  : "Never"}
              </TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => navigate(`/?url=${encodeURIComponent(customer.url || '')}`)}
                          disabled={!customer.url}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>View Insights</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleMarkContacted(customer.id)}
                          disabled={loadingAction === customer.id}
                        >
                          <Check className="w-4 h-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>Mark Contacted</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemove(customer.id)}
                          disabled={loadingAction === customer.id}
                        >
                          <Trash2 className="w-4 h-4" />
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
  );

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
              <h1 className="text-3xl font-bold">Existing Customers</h1>
              <p className="text-muted-foreground">Manage your customer relationships</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
              <TabsList>
                <TabsTrigger value="cards">
                  <LayoutGrid className="w-4 h-4 mr-2" />
                  Cards
                </TabsTrigger>
                <TabsTrigger value="table">
                  <TableIcon className="w-4 h-4 mr-2" />
                  Table
                </TabsTrigger>
              </TabsList>
            </Tabs>

            <Button onClick={loadCustomers} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>

            <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="w-4 h-4 mr-2" />
                  Add Customer
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Customer</DialogTitle>
                  <DialogDescription>
                    Add a new customer to track
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="name">Company Name *</Label>
                    <Input
                      id="name"
                      value={newCustomer.name}
                      onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
                      placeholder="Acme Corp"
                    />
                  </div>
                  <div>
                    <Label htmlFor="url">Website</Label>
                    <Input
                      id="url"
                      value={newCustomer.url}
                      onChange={(e) => setNewCustomer({ ...newCustomer, url: e.target.value })}
                      placeholder="https://example.com"
                    />
                  </div>
                  <div>
                    <Label htmlFor="notes">Notes</Label>
                    <Textarea
                      id="notes"
                      value={newCustomer.notes}
                      onChange={(e) => setNewCustomer({ ...newCustomer, notes: e.target.value })}
                      placeholder="Add any notes..."
                    />
                  </div>
                  <Button onClick={handleAddCustomer} className="w-full">
                    Add Customer
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {customers.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <p className="text-muted-foreground mb-4">No customers yet.</p>
              <Button onClick={() => navigate('/')}>
                Go to Company Insights
              </Button>
            </CardContent>
          </Card>
        ) : (
          viewMode === "cards" ? renderCards() : renderTable()
        )}
      </div>
    </div>
  );
}
