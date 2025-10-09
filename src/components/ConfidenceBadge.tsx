import { Badge } from "@/components/ui/badge";

export type ConfidenceLevel = "high" | "medium" | "low";

interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
}

export const ConfidenceBadge = ({ level }: ConfidenceBadgeProps) => {
  const variants: Record<ConfidenceLevel, { variant: "default" | "secondary" | "destructive" | "outline", className: string }> = {
    high: { variant: "default", className: "bg-success text-success-foreground hover:bg-success/90" },
    medium: { variant: "default", className: "bg-warning text-warning-foreground hover:bg-warning/90" },
    low: { variant: "secondary", className: "bg-muted text-muted-foreground hover:bg-muted/90" }
  };

  const config = variants[level];

  return (
    <Badge variant={config.variant} className={`text-xs capitalize ${config.className}`}>
      {level}
    </Badge>
  );
};
