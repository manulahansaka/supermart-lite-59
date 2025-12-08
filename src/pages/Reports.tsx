import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BarChart3, DollarSign, ShoppingBag, TrendingUp, FileDown, Printer, Trash2, Plus, Upload, Filter } from 'lucide-react';
import { db, SaleItem } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import * as XLSX from 'xlsx';
import { printReceipt } from '@/components/Receipt';
import { useToast } from '@/hooks/use-toast';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ReportImport } from '@/components/ReportImport';
import { AdminPasswordDialog } from '@/components/AdminPasswordDialog';
import { ProductSearch } from '@/components/ProductSearch';

const Reports = () => {
  const { toast } = useToast();
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalSales, setTotalSales] = useState(0);
  const [totalProfit, setTotalProfit] = useState(0);
  
  // Filter states
  const [filterStartDate, setFilterStartDate] = useState('');
  const [filterEndDate, setFilterEndDate] = useState('');
  const [filterStartTime, setFilterStartTime] = useState('');
  const [filterEndTime, setFilterEndTime] = useState('');
  const [filterCashier, setFilterCashier] = useState('all');
  
  // Add manual sale states
  const [manualSaleDialog, setManualSaleDialog] = useState(false);
  const [manualSaleItems, setManualSaleItems] = useState<SaleItem[]>([]);
  const [manualCashier, setManualCashier] = useState('');
  const [manualPaymentMethod, setManualPaymentMethod] = useState<'cash' | 'card'>('cash');
  const [manualTimestamp, setManualTimestamp] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [itemQuantity, setItemQuantity] = useState(1);
  const [itemPrice, setItemPrice] = useState(0);
  
  // Admin password dialog state
  const [showAdminDialog, setShowAdminDialog] = useState(false);
  const [pendingDeleteAction, setPendingDeleteAction] = useState<(() => void) | null>(null);

  const sales = useLiveQuery(() => db.sales.toArray());
  const products = useLiveQuery(() => db.products.toArray());
  const settings = useLiveQuery(() => db.settings.toArray());
  const currency = settings && settings.length > 0 ? settings[0].currency : 'LKR';
  
  const cashiers = [...new Set(sales?.map(s => s.cashier) || [])];

  const handleReprint = async (saleId: number) => {
    try {
      const sale = await db.sales.get(saleId);
      if (sale && settings && settings.length > 0) {
        await printReceipt(sale, settings[0]);
        toast({
          title: 'Receipt reprinted',
          description: `Print count: ${sale.printCount + 1}`
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to reprint receipt',
        variant: 'destructive'
      });
    }
  };

  useEffect(() => {
    const calculateStats = async () => {
      if (!sales) return;

      const revenue = sales.reduce((sum, sale) => sum + sale.total, 0);
      const count = sales.length;
      
      // Calculate profit (simplified - would need to track actual costs)
      let profit = 0;
      for (const sale of sales) {
        for (const item of sale.items) {
          const product = await db.products.get(item.productId);
          if (product) {
            profit += (item.price - product.costPrice) * item.quantity;
          }
        }
      }

      setTotalRevenue(revenue);
      setTotalSales(count);
      setTotalProfit(profit);
    };

    calculateStats();
  }, [sales]);

  const getFilteredSales = () => {
    if (!sales) return [];
    
    return sales.filter(sale => {
      const saleDate = new Date(sale.timestamp);
      
      // Date filter
      if (filterStartDate) {
        const startDate = new Date(filterStartDate);
        if (saleDate < startDate) return false;
      }
      if (filterEndDate) {
        const endDate = new Date(filterEndDate);
        endDate.setHours(23, 59, 59);
        if (saleDate > endDate) return false;
      }
      
      // Time filter
      if (filterStartTime) {
        const [hours, minutes] = filterStartTime.split(':').map(Number);
        const saleHours = saleDate.getHours();
        const saleMinutes = saleDate.getMinutes();
        if (saleHours < hours || (saleHours === hours && saleMinutes < minutes)) return false;
      }
      if (filterEndTime) {
        const [hours, minutes] = filterEndTime.split(':').map(Number);
        const saleHours = saleDate.getHours();
        const saleMinutes = saleDate.getMinutes();
        if (saleHours > hours || (saleHours === hours && saleMinutes > minutes)) return false;
      }
      
      // Cashier filter
      if (filterCashier !== 'all' && sale.cashier !== filterCashier) return false;
      
      return true;
    });
  };
  
  const handleDeleteFiltered = async () => {
    const filtered = getFilteredSales();
    if (filtered.length === 0) {
      toast({
        title: 'No sales to delete',
        description: 'No sales match the current filters',
        variant: 'destructive'
      });
      return;
    }
    
    setPendingDeleteAction(() => async () => {
      try {
        for (const sale of filtered) {
          if (sale.id) await db.sales.delete(sale.id);
        }
        
        toast({
          title: 'Sales deleted',
          description: `${filtered.length} sale(s) deleted successfully`
        });
        
        // Reset filters
        setFilterStartDate('');
        setFilterEndDate('');
        setFilterStartTime('');
        setFilterEndTime('');
        setFilterCashier('all');
      } catch (error) {
        toast({
          title: 'Error',
          description: 'Failed to delete sales',
          variant: 'destructive'
        });
      }
    });
    
    setShowAdminDialog(true);
  };
  
  const addItemToManualSale = () => {
    if (!selectedProduct || itemQuantity <= 0 || itemPrice <= 0) {
      toast({
        title: 'Invalid input',
        description: 'Please select a product and enter valid quantity and price',
        variant: 'destructive'
      });
      return;
    }

    const newItem: SaleItem = {
      productId: selectedProduct.id,
      barcode: selectedProduct.barcode,
      name: selectedProduct.name,
      price: itemPrice,
      quantity: itemQuantity,
      total: itemPrice * itemQuantity,
      unit: selectedProduct.unit
    };

    setManualSaleItems([...manualSaleItems, newItem]);
    setSelectedProduct(null);
    setItemQuantity(1);
    setItemPrice(0);
    
    toast({
      title: 'Item added',
      description: `${selectedProduct.name} added to sale`
    });
  };

  const removeItemFromManualSale = (index: number) => {
    setManualSaleItems(manualSaleItems.filter((_, i) => i !== index));
  };

  const handleAddManualSale = async () => {
    if (manualSaleItems.length === 0 || !manualCashier || !manualTimestamp) {
      toast({
        title: 'Missing information',
        description: 'Please add items and fill all required fields',
        variant: 'destructive'
      });
      return;
    }
    
    try {
      const subtotal = manualSaleItems.reduce((sum, item) => sum + item.total, 0);
      const taxRate = settings?.[0]?.taxRate || 0;
      const tax = subtotal * (taxRate / 100);
      const total = subtotal + tax;
      
      await db.sales.add({
        items: manualSaleItems,
        subtotal,
        tax,
        discount: 0,
        total,
        paymentMethod: manualPaymentMethod,
        amountPaid: total,
        change: 0,
        cashier: manualCashier,
        timestamp: new Date(manualTimestamp),
        printCount: 0,
        printHistory: []
      });
      
      toast({
        title: 'Sale added',
        description: 'Manual sale added successfully'
      });
      
      setManualSaleDialog(false);
      setManualSaleItems([]);
      setManualCashier('');
      setManualTimestamp('');
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add manual sale',
        variant: 'destructive'
      });
    }
  };

  const exportToExcel = async () => {
    if (!sales || sales.length === 0) return;

    const detailedData = [];
    
    for (const sale of sales) {
      for (const item of sale.items) {
        const product = await db.products.get(item.productId);
        detailedData.push({
          'Sale Date': new Date(sale.timestamp).toLocaleDateString(),
          'Sale Time': new Date(sale.timestamp).toLocaleTimeString(),
          'Product': item.name,
          'Barcode': item.barcode,
          'Category': product?.category || 'N/A',
          'Unit Price': item.price,
          'Quantity': item.quantity,
          'Unit': product?.unit || 'pc',
          'Item Total': item.total,
          'Discount': sale.discount,
          'Tax': sale.tax,
          'Sale Total': sale.total,
          'Payment Method': sale.paymentMethod,
          'Cashier': sale.cashier,
          'Cost Price': product?.costPrice || 0,
          'Profit': (item.price - (product?.costPrice || 0)) * item.quantity
        });
      }
    }

    const ws = XLSX.utils.json_to_sheet(detailedData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Report');
    
    const date = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `SuperMart-Sales-Report-${date}.xlsx`);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 sm:mb-8 gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold">Reports</h1>
        <div className="flex flex-wrap gap-2">
          <Dialog open={manualSaleDialog} onOpenChange={setManualSaleDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Plus className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Add Missed Sale</span>
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Add Missed Sale</DialogTitle>
                <DialogDescription>
                  Manually add a sale that was not recorded in the system
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Cashier Name</Label>
                    <Input
                      value={manualCashier}
                      onChange={(e) => setManualCashier(e.target.value)}
                      placeholder="Enter cashier name"
                    />
                  </div>
                  <div>
                    <Label>Date & Time</Label>
                    <Input
                      type="datetime-local"
                      value={manualTimestamp}
                      onChange={(e) => setManualTimestamp(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label>Payment Method</Label>
                  <Select value={manualPaymentMethod} onValueChange={(val: 'cash' | 'card') => setManualPaymentMethod(val)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="cash">Cash</SelectItem>
                      <SelectItem value="card">Card</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-3">
                  <Label>Add Sale Items</Label>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="col-span-2">
                      <ProductSearch 
                        onSelectProduct={(product) => {
                          setSelectedProduct(product);
                          setItemPrice(product.sellingPrice);
                        }}
                      />
                    </div>
                    <div>
                      <Input
                        type="number"
                        placeholder="Qty"
                        value={itemQuantity}
                        onChange={(e) => setItemQuantity(Number(e.target.value))}
                        min="0.01"
                        step="0.01"
                      />
                    </div>
                    <div>
                      <Input
                        type="number"
                        placeholder="Price"
                        value={itemPrice}
                        onChange={(e) => setItemPrice(Number(e.target.value))}
                        min="0.01"
                        step="0.01"
                      />
                    </div>
                  </div>
                  <Button 
                    type="button" 
                    onClick={addItemToManualSale}
                    variant="outline"
                    className="w-full"
                    disabled={!selectedProduct}
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Add Item
                  </Button>
                  
                  {manualSaleItems.length > 0 && (
                    <div className="border rounded-lg p-3 space-y-2 max-h-48 overflow-y-auto">
                      {manualSaleItems.map((item, index) => (
                        <div key={index} className="flex items-center justify-between bg-secondary p-2 rounded">
                          <div className="flex-1">
                            <p className="font-medium text-sm">{item.name}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.quantity} x {currency} {item.price.toFixed(2)} = {currency} {item.total.toFixed(2)}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeItemFromManualSale(index)}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      ))}
                      <div className="pt-2 border-t">
                        <p className="text-sm font-semibold text-right">
                          Total: {currency} {manualSaleItems.reduce((sum, item) => sum + item.total, 0).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setManualSaleDialog(false)}>
                  Cancel
                </Button>
                <Button onClick={handleAddManualSale}>Add Sale</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          
          <ReportImport />
          
          <Button onClick={exportToExcel} disabled={!sales || sales.length === 0} size="sm">
            <FileDown className="w-4 h-4 sm:mr-2" />
            <span className="hidden sm:inline">Export to Excel</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
            <DollarSign className="h-5 w-5 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{currency} {(totalRevenue ?? 0).toFixed(2)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Sales</CardTitle>
            <ShoppingBag className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalSales}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Profit</CardTitle>
            <TrendingUp className="h-5 w-5 text-accent" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{currency} {(totalProfit ?? 0).toFixed(2)}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Manage Sales Data
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="filter">
            <TabsList className="mb-4">
              <TabsTrigger value="filter">Filter & Delete</TabsTrigger>
            </TabsList>
            
            <TabsContent value="filter" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label>Start Date</Label>
                  <Input
                    type="date"
                    value={filterStartDate}
                    onChange={(e) => setFilterStartDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label>End Date</Label>
                  <Input
                    type="date"
                    value={filterEndDate}
                    onChange={(e) => setFilterEndDate(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Start Time</Label>
                  <Input
                    type="time"
                    value={filterStartTime}
                    onChange={(e) => setFilterStartTime(e.target.value)}
                  />
                </div>
                <div>
                  <Label>End Time</Label>
                  <Input
                    type="time"
                    value={filterEndTime}
                    onChange={(e) => setFilterEndTime(e.target.value)}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Cashier</Label>
                  <Select value={filterCashier} onValueChange={setFilterCashier}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Cashiers</SelectItem>
                      {cashiers.map(cashier => (
                        <SelectItem key={cashier} value={cashier}>{cashier}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    variant="outline"
                    onClick={() => {
                      setFilterStartDate('');
                      setFilterEndDate('');
                      setFilterStartTime('');
                      setFilterEndTime('');
                      setFilterCashier('all');
                    }}
                    className="w-full"
                  >
                    Clear Filters
                  </Button>
                </div>
              </div>
              
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div>
                  <p className="text-sm font-medium">Filtered Results: {getFilteredSales().length} sales</p>
                  <p className="text-xs text-muted-foreground">
                    Total: {currency} {getFilteredSales().reduce((sum, s) => sum + (s.total ?? 0), 0).toFixed(2)}
                  </p>
                </div>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" disabled={getFilteredSales().length === 0}>
                      <Trash2 className="w-4 h-4 mr-2" />
                      Delete Filtered Sales
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will permanently delete {getFilteredSales().length} sale(s). This action cannot be undone.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDeleteFiltered}>
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Sales History
          </CardTitle>
        </CardHeader>
        <CardContent>
          {sales && sales.length > 0 ? (
            <div className="space-y-4">
              {sales.slice(-10).reverse().map((sale) => (
                <div key={sale.id} className="flex justify-between items-center p-4 bg-secondary rounded-lg gap-4">
                  <div className="flex-1">
                    <p className="font-semibold">
                      {new Date(sale.timestamp).toLocaleDateString()} {new Date(sale.timestamp).toLocaleTimeString()}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {sale.items.length} items • {sale.paymentMethod} • Cashier: {sale.cashier}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Printed: {sale.printCount} time{sale.printCount !== 1 ? 's' : ''}
                      {sale.printHistory && sale.printHistory.length > 0 && ` • Last: ${new Date(sale.printHistory[sale.printHistory.length - 1]).toLocaleString()}`}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-primary">{currency} {(sale.total ?? 0).toFixed(2)}</p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReprint(sale.id!)}
                  >
                    <Printer className="w-4 h-4 mr-2" />
                    Reprint
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p>No sales recorded yet</p>
            </div>
          )}
        </CardContent>
      </Card>
      
      <AdminPasswordDialog
        open={showAdminDialog}
        onOpenChange={setShowAdminDialog}
        onConfirm={() => {
          if (pendingDeleteAction) {
            pendingDeleteAction();
            setPendingDeleteAction(null);
          }
        }}
        title="Admin Verification Required"
        description="Deleting sales records requires admin authorization. Please enter admin password."
      />
    </div>
  );
};

export default Reports;
