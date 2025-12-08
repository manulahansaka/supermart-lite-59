import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Settings as SettingsType, Cashier } from '@/lib/db';
import { syncService } from '@/lib/syncService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Save, Plus, Trash2, UserPlus, KeyRound } from 'lucide-react';
import {
  Dialog,
  DialogContent,
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

const Settings = () => {
  const { toast } = useToast();
  const [settings, setSettings] = useState<SettingsType>({
    storeName: 'SuperMart POS',
    taxRate: 10,
    currency: 'LKR',
    receiptHeader: 'Thank you for shopping with us!',
    receiptFooter: 'Visit again soon!'
  });

  const categories = useLiveQuery(() => db.categories.toArray());
  const suppliers = useLiveQuery(() => db.suppliers.toArray());
  const units = useLiveQuery(() => db.units.toArray());
  const cashiers = useLiveQuery(() => db.cashiers.toArray());
  const quickQuantities = useLiveQuery(() => db.quickQuantities.toArray());

  const [newCategory, setNewCategory] = useState('');
  const [newSupplier, setNewSupplier] = useState('');
  const [newUnit, setNewUnit] = useState({ name: '', symbol: '' });
  const [newCashier, setNewCashier] = useState({ name: '', pin: '', role: 'cashier' as 'super_admin' | 'admin' | 'cashier' });
  const [isCashierDialogOpen, setIsCashierDialogOpen] = useState(false);
  const [newQuickQty, setNewQuickQty] = useState({ value: 0, label: '' });
  const [newAdminPassword, setNewAdminPassword] = useState('');
  const [isPasswordDialogOpen, setIsPasswordDialogOpen] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<'super_admin' | 'admin' | 'cashier'>('cashier');

  useEffect(() => {
    const cashierStr = localStorage.getItem('cashier');
    if (cashierStr) {
      const cashier = JSON.parse(cashierStr);
      setCurrentUserRole(cashier.role);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const result = await db.settings.toArray();
    if (result.length > 0) {
      setSettings(result[0]);
    }
  };

  const handleSave = async () => {
    try {
      const existing = await db.settings.toArray();
      if (existing.length > 0) {
        await db.settings.update(existing[0].id!, settings);
      } else {
        await db.settings.add(settings);
      }
      
      toast({
        title: 'Settings saved',
        description: 'Your settings have been updated successfully'
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save settings',
        variant: 'destructive'
      });
    }
  };

  const handleResetAdminPassword = async () => {
    if (!newAdminPassword || newAdminPassword.length < 4) {
      toast({
        title: 'Error',
        description: 'Password must be at least 4 characters',
        variant: 'destructive'
      });
      return;
    }

    try {
      // Get currently logged-in cashier from localStorage
      const cashierStr = localStorage.getItem('cashier');
      if (!cashierStr) {
        toast({
          title: 'Error',
          description: 'No cashier logged in',
          variant: 'destructive'
        });
        return;
      }

      const currentCashier = JSON.parse(cashierStr);
      
      if (currentCashier.role !== 'super_admin' && currentCashier.role !== 'admin') {
        toast({
          title: 'Error',
          description: 'Only admins can change passwords',
          variant: 'destructive'
        });
        return;
      }

      // Update the currently logged-in admin's password
      await db.cashiers.update(currentCashier.id!, { pin: newAdminPassword });
      
      // Update localStorage with new password
      currentCashier.pin = newAdminPassword;
      localStorage.setItem('cashier', JSON.stringify(currentCashier));
      
      toast({
        title: 'Success',
        description: 'Your password has been reset'
      });
      
      setIsPasswordDialogOpen(false);
      setNewAdminPassword('');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to reset admin password',
        variant: 'destructive'
      });
    }
  };


  const addCategory = async () => {
    if (!newCategory.trim()) return;
    try {
      await db.categories.add({ name: newCategory });
      setNewCategory('');
      toast({ title: 'Success', description: 'Category added' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to add category', variant: 'destructive' });
    }
  };

  const deleteCategory = async (id: number) => {
    try {
      const category = await db.categories.get(id);
      if (category) {
        await db.categories.delete(id);
        await syncService.deleteCategoryFromCloud(category.name);
      }
      toast({ title: 'Success', description: 'Category deleted' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete category', variant: 'destructive' });
    }
  };

  const addSupplier = async () => {
    if (!newSupplier.trim()) return;
    try {
      await db.suppliers.add({ name: newSupplier });
      setNewSupplier('');
      toast({ title: 'Success', description: 'Supplier added' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to add supplier', variant: 'destructive' });
    }
  };

  const deleteSupplier = async (id: number) => {
    try {
      const supplier = await db.suppliers.get(id);
      if (supplier) {
        await db.suppliers.delete(id);
        await syncService.deleteSupplierFromCloud(supplier.name);
      }
      toast({ title: 'Success', description: 'Supplier deleted' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete supplier', variant: 'destructive' });
    }
  };

  const addUnit = async () => {
    if (!newUnit.name.trim() || !newUnit.symbol.trim()) return;
    try {
      await db.units.add(newUnit);
      setNewUnit({ name: '', symbol: '' });
      toast({ title: 'Success', description: 'Unit added' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to add unit', variant: 'destructive' });
    }
  };

  const deleteUnit = async (id: number) => {
    try {
      const unit = await db.units.get(id);
      if (unit) {
        await db.units.delete(id);
        await syncService.deleteUnitFromCloud(unit.name);
      }
      toast({ title: 'Success', description: 'Unit deleted' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete unit', variant: 'destructive' });
    }
  };

  const addCashier = async () => {
    if (!newCashier.name.trim() || !newCashier.pin.trim()) {
      toast({ title: 'Error', description: 'Name and PIN are required', variant: 'destructive' });
      return;
    }

    // Only super_admin can add admin accounts
    if (newCashier.role === 'admin' && currentUserRole !== 'super_admin') {
      toast({ title: 'Error', description: 'Only Super Admin can create Admin accounts', variant: 'destructive' });
      return;
    }

    // Prevent creating super_admin accounts
    if (newCashier.role === 'super_admin') {
      toast({ title: 'Error', description: 'Cannot create Super Admin accounts', variant: 'destructive' });
      return;
    }

    try {
      await db.cashiers.add({ ...newCashier, createdAt: new Date() });
      setNewCashier({ name: '', pin: '', role: 'cashier' });
      setIsCashierDialogOpen(false);
      toast({ title: 'Success', description: 'Cashier added' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to add cashier', variant: 'destructive' });
    }
  };

  const deleteCashier = async (cashier: Cashier) => {
    // Only super_admin can delete admin accounts
    if (cashier.role === 'admin' && currentUserRole !== 'super_admin') {
      toast({ title: 'Error', description: 'Only Super Admin can delete Admin accounts', variant: 'destructive' });
      return;
    }

    // Cannot delete super_admin accounts
    if (cashier.role === 'super_admin') {
      toast({ title: 'Error', description: 'Cannot delete Super Admin account', variant: 'destructive' });
      return;
    }

    if (!confirm('Are you sure you want to delete this cashier?')) return;
    try {
      await db.cashiers.delete(cashier.id!);
      await syncService.deleteCashierFromCloud(cashier.name);
      toast({ title: 'Success', description: 'Cashier deleted' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete cashier', variant: 'destructive' });
    }
  };

  const addQuickQuantity = async () => {
    if (!newQuickQty.label.trim() || newQuickQty.value <= 0) {
      toast({ title: 'Error', description: 'Valid label and value are required', variant: 'destructive' });
      return;
    }
    try {
      await db.quickQuantities.add(newQuickQty);
      setNewQuickQty({ value: 0, label: '' });
      toast({ title: 'Success', description: 'Quick quantity added' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to add quick quantity', variant: 'destructive' });
    }
  };

  const deleteQuickQuantity = async (id: number) => {
    try {
      await db.quickQuantities.delete(id);
      toast({ title: 'Success', description: 'Quick quantity deleted' });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete quick quantity', variant: 'destructive' });
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl">
      <h1 className="text-2xl sm:text-3xl font-bold mb-6 sm:mb-8">Settings</h1>

      <div className="space-y-6">
        {/* Permission System Info */}
        <Card className="border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="text-lg">Permission System</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <div className="flex items-start gap-2">
                <div className="font-semibold text-primary min-w-[120px]">Super Admin:</div>
                <div className="text-sm text-muted-foreground">
                  Full system access. Can add/edit/delete Admin and Cashier accounts. Can access all features and high-level controls.
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="font-semibold text-blue-600 min-w-[120px]">Admin:</div>
                <div className="text-sm text-muted-foreground">
                  Management-level access. Can manage daily operations, products, sales, reports. Cannot delete other admins or access super-admin-only features.
                </div>
              </div>
              <div className="flex items-start gap-2">
                <div className="font-semibold text-muted-foreground min-w-[120px]">Cashier:</div>
                <div className="text-sm text-muted-foreground">
                  Basic access. Can only access the Sales page to process transactions.
                </div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground pt-2 border-t">
              Your current role: <span className="font-semibold capitalize">{currentUserRole === 'super_admin' ? 'Super Admin' : currentUserRole}</span>
            </div>
          </CardContent>
        </Card>

        {/* Store Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Store Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="storeName">Store Name</Label>
              <Input
                id="storeName"
                value={settings.storeName}
                onChange={(e) => setSettings({...settings, storeName: e.target.value})}
                className="mt-2"
              />
            </div>
            
            <div>
              <Label htmlFor="storeMobile">Mobile Number 1</Label>
              <Input
                id="storeMobile"
                value={settings.storeMobile || ''}
                onChange={(e) => setSettings({...settings, storeMobile: e.target.value})}
                placeholder="Primary mobile number"
                className="mt-2"
              />
            </div>
            
            <div>
              <Label htmlFor="storeMobile2">Mobile Number 2</Label>
              <Input
                id="storeMobile2"
                value={settings.storeMobile2 || ''}
                onChange={(e) => setSettings({...settings, storeMobile2: e.target.value})}
                placeholder="Secondary mobile number"
                className="mt-2"
              />
            </div>
            
            <div>
              <Label htmlFor="currency">Currency</Label>
              <Input
                id="currency"
                value={settings.currency}
                onChange={(e) => setSettings({...settings, currency: e.target.value})}
                className="mt-2"
              />
            </div>
            
            <div>
              <Label htmlFor="taxRate">Tax Rate (%)</Label>
              <Input
                id="taxRate"
                type="number"
                step="0.1"
                value={settings.taxRate}
                onChange={(e) => setSettings({...settings, taxRate: parseFloat(e.target.value)})}
                className="mt-2"
              />
            </div>
          </CardContent>
        </Card>

        {/* Receipt Settings */}
        <Card>
          <CardHeader>
            <CardTitle>Receipt Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="receiptHeader">Receipt Header</Label>
              <Input
                id="receiptHeader"
                value={settings.receiptHeader}
                onChange={(e) => setSettings({...settings, receiptHeader: e.target.value})}
                className="mt-2"
              />
            </div>
            
            <div>
              <Label htmlFor="receiptFooter">Receipt Footer</Label>
              <Input
                id="receiptFooter"
                value={settings.receiptFooter}
                onChange={(e) => setSettings({...settings, receiptFooter: e.target.value})}
                className="mt-2"
              />
            </div>
          </CardContent>
        </Card>

        {/* Product Options */}
        <Card>
          <CardHeader>
            <CardTitle>Product Categories</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Add new category"
                value={newCategory}
                onChange={(e) => setNewCategory(e.target.value)}
                className="flex-1"
              />
              <Button onClick={addCategory} className="shrink-0">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-2 max-h-40 overflow-auto">
              {categories?.map((cat) => (
                <div key={cat.id} className="flex justify-between items-center p-2 bg-secondary rounded">
                  <span>{cat.name}</span>
                  <Button variant="ghost" size="sm" onClick={() => deleteCategory(cat.id!)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Suppliers</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-2">
              <Input
                placeholder="Add new supplier"
                value={newSupplier}
                onChange={(e) => setNewSupplier(e.target.value)}
                className="flex-1"
              />
              <Button onClick={addSupplier} className="shrink-0">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-2 max-h-40 overflow-auto">
              {suppliers?.map((sup) => (
                <div key={sup.id} className="flex justify-between items-center p-2 bg-secondary rounded">
                  <span>{sup.name}</span>
                  <Button variant="ghost" size="sm" onClick={() => deleteSupplier(sup.id!)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Units of Measurement</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="Unit name (e.g., kilogram)"
                value={newUnit.name}
                onChange={(e) => setNewUnit({...newUnit, name: e.target.value})}
                className="flex-1"
              />
              <Input
                placeholder="Symbol (e.g., kg)"
                value={newUnit.symbol}
                onChange={(e) => setNewUnit({...newUnit, symbol: e.target.value})}
                className="w-full sm:w-24"
              />
              <Button onClick={addUnit} className="shrink-0">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-2 max-h-40 overflow-auto">
              {units?.map((unit) => (
                <div key={unit.id} className="flex justify-between items-center p-2 bg-secondary rounded">
                  <span>{unit.name} ({unit.symbol})</span>
                  <Button variant="ghost" size="sm" onClick={() => deleteUnit(unit.id!)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Quick Quantity Presets</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                placeholder="Label (e.g., Half)"
                value={newQuickQty.label}
                onChange={(e) => setNewQuickQty({...newQuickQty, label: e.target.value})}
                className="flex-1"
              />
              <Input
                placeholder="Value (e.g., 0.5)"
                type="number"
                step="0.01"
                value={newQuickQty.value || ''}
                onChange={(e) => setNewQuickQty({...newQuickQty, value: parseFloat(e.target.value)})}
                className="flex-1"
              />
              <Button onClick={addQuickQuantity} className="shrink-0">
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-2 max-h-40 overflow-auto">
              {quickQuantities?.map((qq) => (
                <div key={qq.id} className="flex justify-between items-center p-2 bg-secondary rounded">
                  <span>{qq.label} ({qq.value})</span>
                  <Button variant="ghost" size="sm" onClick={() => deleteQuickQuantity(qq.id!)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Staff Management */}
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
              <span>Staff Management</span>
              <Dialog open={isCashierDialogOpen} onOpenChange={setIsCashierDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" className="w-full sm:w-auto">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Add Staff
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-[90vw] sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Add New Staff</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label>Name</Label>
                      <Input
                        value={newCashier.name}
                        onChange={(e) => setNewCashier({...newCashier, name: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>PIN (4 digits)</Label>
                      <Input
                        type="password"
                        maxLength={4}
                        value={newCashier.pin}
                        onChange={(e) => setNewCashier({...newCashier, pin: e.target.value})}
                      />
                    </div>
                    <div>
                      <Label>Role</Label>
                      <Select value={newCashier.role} onValueChange={(value: 'super_admin' | 'admin' | 'cashier') => setNewCashier({...newCashier, role: value})}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="cashier">Cashier</SelectItem>
                          {currentUserRole === 'super_admin' && (
                            <SelectItem value="admin">Admin</SelectItem>
                          )}
                        </SelectContent>
                      </Select>
                      {currentUserRole !== 'super_admin' && (
                        <p className="text-xs text-muted-foreground mt-1">
                          Only Super Admin can create Admin accounts
                        </p>
                      )}
                    </div>
                    <Button onClick={addCashier} className="w-full">Add Staff</Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {cashiers?.map((cashier) => (
                <div key={cashier.id} className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 p-3 bg-secondary rounded">
                  <div>
                    <p className="font-semibold">{cashier.name}</p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {cashier.role === 'super_admin' ? 'Super Admin' : cashier.role}
                    </p>
                  </div>
                  {cashier.role !== 'super_admin' && (
                    cashier.role === 'admin' ? (
                      currentUserRole === 'super_admin' && (
                        <Button variant="ghost" size="sm" onClick={() => deleteCashier(cashier)} className="self-end sm:self-center">
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      )
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => deleteCashier(cashier)} className="self-end sm:self-center">
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Admin Password Reset */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" />
              Change Your Password
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Dialog open={isPasswordDialogOpen} onOpenChange={setIsPasswordDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" className="w-full">
                  <KeyRound className="mr-2 h-4 w-4" />
                  Change Password
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-[90vw] sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>Change Your Password</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>New Password</Label>
                    <Input
                      type="password"
                      placeholder="Enter new password (min 4 characters)"
                      value={newAdminPassword}
                      onChange={(e) => setNewAdminPassword(e.target.value)}
                    />
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Button variant="outline" onClick={() => setIsPasswordDialogOpen(false)} className="flex-1">
                      Cancel
                    </Button>
                    <Button onClick={handleResetAdminPassword} className="flex-1">
                      Reset Password
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>


        <Button onClick={handleSave} size="lg" className="w-full">
          <Save className="w-5 h-5 mr-2" />
          Save Settings
        </Button>
      </div>
    </div>
  );
};

export default Settings;
