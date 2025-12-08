import { Sale, Settings } from '@/lib/db';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, X } from 'lucide-react';
import { printReceipt } from './Receipt';
import { Separator } from '@/components/ui/separator';

interface ReceiptDialogProps {
  sale: Sale | null;
  settings: Settings;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ReceiptDialog = ({ sale, settings, open, onOpenChange }: ReceiptDialogProps) => {
  if (!sale) return null;

  const handlePrint = async () => {
    await printReceipt(sale, settings);
  };

  // Helper function to convert units for display
  const getDisplayUnit = (quantity: number, unit?: string) => {
    if (!unit) return { qty: quantity, unit: 'pc' };
    
    const lowerUnit = unit.toLowerCase();
    
    // KG to g conversion
    if (lowerUnit.includes('kg') || lowerUnit === 'kilogram') {
      if (quantity < 1) {
        return { qty: quantity * 1000, unit: 'g' };
      }
      return { qty: quantity, unit: 'kg' };
    }
    
    // L to ml conversion
    if (lowerUnit.includes('l') || lowerUnit === 'liter' || lowerUnit === 'litre') {
      if (quantity < 1) {
        return { qty: quantity * 1000, unit: 'ml' };
      }
      return { qty: quantity, unit: 'L' };
    }
    
    // Bottle conversion
    if (lowerUnit.includes('bottle')) {
      if (quantity === 0.5) {
        return { qty: quantity, unit: 'half bottle' };
      }
      return { qty: quantity, unit: 'bottle' };
    }
    
    return { qty: quantity, unit: unit };
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-center text-2xl">Receipt</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Store Name */}
          <div className="text-center">
            <h2 className="text-xl font-bold">{settings.storeName}</h2>
            <p className="text-sm text-muted-foreground mt-1">{settings.receiptHeader}</p>
          </div>

          <Separator />

          {/* Date and Cashier */}
          <div className="text-sm space-y-1">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Date:</span>
              <span>{sale.timestamp.toLocaleString()}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cashier:</span>
              <span>{sale.cashier}</span>
            </div>
          </div>

          <Separator />

          {/* Items */}
          <div className="space-y-3">
            <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-muted-foreground">
              <div className="col-span-5">Item</div>
              <div className="col-span-2 text-right">Qty</div>
              <div className="col-span-2 text-right">Price</div>
              <div className="col-span-3 text-right">Total</div>
            </div>
            
            {sale.items.map((item, index) => {
              const displayUnit = getDisplayUnit(item.quantity, item.unit);
              const itemSubtotal = item.quantity * item.price;
              const itemDiscount = item.discountType === 'percent' 
                ? itemSubtotal * ((item.discountPercent || 0) / 100)
                : (item.discountAmount || 0);
              
              return (
                <div key={index} className="space-y-1">
                  <div className="grid grid-cols-12 gap-2 text-sm">
                    <div className="col-span-5 truncate" title={item.name}>
                      {item.name}
                    </div>
                    <div className="col-span-2 text-right">
                      {displayUnit.qty} {displayUnit.unit}
                    </div>
                    <div className="col-span-2 text-right">
                      {item.price.toFixed(2)}
                    </div>
                    <div className="col-span-3 text-right font-semibold">
                      {item.total.toFixed(2)}
                    </div>
                  </div>
                  
                  {itemDiscount > 0 && (
                    <div className="text-xs text-success pl-1">
                      Discount: -{settings.currency} {itemDiscount.toFixed(2)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <Separator />

          {/* Totals */}
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal:</span>
              <span className="font-semibold">{settings.currency} {sale.subtotal.toFixed(2)}</span>
            </div>
            
            {sale.discount > 0 && (
              <div className="flex justify-between text-success">
                <span>Discount:</span>
                <span className="font-semibold">-{settings.currency} {sale.discount.toFixed(2)}</span>
              </div>
            )}
            
            <div className="flex justify-between">
              <span className="text-muted-foreground">Tax:</span>
              <span className="font-semibold">{settings.currency} {sale.tax.toFixed(2)}</span>
            </div>
          </div>

          <Separator />

          {/* Total */}
          <div className="flex justify-between text-lg font-bold">
            <span>TOTAL:</span>
            <span className="text-primary">{settings.currency} {sale.total.toFixed(2)}</span>
          </div>

          {/* Payment Info */}
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Payment:</span>
              <span className="font-semibold uppercase">{sale.paymentMethod}</span>
            </div>
            
            {sale.change > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Change:</span>
                <span className="font-semibold">{settings.currency} {sale.change.toFixed(2)}</span>
              </div>
            )}
          </div>

          <Separator />

          {/* Footer */}
          <div className="text-center text-sm text-muted-foreground">
            {settings.receiptFooter}
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 pt-2">
            <Button 
              variant="outline" 
              className="flex-1"
              onClick={() => onOpenChange(false)}
            >
              <X className="w-4 h-4 mr-2" />
              Close
            </Button>
            <Button 
              className="flex-1"
              onClick={handlePrint}
            >
              <Printer className="w-4 h-4 mr-2" />
              Print
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
