import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Copy, ExternalLink, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface UnverifiedSuggestionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: {
    field: string;
    suggestion: string;
    rationale: string;
    confidence: string;
    disclaimer: string;
  } | null;
  companyName?: string;
  domain?: string;
}

export const UnverifiedSuggestionModal = ({
  open,
  onOpenChange,
  data,
  companyName,
  domain,
}: UnverifiedSuggestionModalProps) => {
  const { toast } = useToast();

  if (!data) return null;

  const handleCopy = () => {
    const textToCopy = Array.isArray(data.suggestion) 
      ? data.suggestion.join('\n') 
      : data.suggestion;
    
    navigator.clipboard.writeText(textToCopy);
    toast({
      title: "Copied to clipboard",
      description: "Suggestion copied successfully",
    });
  };

  const handleSearchWeb = () => {
    const fieldName = data.field.replace(/_/g, ' ');
    let searchUrl;
    
    if (domain) {
      searchUrl = `https://www.google.com/search?q=site:${domain}+${encodeURIComponent(fieldName)}`;
    } else {
      const query = companyName ? `${companyName} ${fieldName}` : fieldName;
      searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
    }
    
    window.open(searchUrl, '_blank', 'noopener,noreferrer');
  };

  // Parse suggestion if it's a stringified array
  let suggestionDisplay;
  try {
    const parsed = typeof data.suggestion === 'string' ? JSON.parse(data.suggestion) : data.suggestion;
    if (Array.isArray(parsed)) {
      suggestionDisplay = parsed.slice(0, 5).map(item => {
        const truncated = item.length > 50 ? item.slice(0, 50) + '…' : item;
        return truncated;
      });
    } else {
      const text = String(parsed);
      suggestionDisplay = text.length > 100 ? text.slice(0, 100) + '…' : text;
    }
  } catch {
    const text = String(data.suggestion);
    suggestionDisplay = text.length > 100 ? text.slice(0, 100) + '…' : text;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="capitalize">{data.field.replace(/_/g, ' ')}</DialogTitle>
        </DialogHeader>

        {/* Red warning banner */}
        <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3 flex items-start gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="text-sm text-destructive font-medium">
            <strong>Unverified suggestion</strong> — Not found on analyzed pages; may be incorrect.
          </div>
        </div>

        {/* Suggestion */}
        <div className="space-y-2">
          <div className="font-semibold text-sm text-muted-foreground">Suggested value:</div>
          {Array.isArray(suggestionDisplay) ? (
            <ul className="list-disc list-inside space-y-1">
              {suggestionDisplay.map((item, idx) => (
                <li key={idx} className="font-bold">{item}</li>
              ))}
            </ul>
          ) : (
            <div className="font-bold">{suggestionDisplay}</div>
          )}
        </div>

        {/* Rationale */}
        <div className="space-y-1">
          <div className="font-semibold text-sm text-muted-foreground">Rationale:</div>
          <div className="text-sm text-muted-foreground italic">{data.rationale}</div>
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button variant="outline" size="sm" onClick={handleCopy} className="flex-1">
            <Copy className="h-4 w-4 mr-2" />
            Copy
          </Button>
          <Button variant="outline" size="sm" onClick={handleSearchWeb} className="flex-1">
            <ExternalLink className="h-4 w-4 mr-2" />
            Search the web
          </Button>
        </div>

        <Button variant="secondary" onClick={() => onOpenChange(false)} className="w-full">
          Close
        </Button>
      </DialogContent>
    </Dialog>
  );
};
