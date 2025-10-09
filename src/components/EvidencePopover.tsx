import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Evidence {
  snippet: string;
  source?: string; // Legacy field
  source_url?: string;
  page_type?: string;
  offset?: number;
}

interface EvidencePopoverProps {
  evidence: Evidence[];
}

export const EvidencePopover = ({ evidence }: EvidencePopoverProps) => {
  if (!evidence || evidence.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-2 text-muted-foreground hover:text-foreground">
          <Info className="h-3 w-3" />
          <span className="ml-1 text-xs">View Evidence</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96">
        <div className="space-y-3">
          <h4 className="font-semibold text-sm">Evidence</h4>
          {evidence.map((item, idx) => (
            <div key={idx} className={idx > 0 ? "pt-3 border-t border-border" : ""}>
              <p className="text-sm text-muted-foreground italic border-l-2 border-primary pl-3">
                "{item.snippet}"
              </p>
              {(item.source_url || item.page_type) && (
                <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground pl-3">
                  {item.source_url && (
                    <a
                      href={item.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-primary transition-colors flex items-center gap-1"
                    >
                      <span>Source: {new URL(item.source_url).pathname}</span>
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </a>
                  )}
                  {item.page_type && (
                    <>
                      <span>•</span>
                      <span className="capitalize">{item.page_type}</span>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};
