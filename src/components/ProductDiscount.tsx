import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Percent, Calendar } from 'lucide-react';
import { db, Product } from '@/lib/db';
import { useToast } from '@/hooks/use-toast';

interface ProductDiscountProps {
  product: Product;
  onUpdate?: () => void;
}

export const ProductDiscount = ({ product, onUpdate }: ProductDiscountProps) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [discountPercent, setDiscountPercent] = useState(product.discountPercent || 0);
  const [startDate, setStartDate] = useState(
    product.discountStartDate 
      ? new Date(product.discountStartDate).toISOString().split('T')[0] 
      : ''
  );
  const [endDate, setEndDate] = useState(
    product.discountEndDate 
      ? new Date(product.discountEndDate).toISOString().split('T')[0] 
      : ''
  );

  const handleSave = async () => {
    if (!product.id) return;

    try {
      const updates: Partial<Product> = {
        discountPercent: discountPercent > 0 ? discountPercent : undefined,
        discountStartDate: startDate ? new Date(startDate) : undefined,
        discountEndDate: endDate ? new Date(endDate) : undefined,
      };

      await db.products.update(product.id, updates);
      
      toast({
        title: 'Discount updated',
        description: `Discount for ${product.name} has been updated`
      });
      
      setOpen(false);
      onUpdate?.();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to update discount',
        variant: 'destructive'
      });
    }
  };

  const handleRemove = async () => {
    if (!product.id) return;

    try {
      await db.products.update(product.id, {
        discountPercent: undefined,
        discountStartDate: undefined,
        discountEndDate: undefined,
      });
      
      toast({
        title: 'Discount removed',
        description: `Discount removed from ${product.name}`
      });
      
      setDiscountPercent(0);
      setStartDate('');
      setEndDate('');
      setOpen(false);
      onUpdate?.();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to remove discount',
        variant: 'destructive'
      });
    }
  };

  const isDiscountActive = () => {
    if (!product.discountPercent || product.discountPercent <= 0) return false;
    
    const now = new Date();
    const start = product.discountStartDate ? new Date(product.discountStartDate) : null;
    const end = product.discountEndDate ? new Date(product.discountEndDate) : null;
    
    if (start && now < start) return false;
    if (end && now > end) return false;
    
    return true;
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button 
          variant={isDiscountActive() ? "default" : "outline"} 
          size="sm"
          className="gap-2"
        >
          <Percent className="w-4 h-4" />
          {isDiscountActive() ? `${product.discountPercent}% OFF` : 'Add Discount'}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Product Discount - {product.name}</DialogTitle>
          <DialogDescription>
            Set a time-limited discount for this product
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          <div>
            <Label htmlFor="discount">Discount Percentage</Label>
            <div className="flex items-center gap-2">
              <Input
                id="discount"
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={discountPercent}
                onChange={(e) => setDiscountPercent(Number(e.target.value))}
                placeholder="Enter discount %"
              />
              <Percent className="w-4 h-4 text-muted-foreground" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="start-date">Start Date</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                />
                <Calendar className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>

            <div>
              <Label htmlFor="end-date">End Date</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                />
                <Calendar className="w-4 h-4 text-muted-foreground" />
              </div>
            </div>
          </div>

          {discountPercent > 0 && (
            <div className="bg-secondary p-3 rounded-lg">
              <p className="text-sm font-medium">Preview</p>
              <p className="text-xs text-muted-foreground mt-1">
                Original Price: {product.sellingPrice.toFixed(2)}
              </p>
              <p className="text-sm font-semibold text-primary">
                Discounted Price: {(product.sellingPrice * (1 - discountPercent / 100)).toFixed(2)}
              </p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          {product.discountPercent && (
            <Button variant="destructive" onClick={handleRemove}>
              Remove Discount
            </Button>
          )}
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave}>
            Save Discount
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
