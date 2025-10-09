import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CheckCircle2, AlertCircle, XCircle, HelpCircle } from "lucide-react";

interface FitBadgeProps {
  score: number;
  status: string;
  rationale: string;
  subscores?: Record<string, number>;
}

export const FitBadge = ({ score, status, rationale, subscores }: FitBadgeProps) => {
  const getStatusColor = () => {
    switch (status) {
      case "Good":
        return "bg-green-100 text-green-800 hover:bg-green-200 border-green-300";
      case "Okay":
        return "bg-amber-100 text-amber-800 hover:bg-amber-200 border-amber-300";
      case "Poor":
        return "bg-red-100 text-red-800 hover:bg-red-200 border-red-300";
      default:
        return "bg-gray-100 text-gray-800 hover:bg-gray-200 border-gray-300";
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case "Good":
        return <CheckCircle2 className="h-4 w-4" />;
      case "Okay":
        return <AlertCircle className="h-4 w-4" />;
      case "Poor":
        return <XCircle className="h-4 w-4" />;
      default:
        return <HelpCircle className="h-4 w-4" />;
    }
  };

  const getScoreIcon = (subscore: number) => {
    if (subscore >= 0.9) return "✅";
    if (subscore >= 0.4) return "⚠️";
    return "❌";
  };

  return (
    <div className="flex items-center gap-2">
      <Badge className={`${getStatusColor()} border px-3 py-1`}>
        <span className="flex items-center gap-1.5">
          {getStatusIcon()}
          <span className="font-semibold">Fit: {status}</span>
        </span>
      </Badge>
      <span className="text-sm font-medium text-muted-foreground">
        {score}/100
      </span>
      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs">
            Why?
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80">
          <div className="space-y-3">
            <h4 className="font-semibold text-sm">Why this rating?</h4>
            <p className="text-sm text-muted-foreground">{rationale}</p>
            
            {subscores && (
              <div className="pt-2 border-t space-y-1">
                <p className="text-xs font-medium">Dimension Scores:</p>
                {Object.entries(subscores).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-2 text-sm">
                    <span className="text-base">{getScoreIcon(value)}</span>
                    <span className="capitalize">{key}</span>
                    <span className="text-muted-foreground ml-auto">
                      {Math.round(value * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
