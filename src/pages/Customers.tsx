import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Customer, LoanPurchase, Sale } from '@/lib/db';
import { syncService } from '@/lib/syncService';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Users, Plus, Edit, Trash2, Search, DollarSign, Receipt, Printer } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { printReceipt } from '@/components/Receipt';
import { ScrollArea } from '@/components/ui/scroll-area';

const Customers = () => {
  const { toast } = useToast();
  const customers = useLiveQuery(() => db.customers.toArray());
  const [searchTerm, setSearchTerm] = useState('');
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isLoanDialogOpen, setIsLoanDialogOpen] = useState(false);
  const [isPurchaseHistoryOpen, setIsPurchaseHistoryOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [loanData, setLoanData] = useState({ items: '', amount: 0, paid: 0 });
  const [customerSales, setCustomerSales] = useState<Sale[]>([]);
  
  const settings = useLiveQuery(() => db.settings.toArray().then(s => s[0]));
  const [formData, setFormData] = useState<Partial<Customer>>({
    name: '',
    phone: '',
    email: '',
    loyaltyPoints: 0,
    totalPurchases: 0
  });

  const filteredCustomers = customers?.filter(customer =>
    customer.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    customer.phone.includes(searchTerm)
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.name || !formData.phone) {
      toast({
        title: 'Error',
        description: 'Name and phone are required',
        variant: 'destructive'
      });
      return;
    }

    try {
      if (editingCustomer && editingCustomer.id) {
        // If phone changed, delete old cloud record first
        if (editingCustomer.phone !== formData.phone) {
          await syncService.deleteCustomerFromCloud(editingCustomer.phone);
        }
        
        await db.customers.update(editingCustomer.id, {
          ...formData,
          name: formData.name!,
          phone: formData.phone!
        });
        
        // Sync updated customer to cloud
        const updatedCustomer = await db.customers.get(editingCustomer.id);
        if (updatedCustomer) {
          await syncService.pushCustomerInstant(updatedCustomer);
        }
        
        toast({
          title: 'Success',
          description: 'Customer updated successfully'
        });
      } else {
        const newId = await db.customers.add({
          name: formData.name!,
          phone: formData.phone!,
          email: formData.email || '',
          loyaltyPoints: 0,
          totalPurchases: 0,
          loanBalance: 0,
          loanPurchases: [],
          notes: formData.notes || '',
          createdAt: new Date()
        });
        
        // Sync new customer to cloud
        const newCustomer = await db.customers.get(newId);
        if (newCustomer) {
          await syncService.pushCustomerInstant(newCustomer);
        }
        
        toast({
          title: 'Success',
          description: 'Customer added successfully'
        });
      }
      
      setIsDialogOpen(false);
      resetForm();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to save customer',
        variant: 'destructive'
      });
    }
  };

  const handleEdit = (customer: Customer) => {
    setEditingCustomer(customer);
    setFormData({
      name: customer.name,
      phone: customer.phone,
      email: customer.email,
      notes: customer.notes,
      loyaltyPoints: customer.loyaltyPoints,
      totalPurchases: customer.totalPurchases
    });
    setIsDialogOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this customer?')) return;
    
    try {
      // Get customer before deleting to get phone for cloud sync
      const customer = await db.customers.get(id);
      if (customer) {
        await db.customers.delete(id);
        // Sync deletion to cloud
        await syncService.deleteCustomerFromCloud(customer.phone);
      }
      toast({
        title: 'Success',
        description: 'Customer deleted successfully'
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete customer',
        variant: 'destructive'
      });
    }
  };

  const resetForm = () => {
    setFormData({
      name: '',
      phone: '',
      email: '',
      notes: '',
      loyaltyPoints: 0,
      totalPurchases: 0
    });
    setEditingCustomer(null);
  };

  const handleAddLoan = async () => {
    if (!selectedCustomer || !loanData.items || loanData.amount <= 0) {
      toast({
        title: 'Error',
        description: 'Please fill in all required fields',
        variant: 'destructive'
      });
      return;
    }

    try {
      const newLoan: LoanPurchase = {
        id: Date.now().toString(),
        items: loanData.items,
        amount: loanData.amount || 0,
        date: new Date(),
        paid: loanData.paid || 0,
        remaining: (loanData.amount || 0) - (loanData.paid || 0)
      };

      const existingLoans = selectedCustomer.loanPurchases || [];
      const updatedLoans = [...existingLoans, newLoan];
      const totalLoanBalance = updatedLoans.reduce((sum, loan) => sum + loan.remaining, 0);

      await db.customers.update(selectedCustomer.id!, {
        loanPurchases: updatedLoans,
        loanBalance: totalLoanBalance
      });

      // Sync updated customer to cloud
      const updatedCustomer = await db.customers.get(selectedCustomer.id!);
      if (updatedCustomer) {
        await syncService.pushCustomerInstant(updatedCustomer);
      }

      toast({
        title: 'Success',
        description: 'Loan purchase added successfully'
      });

      setIsLoanDialogOpen(false);
      setLoanData({ items: '', amount: 0, paid: 0 });
      setSelectedCustomer(null);
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add loan purchase',
        variant: 'destructive'
      });
    }
  };

  const handlePayLoan = async (customer: Customer, loanId: string, payAmount: number) => {
    try {
      const loan = customer.loanPurchases?.find(l => l.id === loanId);
      if (!loan) return;

      const updatedLoans = customer.loanPurchases?.map(l => {
        if (l.id === loanId) {
          const newPaid = (l.paid || 0) + (payAmount || 0);
          return { ...l, paid: newPaid, remaining: l.amount - newPaid };
        }
        return l;
      }) || [];

      const totalLoanBalance = updatedLoans.reduce((sum, loan) => sum + loan.remaining, 0);

      await db.customers.update(customer.id!, {
        loanPurchases: updatedLoans,
        loanBalance: totalLoanBalance
      });

      // Sync updated customer to cloud
      const updatedCustomer = await db.customers.get(customer.id!);
      if (updatedCustomer) {
        await syncService.pushCustomerInstant(updatedCustomer);
      }

      toast({
        title: 'Success',
        description: 'Payment recorded successfully'
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to record payment',
        variant: 'destructive'
      });
    }
  };

  const handleViewPurchaseHistory = async (customer: Customer) => {
    if (!customer.id) return;
    
    const sales = await db.sales
      .where('customerId')
      .equals(customer.id)
      .reverse()
      .sortBy('timestamp');
    
    setCustomerSales(sales);
    setSelectedCustomer(customer);
    setIsPurchaseHistoryOpen(true);
  };

  const handlePrintSale = async (sale: Sale) => {
    if (!settings) return;
    
    try {
      await printReceipt(sale, settings);
      toast({
        title: 'Success',
        description: 'Receipt sent to printer'
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to print receipt',
        variant: 'destructive'
      });
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 sm:mb-8 gap-4">
        <h1 className="text-2xl sm:text-3xl font-bold">Customers</h1>
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) resetForm();
        }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Customer
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingCustomer ? 'Edit Customer' : 'Add New Customer'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="phone">Phone *</Label>
                <Input
                  id="phone"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: e.target.value})}
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                />
              </div>
              
              <div>
                <Label htmlFor="notes">Notes</Label>
                <Input
                  id="notes"
                  value={formData.notes || ''}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder="Add any notes about this customer"
                />
              </div>
              
              <Button type="submit" className="w-full">
                {editingCustomer ? 'Update Customer' : 'Add Customer'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <Card className="mb-4 sm:mb-6">
        <CardContent className="pt-4 sm:pt-6">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name or phone..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </CardContent>
      </Card>

      {/* Customers List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="w-5 h-5" />
            Customer List ({filteredCustomers?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredCustomers && filteredCustomers.length > 0 ? (
            <div className="space-y-4">
              {filteredCustomers.map((customer) => (
                  <div key={customer.id} className="p-4 sm:p-6 bg-card rounded-lg border">
                  <div className="flex flex-col sm:flex-row justify-between items-start gap-3 mb-4">
                    <div className="flex-1">
                      <h3 className="text-base sm:text-lg font-semibold">{customer.name}</h3>
                      <p className="text-xs sm:text-sm text-muted-foreground">{customer.phone}</p>
                      {customer.email && <p className="text-xs sm:text-sm text-muted-foreground">{customer.email}</p>}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" variant="outline" onClick={() => handleEdit(customer)}>
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => handleDelete(customer.id!)}>
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-muted-foreground">Loyalty Points</p>
                      <p className="font-medium">{customer.loyaltyPoints || 0}</p>
                    </div>
                    <div className="flex flex-col gap-1">
                      <p className="text-muted-foreground">Total Purchases</p>
                      <div className="flex items-center justify-between">
                        <p className="font-medium">{customer.totalPurchases?.toFixed(2) || '0.00'}</p>
                        <Button 
                          size="sm" 
                          variant="ghost"
                          className="h-6 px-2 text-xs"
                          onClick={() => handleViewPurchaseHistory(customer)}
                        >
                          <Receipt className="w-3 h-3 mr-1" />
                          View Bills
                        </Button>
                      </div>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Loan Balance</p>
                      <p className="font-medium text-destructive">{customer.loanBalance?.toFixed(2) || '0.00'}</p>
                    </div>
                  </div>
                  
                  {/* Loan Purchases */}
                  {customer.loanPurchases && customer.loanPurchases.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <h4 className="font-medium text-sm">Loan Purchases</h4>
                      {customer.loanPurchases.map((loan) => (
                        <div key={loan.id} className="p-3 bg-muted rounded-md text-sm space-y-1">
                          <div className="flex justify-between">
                            <span className="font-medium">{loan.items}</span>
                            <span className="text-destructive">{loan.remaining.toFixed(2)}</span>
                          </div>
                          <div className="text-muted-foreground text-xs">
                            {new Date(loan.date).toLocaleDateString()} - 
                            Total: {loan.amount.toFixed(2)} | Paid: {loan.paid.toFixed(2)}
                          </div>
                          {loan.remaining > 0 && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                const amount = parseFloat(prompt(`Enter payment amount (Remaining: ${loan.remaining.toFixed(2)})`) || '0');
                                if (amount > 0 && amount <= loan.remaining) {
                                  handlePayLoan(customer, loan.id, amount);
                                }
                              }}
                            >
                              Pay
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full mt-4"
                    onClick={() => {
                      setSelectedCustomer(customer);
                      setIsLoanDialogOpen(true);
                    }}
                  >
                    <DollarSign className="w-4 h-4 mr-2" />
                    Add Loan Purchase
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground">
              <Users className="w-16 h-16 mx-auto mb-4 opacity-50" />
              <p className="text-lg">No customers found</p>
              <p className="text-sm mt-2">Add your first customer to get started</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loan Purchase Dialog */}
      <Dialog open={isLoanDialogOpen} onOpenChange={(open) => {
        setIsLoanDialogOpen(open);
        if (!open) {
          setLoanData({ items: '', amount: 0, paid: 0 });
          setSelectedCustomer(null);
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Loan Purchase</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Items/Description</Label>
              <Textarea
                placeholder="Describe the items purchased"
                value={loanData.items}
                onChange={(e) => setLoanData({ ...loanData, items: e.target.value })}
              />
            </div>
            <div>
              <Label>Total Amount</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={loanData.amount || ''}
                onChange={(e) => setLoanData({ ...loanData, amount: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div>
              <Label>Amount Paid Now</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                max={loanData.amount}
                value={loanData.paid || ''}
                onChange={(e) => setLoanData({ ...loanData, paid: parseFloat(e.target.value) || 0 })}
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsLoanDialogOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddLoan}>
                Add Loan Purchase
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Purchase History Dialog */}
      <Dialog open={isPurchaseHistoryOpen} onOpenChange={setIsPurchaseHistoryOpen}>
        <DialogContent className="max-w-3xl max-h-[80vh] w-[95vw]">
          <DialogHeader>
            <DialogTitle className="text-base sm:text-lg">
              Purchase History - {selectedCustomer?.name}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="h-[60vh] pr-2 sm:pr-4">
            {customerSales.length > 0 ? (
              <div className="space-y-4">
                {customerSales.map((sale) => (
                  <Card key={sale.id}>
                    <CardContent className="pt-6">
                      <div className="flex justify-between items-start mb-4">
                        <div className="space-y-1">
                          <p className="text-sm text-muted-foreground">
                            {sale.timestamp.toLocaleString()}
                          </p>
                          <p className="text-sm">
                            <span className="text-muted-foreground">Cashier:</span> {sale.cashier}
                          </p>
                          <p className="text-sm">
                            <span className="text-muted-foreground">Payment:</span> {sale.paymentMethod}
                          </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <p className="text-lg font-bold">
                            ${sale.total.toFixed(2)}
                          </p>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handlePrintSale(sale)}
                          >
                            <Printer className="w-4 h-4 mr-1" />
                            Print
                          </Button>
                        </div>
                      </div>
                      
                      <div className="border-t pt-3">
                        <p className="text-sm font-semibold mb-2">Items:</p>
                        <div className="space-y-2">
                          {sale.items.map((item, idx) => (
                            <div key={idx} className="space-y-1">
                              <div className="flex justify-between text-sm">
                                <span className="text-muted-foreground">
                                  {item.name} x {item.quantity} {item.unit || 'pc'}
                                  {item.discountPercent && item.discountPercent > 0 && (
                                    <span className="ml-2 text-xs text-success">
                                      ({item.discountPercent}% off)
                                    </span>
                                  )}
                                  {item.discountAmount && item.discountAmount > 0 && (
                                    <span className="ml-2 text-xs text-success">
                                      (-${item.discountAmount.toFixed(2)})
                                    </span>
                                  )}
                                </span>
                                <span className="font-medium">${item.total.toFixed(2)}</span>
                              </div>
                              <div className="flex justify-between text-xs text-muted-foreground">
                                <span>@ ${item.price.toFixed(2)} each</span>
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        <div className="border-t mt-3 pt-3 space-y-1">
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Subtotal:</span>
                            <span>${sale.subtotal.toFixed(2)}</span>
                          </div>
                          {sale.discount > 0 && (
                            <div className="flex justify-between text-sm">
                              <span className="text-muted-foreground">Discount:</span>
                              <span className="text-destructive">-${sale.discount.toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-sm">
                            <span className="text-muted-foreground">Tax:</span>
                            <span>${sale.tax.toFixed(2)}</span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                No purchase history found for this customer
              </div>
            )}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Customers;
