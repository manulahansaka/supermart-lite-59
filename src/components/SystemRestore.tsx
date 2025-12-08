import { useState } from 'react';
import { db } from '@/lib/db';
import { syncService } from '@/lib/syncService';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { RotateCcw, AlertTriangle, Loader2 } from 'lucide-react';
import { AdminPasswordDialog } from './AdminPasswordDialog';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface SystemRestoreProps {
  compact?: boolean;
}

export const SystemRestore = ({ compact = false }: SystemRestoreProps) => {
  const { toast } = useToast();
  const [showAdminDialog, setShowAdminDialog] = useState(false);
  const [restorePeriod, setRestorePeriod] = useState<string>('1-day');
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoreProgress, setRestoreProgress] = useState(0);
  const [restoreMessage, setRestoreMessage] = useState('');

  const handleRestore = async () => {
    try {
      setIsRestoring(true);
      setRestoreProgress(0);
      setRestoreMessage('Preparing restore...');

      const now = new Date();
      let cutoffDate = new Date();
      const isFullRestore = restorePeriod === 'all';

      switch (restorePeriod) {
        case '1-hour':
          cutoffDate.setHours(now.getHours() - 1);
          break;
        case '3-hours':
          cutoffDate.setHours(now.getHours() - 3);
          break;
        case '6-hours':
          cutoffDate.setHours(now.getHours() - 6);
          break;
        case '12-hours':
          cutoffDate.setHours(now.getHours() - 12);
          break;
        case '1-day':
          cutoffDate.setDate(now.getDate() - 1);
          break;
        case '3-days':
          cutoffDate.setDate(now.getDate() - 3);
          break;
        case '1-week':
          cutoffDate.setDate(now.getDate() - 7);
          break;
        case '1-month':
          cutoffDate.setMonth(now.getMonth() - 1);
          break;
        case 'all':
          cutoffDate = new Date(0);
          break;
      }

      if (isFullRestore) {
        // FULL RESTORE: Clear ALL local and cloud data
        setRestoreMessage('Clearing all local data...');
        setRestoreProgress(10);

        // Clear all local tables
        await db.transaction('rw', [db.sales, db.products, db.expenses, db.customers, db.cashiers, db.categories, db.suppliers, db.units, db.quickQuantities, db.syncLogs], async () => {
          await db.sales.clear();
          await db.expenses.clear();
          await db.products.clear();
          await db.customers.clear();
          // Keep super_admin cashier
          const superAdmin = await db.cashiers.where('role').equals('super_admin').first();
          await db.cashiers.clear();
          if (superAdmin) {
            await db.cashiers.add(superAdmin);
          }
          await db.categories.clear();
          await db.suppliers.clear();
          await db.units.clear();
          await db.quickQuantities.clear();
          await db.syncLogs.clear();
        });

        setRestoreMessage('Clearing all cloud data...');
        setRestoreProgress(50);

        // Clear all cloud data
        await syncService.clearAllCloudData();

        setRestoreProgress(90);
        setRestoreMessage('Finalizing...');

        // Clear sync-related localStorage
        localStorage.removeItem('last_sync_time');
        localStorage.removeItem('last_sync_timestamps');
        localStorage.removeItem('sync_checkpoint');

        setRestoreProgress(100);
        setRestoreMessage('Complete!');

        toast({
          title: 'Full System Reset Complete',
          description: 'All local and cloud data has been cleared. The system is ready for fresh data.',
        });
      } else {
        // PARTIAL RESTORE: Restore to specific time period
        setRestoreMessage('Finding transactions to restore...');
        setRestoreProgress(10);

        await db.transaction('rw', [db.sales, db.products, db.expenses], async () => {
          // Get sales to delete
          const salesToDelete = await db.sales
            .filter(sale => new Date(sale.timestamp) >= cutoffDate)
            .toArray();

          setRestoreMessage(`Restoring ${salesToDelete.length} sales...`);
          setRestoreProgress(30);

          // Restore product stock for deleted sales
          for (let i = 0; i < salesToDelete.length; i++) {
            const sale = salesToDelete[i];
            for (const item of sale.items) {
              const product = await db.products.get(item.productId);
              if (product) {
                const newStock = (product.stock || 0) + item.quantity;
                await db.products.update(item.productId, {
                  stock: newStock
                });
                await syncService.updateProductStockInCloud(product.barcode, newStock);
              }
            }
            setRestoreProgress(30 + Math.round((i / salesToDelete.length) * 30));
          }

          setRestoreMessage('Deleting sales...');
          setRestoreProgress(60);

          // Delete sales locally
          await db.sales
            .filter(sale => new Date(sale.timestamp) >= cutoffDate)
            .delete();

          setRestoreMessage('Deleting expenses...');
          setRestoreProgress(70);

          // Delete expenses locally
          await db.expenses
            .filter(expense => new Date(expense.date) >= cutoffDate)
            .delete();

          setRestoreMessage('Deleting products...');
          setRestoreProgress(80);

          // Delete products added after cutoff date
          await db.products
            .filter(product => {
              const createdAt = product.createdAt;
              if (!createdAt) return false;
              return new Date(createdAt) >= cutoffDate;
            })
            .delete();
        });

        setRestoreMessage('Syncing deletions to cloud...');
        setRestoreProgress(90);

        // Sync deletions to cloud
        await syncService.deleteSalesFromCloudByTimestamp(cutoffDate);
        await syncService.deleteExpensesFromCloudByDate(cutoffDate);
        await syncService.deleteProductsFromCloudByDate(cutoffDate);

        setRestoreProgress(100);
        setRestoreMessage('Complete!');

        toast({
          title: 'System Restored',
          description: `All transactions from ${restorePeriod.replace('-', ' ')} ago have been reversed`,
        });
      }

      setShowAdminDialog(false);
    } catch (error) {
      console.error('Restore error:', error);
      toast({
        title: 'Error',
        description: 'Failed to restore system. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsRestoring(false);
      setRestoreProgress(0);
      setRestoreMessage('');
    }
  };

  const restoreContent = (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Restore the system to a previous state by removing all transactions within a time period. 
        {restorePeriod === 'all' && (
          <span className="text-destructive font-medium"> Warning: "Everything" will permanently delete ALL local and cloud data!</span>
        )}
      </p>
      
      <div className="space-y-2">
        <Label>Restore Period</Label>
        <Select value={restorePeriod} onValueChange={setRestorePeriod}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1-hour">Last 1 Hour</SelectItem>
            <SelectItem value="3-hours">Last 3 Hours</SelectItem>
            <SelectItem value="6-hours">Last 6 Hours</SelectItem>
            <SelectItem value="12-hours">Last 12 Hours</SelectItem>
            <SelectItem value="1-day">Last 1 Day</SelectItem>
            <SelectItem value="3-days">Last 3 Days</SelectItem>
            <SelectItem value="1-week">Last 1 Week</SelectItem>
            <SelectItem value="1-month">Last 1 Month</SelectItem>
            <SelectItem value="all">Everything (Complete Reset)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isRestoring && (
        <div className="space-y-2">
          <Progress value={restoreProgress} className="h-2" />
          <p className="text-xs text-muted-foreground text-center">{restoreMessage}</p>
        </div>
      )}

      <Button 
        variant="destructive" 
        onClick={() => setShowAdminDialog(true)}
        className="w-full"
        disabled={isRestoring}
      >
        {isRestoring ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Restoring...
          </>
        ) : (
          <>
            <RotateCcw className="mr-2 h-4 w-4" />
            {restorePeriod === 'all' ? 'Complete System Reset' : 'Restore System'}
          </>
        )}
      </Button>
    </div>
  );

  if (compact) {
    return (
      <>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive">
              <RotateCcw className="mr-2 h-4 w-4" />
              System Restore
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                System Restore
              </DialogTitle>
              <DialogDescription>
                Restore the system to a previous state
              </DialogDescription>
            </DialogHeader>
            {restoreContent}
          </DialogContent>
        </Dialog>

        <AdminPasswordDialog
          open={showAdminDialog}
          onOpenChange={setShowAdminDialog}
          onConfirm={handleRestore}
          title={restorePeriod === 'all' ? 'Confirm Complete System Reset' : 'Confirm System Restore'}
          description={
            restorePeriod === 'all' 
              ? 'This will permanently delete ALL data from both local storage and cloud. This action CANNOT be undone. Enter admin password to continue.'
              : 'This will permanently delete transactions and restore product stock. Enter admin password to continue.'
          }
        />
      </>
    );
  }

  return (
    <>
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            System Restore
          </CardTitle>
        </CardHeader>
        <CardContent>
          {restoreContent}
        </CardContent>
      </Card>

      <AdminPasswordDialog
        open={showAdminDialog}
        onOpenChange={setShowAdminDialog}
        onConfirm={handleRestore}
        title={restorePeriod === 'all' ? 'Confirm Complete System Reset' : 'Confirm System Restore'}
        description={
          restorePeriod === 'all' 
            ? 'This will permanently delete ALL data from both local storage and cloud. This action CANNOT be undone. Enter admin password to continue.'
            : 'This will permanently delete transactions and restore product stock. Enter admin password to continue.'
        }
      />
    </>
  );
};
