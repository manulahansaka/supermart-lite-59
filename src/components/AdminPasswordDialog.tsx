import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { db } from '@/lib/db';
import { useToast } from '@/hooks/use-toast';

interface AdminPasswordDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
}

export const AdminPasswordDialog = ({ 
  open, 
  onOpenChange, 
  onConfirm,
  title = "Admin Verification Required",
  description = "Please enter admin password to proceed"
}: AdminPasswordDialogProps) => {
  const [password, setPassword] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);
  const { toast } = useToast();

  const handleVerify = async () => {
    if (!password.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a password',
        variant: 'destructive'
      });
      return;
    }

    setIsVerifying(true);
    
    try {
      const admins = await db.cashiers.filter((c) => c.role === 'super_admin' || c.role === 'admin').toArray();
      
      if (admins.length === 0) {
        toast({
          title: 'Error',
          description: 'No admin accounts found. Please create one in Settings.',
          variant: 'destructive'
        });
        setIsVerifying(false);
        return;
      }

      const isValid = admins.some(admin => admin.pin === password);
      
      if (isValid) {
        toast({
          title: 'Verified',
          description: 'Admin access granted'
        });
        setPassword('');
        onOpenChange(false);
        onConfirm();
      } else {
        toast({
          title: 'Access Denied',
          description: `Invalid admin password. Hint: Default is "1234"`,
          variant: 'destructive'
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to verify admin password',
        variant: 'destructive'
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleClose = () => {
    setPassword('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="admin-password">Admin Password</Label>
            <Input
              id="admin-password"
              type="password"
              placeholder="Enter admin password (default: 1234)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  handleVerify();
                }
              }}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Default Super Admin password is <span className="font-mono font-semibold">1234</span>. You can change it in Settings.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isVerifying}>
            Cancel
          </Button>
          <Button onClick={handleVerify} disabled={isVerifying}>
            {isVerifying ? 'Verifying...' : 'Verify'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
