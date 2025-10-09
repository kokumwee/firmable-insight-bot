import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface Evidence {
  snippet: string;
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
      <PopoverContent className="w-80">
        <div className="space-y-2">
          <h4 className="font-semibold text-sm">Evidence from Homepage</h4>
          <div className="space-y-2">
            {evidence.map((item, idx) => (
              <p key={idx} className="text-sm text-muted-foreground italic border-l-2 border-primary pl-3">
                "{item.snippet}"
              </p>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
};
