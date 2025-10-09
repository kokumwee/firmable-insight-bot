import { Loader2 } from "lucide-react";

const fullCrawlSteps = ["Discovering", "Crawling", "Extracting", "Summarising"];
const singlePageSteps = ["Fetching", "Parsing", "Extracting", "Summarising"];

interface LoadingStepsProps {
  progress?: {
    stage: string;
    current: number;
    total: number;
    fullCrawl: boolean;
  };
}

export const LoadingSteps = ({ progress }: LoadingStepsProps) => {
  const steps = progress?.fullCrawl ? fullCrawlSteps : singlePageSteps;
  
  return (
    <div className="flex flex-col items-center justify-center py-12 space-y-6 animate-fade-in">
      <Loader2 className="h-12 w-12 text-primary animate-spin" />
      <div className="flex flex-col items-center gap-4">
        <div className="flex items-center gap-2">
          {steps.map((step, idx) => (
            <div key={step} className="flex items-center">
              <span 
                className={`text-sm font-medium ${
                  progress?.stage === step.toLowerCase() 
                    ? 'text-primary' 
                    : 'text-muted-foreground'
                } animate-pulse`} 
                style={{ animationDelay: `${idx * 200}ms` }}
              >
                {step}
              </span>
              {idx < steps.length - 1 && (
                <span className="mx-2 text-muted-foreground">→</span>
              )}
            </div>
          ))}
        </div>
        {progress && (
          <div className="text-center space-y-2">
            <p className="text-sm text-muted-foreground">
              {progress.fullCrawl ? (
                <>
                  {progress.stage === 'crawling' && progress.total > 0 && `Crawling ${progress.current} of ~${progress.total} pages...`}
                  {progress.stage === 'discovering' && 'Discovering pages...'}
                  {progress.stage === 'extracting' && 'Extracting company data...'}
                  {progress.stage === 'summarising' && 'Building company card...'}
                </>
              ) : (
                <>
                  {progress.stage === 'fetching' && 'Fetching page content...'}
                  {progress.stage === 'parsing' && 'Parsing page data...'}
                  {progress.stage === 'extracting' && 'Extracting company data...'}
                  {progress.stage === 'summarising' && 'Building company card...'}
                </>
              )}
            </p>
            {progress.stage === 'crawling' && progress.total > 0 && (
              <div className="w-64 h-2 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${Math.min(100, (progress.current / progress.total) * 100)}%` }}
                />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
