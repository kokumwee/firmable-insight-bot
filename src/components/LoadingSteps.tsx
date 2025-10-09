import { Loader2 } from "lucide-react";

const steps = ["Fetching", "Parsing", "Extracting", "Summarising"];

export const LoadingSteps = () => {
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-6 animate-fade-in">
      <Loader2 className="h-12 w-12 text-primary animate-spin" />
      <div className="flex items-center gap-2">
        {steps.map((step, idx) => (
          <div key={step} className="flex items-center">
            <span className="text-sm font-medium text-muted-foreground animate-pulse" style={{ animationDelay: `${idx * 200}ms` }}>
              {step}
            </span>
            {idx < steps.length - 1 && (
              <span className="mx-2 text-muted-foreground">→</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
