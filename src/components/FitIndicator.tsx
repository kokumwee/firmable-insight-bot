import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface FitIndicatorProps {
  rating: number;
  explanation: string;
}

export const FitIndicator = ({ rating, explanation }: FitIndicatorProps) => {
  const getColorClass = (score: number): string => {
    if (score === 0) return "bg-muted";
    if (score <= 1) return "bg-red-500";
    if (score <= 2) return "bg-orange-500";
    if (score <= 3) return "bg-yellow-400";
    if (score <= 4) return "bg-lime-500";
    return "bg-green-500";
  };

  const getFitLabel = (score: number): string => {
    if (score === 0) return "Not set";
    if (score <= 1) return "Poor fit";
    if (score <= 2) return "Weak fit";
    if (score <= 3) return "Moderate fit";
    if (score <= 4) return "Good fit";
    return "Strong fit";
  };

  return (
    <Card className="max-w-2xl mx-auto mb-6">
      <CardHeader>
        <CardTitle className="text-lg">ICP Fit Rating</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          {/* Visual indicator with 5 circles */}
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className={`w-8 h-8 rounded-full transition-colors ${
                  i <= rating ? getColorClass(rating) : "bg-muted"
                }`}
              />
            ))}
          </div>

          {/* Numeric value */}
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold">{rating}</span>
            <span className="text-muted-foreground">/ 5</span>
            <span className="text-sm font-medium">— {getFitLabel(rating)}</span>
          </div>

          {/* Info tooltip */}
          {explanation && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button className="text-muted-foreground hover:text-foreground transition-colors">
                    <Info className="h-5 w-5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent className="max-w-sm">
                  <p className="text-sm">{explanation}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>

        {rating === 0 && (
          <p className="text-sm text-muted-foreground mt-2">
            No match or ICP not set.
          </p>
        )}
      </CardContent>
    </Card>
  );
};
