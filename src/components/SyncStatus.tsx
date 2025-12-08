import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Cloud, CloudOff, RefreshCw, Check, AlertCircle, Radio, Settings2, RotateCcw } from "lucide-react";
import { syncService, SyncStatus as SyncStatusType, SyncProgress } from "@/lib/syncService";
import { useToast } from "@/hooks/use-toast";
import { SyncProgressBar } from "./SyncProgressBar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { SyncLogs } from "./SyncLogs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

export const SyncStatus = () => {
  const { toast } = useToast();
  const [status, setStatus] = useState<SyncStatusType>({
    isOnline: navigator.onLine,
    isSyncing: false,
    lastSyncTime: null,
    pendingChanges: 0,
    error: null,
    realtimeEnabled: true
  });
  const [progress, setProgress] = useState<SyncProgress>({
    isActive: false,
    phase: 'idle',
    currentTable: '',
    currentBatch: 0,
    totalBatches: 0,
    processedRecords: 0,
    totalRecords: 0,
    percentage: 0,
    message: ''
  });
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    const handleStatusChange = (newStatus: SyncStatusType) => {
      setStatus(newStatus);
    };

    const handleProgressChange = (newProgress: SyncProgress) => {
      setProgress(newProgress);
    };

    syncService.subscribe(handleStatusChange);
    syncService.subscribeProgress(handleProgressChange);

    const lastSyncStr = localStorage.getItem('last_sync_time');
    if (lastSyncStr) {
      setStatus(prev => ({ ...prev, lastSyncTime: new Date(lastSyncStr) }));
    }

    return () => {
      syncService.unsubscribe(handleStatusChange);
      syncService.unsubscribeProgress(handleProgressChange);
    };
  }, []);

  const handleSync = async () => {
    const result = await syncService.sync();
    
    if (result.success) {
      setRetryCount(0);
      toast({
        title: "Sync Complete",
        description: "All data has been synchronized with the cloud.",
      });
    } else {
      setRetryCount(prev => prev + 1);
      toast({
        title: "Sync Failed",
        description: result.error || "Failed to sync data. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleRetry = async () => {
    await handleSync();
  };

  const clearError = () => {
    setRetryCount(0);
    syncService.clearError();
  };

  const handleRealtimeToggle = (enabled: boolean) => {
    syncService.setRealtimeEnabled(enabled);
    toast({
      title: enabled ? "Real-time Sync Enabled" : "Real-time Sync Disabled",
      description: enabled 
        ? "Changes will sync instantly when online." 
        : "Changes will sync during manual or scheduled sync.",
    });
  };

  const formatLastSync = () => {
    if (!status.lastSyncTime) return "Never synced";
    
    const now = new Date();
    const diff = now.getTime() - new Date(status.lastSyncTime).getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    
    return new Date(status.lastSyncTime).toLocaleDateString();
  };

  const getStatusIcon = () => {
    if (!status.isOnline) {
      return <CloudOff className="h-4 w-4 text-destructive" />;
    }
    
    if (status.isSyncing) {
      return <RefreshCw className="h-4 w-4 text-warning animate-spin" />;
    }
    
    if (status.error) {
      return <AlertCircle className="h-4 w-4 text-destructive" />;
    }
    
    if (status.realtimeEnabled) {
      return <Radio className="h-4 w-4 text-green-500" />;
    }
    
    return <Cloud className="h-4 w-4 text-green-500" />;
  };

  const getStatusText = () => {
    if (!status.isOnline) return "Offline";
    if (status.isSyncing) return "Syncing...";
    if (status.error) return "Sync Error";
    if (status.realtimeEnabled) return "Live";
    return "Online";
  };

  const getPendingBadge = () => {
    if (status.pendingChanges > 0) {
      return (
        <Badge 
          variant="secondary" 
          className="h-5 min-w-5 px-1.5 text-xs bg-warning/20 text-warning border-warning/30"
        >
          {status.pendingChanges}
        </Badge>
      );
    }
    return null;
  };

  const getTooltipText = () => {
    const pendingText = status.pendingChanges > 0 
      ? `${status.pendingChanges} pending change${status.pendingChanges > 1 ? 's' : ''}. ` 
      : "";
    
    if (!status.isOnline) {
      return `${pendingText}Device is offline. Changes will be synced when online.`;
    }
    
    if (status.isSyncing) {
      return `${pendingText}Syncing data with cloud...`;
    }
    
    if (status.error) {
      return `${pendingText}Sync error: ${status.error}`;
    }
    
    const realtimeText = status.realtimeEnabled ? "Real-time sync active. " : "";
    return `${pendingText}${realtimeText}Last synced: ${formatLastSync()}`;
  };

  return (
    <div className="flex items-center gap-2">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 text-sm">
              {getStatusIcon()}
              <span className="hidden md:inline text-muted-foreground">
                {getStatusText()}
              </span>
              {getPendingBadge()}
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{getTooltipText()}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      {status.error && status.isOnline ? (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleRetry}
                disabled={status.isSyncing}
                className="h-8 gap-1.5 px-2"
              >
                <RotateCcw className={`h-3.5 w-3.5 ${status.isSyncing ? 'animate-spin' : ''}`} />
                <span className="text-xs">Retry{retryCount > 0 ? ` (${retryCount})` : ''}</span>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs">
              <p className="text-xs">Click to retry sync. Error: {status.error}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={handleSync}
          disabled={!status.isOnline || status.isSyncing}
          className="h-8 w-8 p-0"
        >
          <RefreshCw className={`h-4 w-4 ${status.isSyncing ? 'animate-spin' : ''}`} />
        </Button>
      )}

      <Popover>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <Settings2 className="h-4 w-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80" align="end">
          <div className="space-y-4">
            <div className="space-y-2">
              <h4 className="font-medium leading-none">Sync Settings</h4>
              <p className="text-sm text-muted-foreground">
                Configure how data syncs with the cloud.
              </p>
            </div>

            {/* Show progress bar when syncing */}
            {progress.isActive && (
              <>
                <SyncProgressBar progress={progress} />
                <Separator />
              </>
            )}
            
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="realtime-sync">Real-time Sync</Label>
                <p className="text-xs text-muted-foreground">
                  Instantly sync changes when online
                </p>
              </div>
              <Switch
                id="realtime-sync"
                checked={status.realtimeEnabled}
                onCheckedChange={handleRealtimeToggle}
              />
            </div>

            <div className="text-xs text-muted-foreground space-y-1">
              <p>Last sync: {formatLastSync()}</p>
              <p>Device: {localStorage.getItem('pos_device_id')?.slice(-8)}</p>
              {status.pendingChanges > 0 && (
                <p className="text-warning">
                  {status.pendingChanges} pending change{status.pendingChanges > 1 ? 's' : ''} to sync
                </p>
              )}
            </div>

            {status.error && (
              <>
                <Separator />
                <Alert variant="destructive" className="py-2">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    <p className="font-medium">Sync Error</p>
                    <p className="mt-1 break-words">{status.error}</p>
                    {retryCount > 0 && (
                      <p className="mt-1 text-muted-foreground">
                        Retry attempts: {retryCount}
                      </p>
                    )}
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="mt-2 h-7 text-xs"
                      onClick={handleRetry}
                      disabled={status.isSyncing}
                    >
                      <RotateCcw className={`h-3 w-3 mr-1 ${status.isSyncing ? 'animate-spin' : ''}`} />
                      Retry Now
                    </Button>
                  </AlertDescription>
                </Alert>
              </>
            )}

            <Separator />

            <SyncLogs />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
};
