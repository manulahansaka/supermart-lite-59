import { useEffect, useState } from "react";
import { syncService } from "@/lib/syncService";
import { SyncLog } from "@/lib/db";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Trash2, RefreshCw, ArrowUp, ArrowDown, Radio } from "lucide-react";
import { format } from "date-fns";

export const SyncLogs = () => {
  const [logs, setLogs] = useState<SyncLog[]>([]);
  const [loading, setLoading] = useState(true);

  const loadLogs = async () => {
    setLoading(true);
    const syncLogs = await syncService.getSyncLogs(100);
    setLogs(syncLogs);
    setLoading(false);
  };

  useEffect(() => {
    loadLogs();
    const interval = setInterval(loadLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  const clearLogs = async () => {
    await syncService.clearSyncLogs();
    setLogs([]);
  };

  const getActionIcon = (action: string) => {
    switch (action) {
      case 'push':
        return <ArrowUp className="h-3 w-3 text-blue-500" />;
      case 'pull':
        return <ArrowDown className="h-3 w-3 text-green-500" />;
      case 'realtime':
        return <Radio className="h-3 w-3 text-purple-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Sync Activity Log</h4>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={loadLogs} disabled={loading}>
            <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="ghost" size="sm" onClick={clearLogs}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>

      <ScrollArea className="h-[200px] rounded-md border">
        {logs.length === 0 ? (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No sync activity yet
          </div>
        ) : (
          <div className="p-2 space-y-1">
            {logs.map((log) => (
              <div
                key={log.id}
                className={`flex items-center gap-2 text-xs p-2 rounded ${
                  log.status === 'error' ? 'bg-destructive/10' : 'bg-muted/50'
                }`}
              >
                {getActionIcon(log.action)}
                <span className="font-mono text-muted-foreground">
                  {format(new Date(log.timestamp), 'HH:mm:ss')}
                </span>
                <span className="font-medium capitalize">{log.table}</span>
                {log.recordCount > 0 && (
                  <span className="text-muted-foreground">({log.recordCount})</span>
                )}
                {log.message && (
                  <span className="text-muted-foreground truncate flex-1">
                    {log.message}
                  </span>
                )}
                <span className={`ml-auto ${log.status === 'success' ? 'text-green-500' : 'text-destructive'}`}>
                  {log.status === 'success' ? '✓' : '✗'}
                </span>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  );
};
