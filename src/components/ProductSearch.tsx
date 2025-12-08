import { useState, useEffect, useRef } from 'react';
import { db, Product } from '@/lib/db';
import { Input } from '@/components/ui/input';
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from '@/components/ui/command';
import { useLiveQuery } from 'dexie-react-hooks';

interface ProductSearchProps {
  onSelectProduct: (product: Product) => void;
}

export const ProductSearch = ({ onSelectProduct }: ProductSearchProps) => {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const products = useLiveQuery(
    () => {
      if (!search.trim()) return [];
      return db.products
        .filter(p => 
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          p.barcode.includes(search) ||
          p.category.toLowerCase().includes(search.toLowerCase())
        )
        .limit(10)
        .toArray();
    },
    [search]
  );

  useEffect(() => {
    if (products && products.length > 0) {
      setOpen(true);
    } else {
      setOpen(false);
    }
  }, [products]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!products || products.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex(prev => (prev + 1) % products.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex(prev => (prev - 1 + products.length) % products.length);
    } else if (e.key === 'Enter' && products[selectedIndex]) {
      e.preventDefault();
      onSelectProduct(products[selectedIndex]);
      setSearch('');
      setOpen(false);
      setSelectedIndex(0);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  const handleSelect = (product: Product) => {
    onSelectProduct(product);
    setSearch('');
    setOpen(false);
    setSelectedIndex(0);
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        placeholder="Search product by name, barcode, or category..."
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setSelectedIndex(0);
        }}
        onKeyDown={handleKeyDown}
        className="text-lg"
        autoFocus
      />
      
      {open && products && products.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg">
          <Command>
            <CommandList>
              <CommandGroup>
                {products.map((product, index) => (
                  <CommandItem
                    key={product.id}
                    onSelect={() => handleSelect(product)}
                    className={index === selectedIndex ? 'bg-accent' : ''}
                  >
                    <div className="flex justify-between w-full">
                      <div>
                        <div className="font-semibold">{product.name}</div>
                        <div className="text-sm text-muted-foreground">
                          {product.barcode} • {product.category} • Stock: {product.stock} {product.unit}
                        </div>
                      </div>
                      <div className="font-bold text-primary">
                        {product.sellingPrice.toFixed(2)}
                      </div>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </div>
      )}
    </div>
  );
};
