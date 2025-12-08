import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, Product, SaleItem, Sale } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Scan, Plus, Minus, Trash2, DollarSign, CreditCard, Printer, LogOut, Percent, Hash } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Label } from '@/components/ui/label';
import { ProductSearch } from '@/components/ProductSearch';
import { ReceiptDialog } from '@/components/ReceiptDialog';
import { useNavigate } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const Sales = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [discountPercent, setDiscountPercent] = useState(0);
  const [discountAmount, setDiscountAmount] = useState(0);
  const [discountType, setDiscountType] = useState<'percent' | 'amount'>('percent');
  const [taxRate, setTaxRate] = useState(10);
  const [currency, setCurrency] = useState('USD');
  const [cashierName, setCashierName] = useState('');
  const [completedSale, setCompletedSale] = useState<Sale | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<number | null>(null);
  const [customerSearch, setCustomerSearch] = useState('');
  
  const settings = useLiveQuery(() => db.settings.toArray());
  const quickQuantities = useLiveQuery(() => db.quickQuantities.toArray());
  const customers = useLiveQuery(() => db.customers.toArray());

  const filteredCustomers = customers?.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phone.includes(customerSearch)
  ) || [];

  useEffect(() => {
    const cashierData = localStorage.getItem('cashier');
    if (!cashierData) {
      navigate('/login');
      return;
    }
    const cashier = JSON.parse(cashierData);
    setCashierName(cashier.name);
  }, [navigate]);

  useEffect(() => {
    if (settings && settings.length > 0) {
      setTaxRate(settings[0].taxRate);
      setCurrency(settings[0].currency);
    }
  }, [settings]);

  const handleLogout = () => {
    localStorage.removeItem('cashier');
    navigate('/login');
  };

  const getStepSize = (unit?: string) => {
    const weightVolumeUnits = ['kg', 'g', 'l', 'ml', 'lb', 'oz', 'liter', 'litre', 'kilogram', 'gram'];
    return unit && weightVolumeUnits.some(u => unit.toLowerCase().includes(u)) ? 0.25 : 1;
  };

  const addToCart = (product: Product) => {
    const existingItem = cart.find(item => item.productId === product.id);
    const step = getStepSize(product.unit);
    
    // Check for active discount
    let finalPrice = product.sellingPrice;
    if (product.discountPercent && product.discountPercent > 0) {
      const now = new Date();
      const start = product.discountStartDate ? new Date(product.discountStartDate) : null;
      const end = product.discountEndDate ? new Date(product.discountEndDate) : null;
      
      const isDiscountActive = (!start || now >= start) && (!end || now <= end);
      
      if (isDiscountActive) {
        finalPrice = product.sellingPrice * (1 - product.discountPercent / 100);
      }
    }
    
    if (existingItem) {
      if (existingItem.quantity >= (product.stock || 0)) {
        toast({
          title: 'Insufficient stock',
          description: `Only ${product.stock} units available`,
          variant: 'destructive'
        });
        return;
      }
      
      setCart(cart.map(item =>
        item.productId === product.id
          ? { ...item, quantity: item.quantity + step, total: (item.quantity + step) * item.price }
          : item
      ));
    } else {
      if (!product.stock || product.stock < 1) {
        toast({
          title: 'Out of stock',
          description: 'This product is currently out of stock',
          variant: 'destructive'
        });
        return;
      }
      
      setCart([...cart, {
        productId: product.id!,
        barcode: product.barcode,
        name: product.name,
        price: finalPrice,
        quantity: step,
        total: finalPrice * step,
        unit: product.unit
      }]);
    }
  };

  const updateQuantity = (productId: number, newQuantity: number) => {
    // Allow 0 as minimum, clamp negatives to 0
    const safeQty = Math.max(0, Number.isFinite(newQuantity) ? newQuantity : 0);
    setCart(cart.map(item => {
      if (item.productId === productId) {
        const itemSubtotal = safeQty * item.price;
        const discountAmount = item.discountType === 'percent'
          ? itemSubtotal * ((item.discountPercent || 0) / 100)
          : Math.min(item.discountAmount || 0, itemSubtotal);
        const total = itemSubtotal - discountAmount;
        return { ...item, quantity: safeQty, total };
      }
      return item;
    }));
  };
  const updateItemDiscount = (productId: number, type: 'percent' | 'amount', value: number) => {
    setCart(cart.map(item => {
      if (item.productId === productId) {
        const itemSubtotal = item.quantity * item.price;
        const discountAmount = type === 'percent' 
          ? itemSubtotal * (value / 100)
          : Math.min(value, itemSubtotal);
        const total = itemSubtotal - discountAmount;
        return { 
          ...item, 
          discountType: type,
          discountPercent: type === 'percent' ? value : 0,
          discountAmount: type === 'amount' ? value : 0,
          total 
        };
      }
      return item;
    }));
  };

  const removeFromCart = (productId: number) => {
    setCart(cart.filter(item => item.productId !== productId));
  };

  const calculateTotals = () => {
    const subtotal = cart.reduce((sum, item) => sum + item.total, 0);
    const finalDiscountAmount = discountType === 'percent' 
      ? subtotal * (discountPercent / 100)
      : Math.min(discountAmount, subtotal);
    const taxableAmount = subtotal - finalDiscountAmount;
    const tax = taxableAmount * (taxRate / 100);
    const total = taxableAmount + tax;
    
    return { subtotal, discountAmount: finalDiscountAmount, tax, total };
  };

  const { subtotal, discountAmount: finalDiscountAmount, tax, total } = calculateTotals();

  const handlePayment = async (method: 'cash' | 'card') => {
    if (cart.length === 0) {
      toast({
        title: 'Empty cart',
        description: 'Add items to cart before checkout',
        variant: 'destructive'
      });
      return;
    }

    try {
      const customer = selectedCustomer ? await db.customers.get(selectedCustomer) : null;
      
      const saleData = {
        items: cart,
        subtotal,
        tax,
        discount: finalDiscountAmount,
        total,
        paymentMethod: method,
        amountPaid: total,
        change: 0,
        customerId: selectedCustomer || undefined,
        customerName: customer?.name,
        cashier: cashierName,
        timestamp: new Date(),
        printCount: 0,
        printHistory: []
      };

      // Add sale
      const saleId = await db.sales.add(saleData);

      // Update stock
      for (const item of cart) {
        const product = await db.products.get(item.productId);
        if (product) {
          await db.products.update(item.productId, {
            stock: (product.stock || 0) - item.quantity
          });
        }
      }

      // Update customer
      if (customer) {
        await db.customers.update(selectedCustomer!, {
          totalPurchases: (customer.totalPurchases || 0) + total,
          loyaltyPoints: (customer.loyaltyPoints || 0) + Math.floor(total)
        });
      }

      toast({
        title: 'Sale completed',
        description: `Payment of ${currency} ${total.toFixed(2)} processed successfully`
      });

      // Show receipt dialog
      setCompletedSale({ ...saleData, id: saleId });
      setShowReceipt(true);

      // Reset cart
      setCart([]);
      setDiscountPercent(0);
      setDiscountAmount(0);
      setSelectedCustomer(null);
      setCustomerSearch('');
      
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to process sale',
        variant: 'destructive'
      });
    }
  };

  return (
    <div className="flex flex-col lg:flex-row h-screen bg-background">
      {/* Mobile: Tabs View */}
      <div className="flex-1 lg:hidden overflow-auto">
        <div className="p-4">
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-2xl font-bold">Point of Sale</h1>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
          
          <Tabs defaultValue="products" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="products">Products</TabsTrigger>
              <TabsTrigger value="checkout">
                Checkout {cart.length > 0 && `(${cart.length})`}
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="products" className="mt-0">
              {/* Product Search */}
              <Card className="mb-4">
                <CardHeader className="p-4">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Scan className="w-4 h-4 text-primary" />
                    Search Product
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <ProductSearch onSelectProduct={addToCart} />
                </CardContent>
              </Card>

              {/* Cart Items */}
              <Card>
                <CardHeader className="p-4">
                  <CardTitle className="text-base">Cart Items ({cart.length})</CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  {cart.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      <p>Cart is empty. Scan items to add them.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {cart.map((item) => {
                        const step = getStepSize(item.unit);
                        const isWeightVolume = step < 1;
                        
                        return (
                        <div key={item.productId} className="p-3 bg-secondary rounded-lg space-y-2">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <h4 className="font-semibold text-sm">{item.name}</h4>
                                <p className="text-xs text-muted-foreground">{item.barcode}</p>
                                <p className="text-xs font-medium text-primary">
                                  {currency} {item.price.toFixed(2)} per {item.unit || 'unit'}
                                </p>
                              </div>
                              
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => removeFromCart(item.productId)}
                              >
                                <Trash2 className="w-4 h-4 text-destructive" />
                              </Button>
                            </div>
                            
                            <div className="flex items-center gap-2 flex-wrap">
                              <div className="flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateQuantity(item.productId, item.quantity - step)}
                                  className="h-8 w-8 p-0"
                                >
                                  <Minus className="w-3 h-3" />
                                </Button>
                                
                                <Input
                                  type="text"
                                  value={item.quantity}
                                  onChange={(e) => {
                                    const val = e.target.value;
                                    if (val === '' || val === '.' || val === '0' || /^[0-9]*\.?[0-9]*$/.test(val)) {
                                      const num = val.startsWith('.') ? parseFloat('0' + val) : parseFloat(val);
                                      if (!isNaN(num) && num >= 0) {
                                        updateQuantity(item.productId, num);
                                      }
                                    }
                                  }}
                                  onBlur={(e) => {
                                    const val = e.target.value;
                                    const num = val.startsWith('.') ? parseFloat('0' + val) : parseFloat(val);
                                    if (isNaN(num) || num < 0) {
                                      updateQuantity(item.productId, 0);
                                    } else {
                                      updateQuantity(item.productId, num);
                                    }
                                  }}
                                  className="w-16 text-center h-8 text-sm"
                                />
                                
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => updateQuantity(item.productId, item.quantity + step)}
                                  className="h-8 w-8 p-0"
                                >
                                  <Plus className="w-3 h-3" />
                                </Button>
                              </div>
                              
                              <div className="ml-auto text-right font-bold text-sm">
                                {currency} {item.total.toFixed(2)}
                              </div>
                            </div>

                            {/* Item Discount */}
                            <div className="flex items-center gap-2 pt-2 border-t border-border">
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant={item.discountType === 'percent' ? 'default' : 'outline'}
                                  onClick={() => updateItemDiscount(item.productId, 'percent', item.discountPercent || 0)}
                                  className="h-6 px-2"
                                >
                                  <Percent className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant={item.discountType === 'amount' ? 'default' : 'outline'}
                                  onClick={() => updateItemDiscount(item.productId, 'amount', item.discountAmount || 0)}
                                  className="h-6 px-2"
                                >
                                  <Hash className="w-3 h-3" />
                                </Button>
                              </div>
                              
                              <Input
                                type="number"
                                min="0"
                                max={item.discountType === 'percent' ? 100 : item.quantity * item.price}
                                value={item.discountType === 'percent' ? (item.discountPercent || 0) : (item.discountAmount || 0)}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0;
                                  updateItemDiscount(item.productId, item.discountType || 'percent', val);
                                }}
                                placeholder="Discount"
                                className="h-6 w-16 text-xs"
                              />
                              
                              {(item.discountPercent || item.discountAmount) && (
                                <span className="text-xs text-success">
                                  -{currency} {(item.discountType === 'percent' 
                                    ? (item.quantity * item.price) * ((item.discountPercent || 0) / 100)
                                    : (item.discountAmount || 0)).toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="checkout" className="mt-0">
              <CheckoutPanel
                cart={cart}
                currency={currency}
                customerSearch={customerSearch}
                setCustomerSearch={setCustomerSearch}
                filteredCustomers={filteredCustomers}
                selectedCustomer={selectedCustomer}
                setSelectedCustomer={setSelectedCustomer}
                customers={customers}
                discountType={discountType}
                setDiscountType={setDiscountType}
                discountPercent={discountPercent}
                setDiscountPercent={setDiscountPercent}
                discountAmount={discountAmount}
                setDiscountAmount={setDiscountAmount}
                subtotal={subtotal}
                finalDiscountAmount={finalDiscountAmount}
                taxRate={taxRate}
                tax={tax}
                total={total}
                handlePayment={handlePayment}
                setCart={setCart}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Desktop: Side by Side */}
      <div className="hidden lg:flex flex-1 p-4 sm:p-6 lg:p-8 overflow-auto flex-col">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6 gap-3">
          <h1 className="text-2xl sm:text-3xl font-bold">Point of Sale</h1>
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="text-xs sm:text-sm text-muted-foreground">Cashier: {cashierName}</span>
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="w-3 h-3 sm:w-4 sm:h-4 sm:mr-2" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>

        {/* Product Search */}
        <Card className="mb-4 sm:mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
              <Scan className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
              Search Product
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ProductSearch onSelectProduct={addToCart} />
          </CardContent>
        </Card>

        {/* Cart Items */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base sm:text-lg">Cart Items ({cart.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {cart.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>Cart is empty. Scan items to add them.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {cart.map((item) => {
                  const step = getStepSize(item.unit);
                  const isWeightVolume = step < 1;
                  
                  return (
                  <div key={item.productId} className="p-4 bg-secondary rounded-lg space-y-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="font-semibold">{item.name}</h4>
                          <p className="text-sm text-muted-foreground">{item.barcode}</p>
                          <p className="text-sm font-medium text-primary">
                            {currency} {item.price.toFixed(2)} per {item.unit || 'unit'}
                          </p>
                        </div>
                        
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeFromCart(item.productId)}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                      
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateQuantity(item.productId, item.quantity - step)}
                          >
                            <Minus className="w-4 h-4" />
                          </Button>
                          
                          <Input
                            type="text"
                            value={item.quantity}
                            onChange={(e) => {
                              const val = e.target.value;
                              // Allow typing decimal point and numbers
                              if (val === '' || val === '.' || val === '0' || /^[0-9]*\.?[0-9]*$/.test(val)) {
                                const num = val.startsWith('.') ? parseFloat('0' + val) : parseFloat(val);
                                if (!isNaN(num) && num >= 0) {
                                  updateQuantity(item.productId, num);
                                } else if (val === '' || val === '.' || val === '0') {
                                  // Allow temporary empty/partial states while typing
                                  return;
                                }
                              }
                            }}
                            onBlur={(e) => {
                              // On blur, ensure valid number (allow 0)
                              const val = e.target.value;
                              const num = val.startsWith('.') ? parseFloat('0' + val) : parseFloat(val);
                              if (isNaN(num) || num < 0) {
                                updateQuantity(item.productId, 0);
                              } else {
                                updateQuantity(item.productId, num);
                              }
                            }}
                            className="w-24 text-center"
                          />
                          
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => updateQuantity(item.productId, item.quantity + step)}
                          >
                            <Plus className="w-4 h-4" />
                          </Button>
                        </div>
                        
                        {quickQuantities && quickQuantities.length > 0 && (
                          <Select
                            value=""
                            onValueChange={(value) => updateQuantity(item.productId, parseFloat(value))}
                          >
                            <SelectTrigger className="w-28 h-9">
                              <SelectValue placeholder="Quick" />
                            </SelectTrigger>
                            <SelectContent>
                              {quickQuantities.map((qq) => (
                                <SelectItem key={qq.id} value={qq.value.toString()}>
                                  {qq.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        
                        {isWeightVolume && (
                          <div className="flex gap-1">
                            {[0.25, 0.5, 0.75, 1].map((qty) => (
                              <Button
                                key={qty}
                                size="sm"
                                variant="outline"
                                onClick={() => updateQuantity(item.productId, qty)}
                                className="h-8 px-2 text-xs"
                              >
                                {qty}
                              </Button>
                            ))}
                          </div>
                        )}
                        
                        <div className="ml-auto text-right font-bold">
                          {currency} {item.total.toFixed(2)}
                        </div>
                      </div>

                      {/* Item Discount */}
                      <div className="flex items-center gap-2 pt-2 border-t border-border">
                        <div className="flex gap-1">
                          <Button
                            size="sm"
                            variant={item.discountType === 'percent' ? 'default' : 'outline'}
                            onClick={() => updateItemDiscount(item.productId, 'percent', item.discountPercent || 0)}
                            className="h-7 px-2"
                          >
                            <Percent className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant={item.discountType === 'amount' ? 'default' : 'outline'}
                            onClick={() => updateItemDiscount(item.productId, 'amount', item.discountAmount || 0)}
                            className="h-7 px-2"
                          >
                            <Hash className="w-3 h-3" />
                          </Button>
                        </div>
                        
                        <Input
                          type="number"
                          min="0"
                          max={item.discountType === 'percent' ? 100 : item.quantity * item.price}
                          value={item.discountType === 'percent' ? (item.discountPercent || 0) : (item.discountAmount || 0)}
                          onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            updateItemDiscount(item.productId, item.discountType || 'percent', val);
                          }}
                          placeholder="Discount"
                          className="h-7 w-20 text-xs"
                        />
                        
                        {(item.discountPercent || item.discountAmount) && (
                          <span className="text-xs text-success">
                            -{currency} {(item.discountType === 'percent' 
                              ? (item.quantity * item.price) * ((item.discountPercent || 0) / 100)
                              : (item.discountAmount || 0)).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

        {/* Right: Checkout Panel */}
        <div className="hidden lg:flex w-full lg:w-96 bg-card border-t lg:border-t-0 lg:border-l border-border p-4 sm:p-6 flex-col">
          <CheckoutPanel
            cart={cart}
            currency={currency}
            customerSearch={customerSearch}
            setCustomerSearch={setCustomerSearch}
            filteredCustomers={filteredCustomers}
            selectedCustomer={selectedCustomer}
            setSelectedCustomer={setSelectedCustomer}
            customers={customers}
            discountType={discountType}
            setDiscountType={setDiscountType}
            discountPercent={discountPercent}
            setDiscountPercent={setDiscountPercent}
            discountAmount={discountAmount}
            setDiscountAmount={setDiscountAmount}
            subtotal={subtotal}
            finalDiscountAmount={finalDiscountAmount}
            taxRate={taxRate}
            tax={tax}
            total={total}
            handlePayment={handlePayment}
            setCart={setCart}
          />
        </div>

      {/* Receipt Dialog */}
      {settings && settings.length > 0 && (
        <ReceiptDialog 
          sale={completedSale}
          settings={settings[0]}
          open={showReceipt}
          onOpenChange={setShowReceipt}
        />
      )}
    </div>
  );
};

// Checkout Panel Component
const CheckoutPanel = ({ 
  cart, 
  currency, 
  customerSearch, 
  setCustomerSearch, 
  filteredCustomers, 
  selectedCustomer, 
  setSelectedCustomer, 
  customers,
  discountType,
  setDiscountType,
  discountPercent,
  setDiscountPercent,
  discountAmount,
  setDiscountAmount,
  subtotal,
  finalDiscountAmount,
  taxRate,
  tax,
  total,
  handlePayment,
  setCart,
}: any) => {
  return (
    <>
      <h2 className="text-xl sm:text-2xl font-bold mb-4 sm:mb-6">Checkout</h2>

      {/* Customer Selection */}
          <div className="mb-2 sm:mb-3 space-y-1.5">
            <Label className="text-xs sm:text-sm">Customer (Optional)</Label>
            <Input
              placeholder="Search by name or phone..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
              className="h-8 text-sm"
            />
            {customerSearch && filteredCustomers.length > 0 && (
              <div className="max-h-32 overflow-auto border rounded-md">
                {filteredCustomers.map((customer) => (
                  <div
                    key={customer.id}
                    className={`p-2 cursor-pointer hover:bg-accent ${selectedCustomer === customer.id ? 'bg-accent' : ''}`}
                    onClick={() => {
                      setSelectedCustomer(customer.id!);
                      setCustomerSearch(customer.name);
                    }}
                  >
                    <div className="font-medium">{customer.name}</div>
                    <div className="text-sm text-muted-foreground">{customer.phone}</div>
                  </div>
                ))}
              </div>
            )}
            {selectedCustomer && (
              <>
                {/* Customer Info Card with inline Clear button */}
                {customers?.find(c => c.id === selectedCustomer) && (() => {
                  const customer = customers.find(c => c.id === selectedCustomer)!;
                  return (
                    <div className="flex gap-2 items-start mt-1">
                      <div className="flex-1 px-2 py-1 bg-muted/20 rounded text-xs">
                        {customer.loanBalance > 0 && (
                          <div className="flex justify-between items-center">
                            <span className="text-muted-foreground">Loan:</span>
                            <span className="font-semibold text-destructive ml-1">
                              {currency} {customer.loanBalance.toFixed(2)}
                            </span>
                          </div>
                        )}
                        {customer.notes && (
                          <div className="truncate mt-0.5">
                            <span className="text-muted-foreground">Note: </span>
                            <span>{customer.notes}</span>
                          </div>
                        )}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedCustomer(null);
                          setCustomerSearch('');
                        }}
                        className="h-7 text-xs px-2 flex-shrink-0"
                      >
                        Clear
                      </Button>
                    </div>
                  );
                })()}
              </>
            )}
          </div>

      {/* Discount */}
      <div className="mb-2 sm:mb-3">
          <Label className="text-xs sm:text-sm mb-1.5 block">Discount</Label>
          <div className="flex gap-2">
            {/* Discount Type Buttons */}
            <div className="flex gap-1.5">
              <Button
                size="sm"
                variant={discountType === 'percent' ? 'default' : 'outline'}
                onClick={() => setDiscountType('percent')}
                className="h-8 text-xs px-2"
              >
                <Percent className="w-3 h-3 mr-1" />
                %
              </Button>
              <Button
                size="sm"
                variant={discountType === 'amount' ? 'default' : 'outline'}
                onClick={() => setDiscountType('amount')}
                className="h-8 text-xs px-2"
              >
                <Hash className="w-3 h-3 mr-1" />
                {currency}
              </Button>
            </div>
            
            {/* Discount Input */}
            {discountType === 'percent' ? (
              <Input
                id="discount"
                type="number"
                min="0"
                max="100"
                placeholder="0"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)}
                className="h-8 text-sm flex-1"
              />
            ) : (
              <Input
                id="discountAmount"
                type="number"
                min="0"
                max={subtotal}
                placeholder="0"
                value={discountAmount}
                onChange={(e) => setDiscountAmount(parseFloat(e.target.value) || 0)}
                className="h-8 text-sm flex-1"
              />
            )}
          </div>
        </div>

      {/* Totals */}
      <div className="space-y-2 sm:space-y-3 mb-8 sm:mb-10">
          <div className="flex justify-between text-base sm:text-lg">
            <span>Subtotal:</span>
            <span className="font-semibold">{currency} {subtotal.toFixed(2)}</span>
          </div>
          
          {finalDiscountAmount > 0 && (
            <div className="flex justify-between text-base sm:text-lg text-success">
              <span>Discount {discountType === 'percent' ? `(${discountPercent}%)` : ''}:</span>
              <span className="font-semibold">-{currency} {finalDiscountAmount.toFixed(2)}</span>
            </div>
          )}
          
          <div className="flex justify-between text-base sm:text-lg">
            <span>Tax ({taxRate}%):</span>
            <span className="font-semibold">{currency} {tax.toFixed(2)}</span>
          </div>
          
          <Separator />
          
          <div className="flex justify-between text-xl sm:text-2xl font-bold text-primary">
            <span>Total:</span>
            <span>{currency} {total.toFixed(2)}</span>
          </div>
        </div>

      {/* Payment Buttons */}
      <div className="space-y-2 sm:space-y-3 mt-auto">
          <Button
            size="lg"
            className="w-full bg-success hover:bg-success/90 text-base sm:text-lg h-12 sm:h-14"
            onClick={() => handlePayment('cash')}
            disabled={cart.length === 0}
          >
            <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 mr-2" />
            Pay Cash
          </Button>
          
          <Button
            size="lg"
            className="w-full bg-primary hover:bg-primary/90 text-base sm:text-lg h-12 sm:h-14"
            onClick={() => handlePayment('card')}
            disabled={cart.length === 0}
          >
            <CreditCard className="w-5 h-5 sm:w-6 sm:h-6 mr-2" />
            Pay Card
          </Button>
          
          <Button
            size="lg"
            variant="outline"
            className="w-full text-base sm:text-lg h-10 sm:h-12"
            onClick={() => {
              setCart([]);
              setDiscountPercent(0);
              setDiscountAmount(0);
            }}
          >
            Clear Cart
          </Button>
      </div>
    </>
  );
};

export default Sales;
