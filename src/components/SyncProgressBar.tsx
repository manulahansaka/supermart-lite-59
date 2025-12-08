import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, CheckCircle2, XCircle, Cloud } from "lucide-react";
import type { SyncProgress } from "@/lib/syncService";

interface SyncProgressBarProps {
  progress: SyncProgress;
  compact?: boolean;
}

export const SyncProgressBar = ({ progress, compact = false }: SyncProgressBarProps) => {
  if (!progress.isActive && progress.phase === 'idle') {
    return null;
  }

  const getIcon = () => {
    switch (progress.phase) {
      case 'pushing':
      case 'pulling':
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      case 'complete':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Cloud className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getPhaseLabel = () => {
    switch (progress.phase) {
      case 'pushing':
        return 'Uploading';
      case 'pulling':
        return 'Downloading';
      case 'complete':
        return 'Complete';
      case 'error':
        return 'Error';
      default:
        return 'Idle';
    }
  };

  if (compact) {
    return (
      <div className="flex items-center gap-2 text-sm">
        {getIcon()}
        <div className="flex-1 min-w-[100px]">
          <Progress value={progress.percentage} className="h-2" />
        </div>
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {progress.percentage}%
        </span>
      </div>
    );
  }

  return (
    <Card className="border-primary/20 bg-primary/5">
      <CardContent className="py-3 px-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {getIcon()}
              <span className="text-sm font-medium">
                {getPhaseLabel()} {progress.currentTable && `- ${progress.currentTable}`}
              </span>
            </div>
            <span className="text-sm text-muted-foreground">
              {progress.percentage}%
            </span>
          </div>
          
          <Progress value={progress.percentage} className="h-2" />
          
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {progress.processedRecords.toLocaleString()} / {progress.totalRecords.toLocaleString()} records
            </span>
            {progress.currentBatch > 0 && progress.totalBatches > 0 && (
              <span>Batch {progress.currentBatch}/{progress.totalBatches}</span>
            )}
          </div>
          
          {progress.message && (
            <p className="text-xs text-muted-foreground">{progress.message}</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
