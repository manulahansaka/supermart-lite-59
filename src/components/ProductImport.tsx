import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Upload, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db, Product } from '@/lib/db';
import * as XLSX from 'xlsx';

export const ProductImport = () => {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const downloadTemplate = () => {
    // Create template data
    const templateData = [
      {
        'Barcode': '1234567890',
        'Product Name': 'Sample Product',
        'Category': 'Groceries',
        'Cost Price': 50.00,
        'Selling Price': 75.00,
        'Stock': 100,
        'Min Stock': 10,
        'Unit': 'piece',
        'Supplier': 'Sample Supplier'
      },
      {
        'Barcode': '0987654321',
        'Product Name': 'Rice (Premium)',
        'Category': 'Groceries',
        'Cost Price': 150.00,
        'Selling Price': 200.00,
        'Stock': 50,
        'Min Stock': 5,
        'Unit': 'kg',
        'Supplier': 'Rice Supplier'
      }
    ];

    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(templateData);
    
    // Set column widths
    ws['!cols'] = [
      { wch: 15 }, // Barcode
      { wch: 25 }, // Product Name
      { wch: 15 }, // Category
      { wch: 12 }, // Cost Price
      { wch: 12 }, // Selling Price
      { wch: 10 }, // Stock
      { wch: 10 }, // Min Stock
      { wch: 10 }, // Unit
      { wch: 20 }  // Supplier
    ];

    // Create workbook
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Products');

    // Add instructions sheet
    const instructions = [
      { 'Column': 'Barcode', 'Description': 'Unique product barcode (required)', 'Example': '1234567890' },
      { 'Column': 'Product Name', 'Description': 'Name of the product (required)', 'Example': 'Rice Premium' },
      { 'Column': 'Category', 'Description': 'Product category (required)', 'Example': 'Groceries' },
      { 'Column': 'Cost Price', 'Description': 'Purchase cost per unit (required, number)', 'Example': '50.00' },
      { 'Column': 'Selling Price', 'Description': 'Selling price per unit (required, number)', 'Example': '75.00' },
      { 'Column': 'Stock', 'Description': 'Current stock quantity (required, number)', 'Example': '100' },
      { 'Column': 'Min Stock', 'Description': 'Minimum stock alert level (required, number)', 'Example': '10' },
      { 'Column': 'Unit', 'Description': 'Unit of measurement: piece, kg, or g (required)', 'Example': 'piece' },
      { 'Column': 'Supplier', 'Description': 'Supplier name (optional)', 'Example': 'ABC Suppliers' }
    ];
    
    const wsInstructions = XLSX.utils.json_to_sheet(instructions);
    wsInstructions['!cols'] = [{ wch: 15 }, { wch: 50 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');

    // Download file
    XLSX.writeFile(wb, 'products_import_template.xlsx');
    
    toast({
      title: 'Template downloaded',
      description: 'Fill in the template and import it back'
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as any[];

      if (jsonData.length === 0) {
        throw new Error('No data found in the file');
      }

      // Validate and transform data
      const products: Product[] = [];
      const errors: string[] = [];
      const availableUnits = await db.units.toArray();

      jsonData.forEach((row, index) => {
        const rowNum = index + 2; // +2 for header row and 0-based index
        
        // Validate required fields
        if (!row['Barcode']) {
          errors.push(`Row ${rowNum}: Barcode is required`);
          return;
        }
        if (!row['Product Name']) {
          errors.push(`Row ${rowNum}: Product Name is required`);
          return;
        }
        if (!row['Category']) {
          errors.push(`Row ${rowNum}: Category is required`);
          return;
        }
        if (row['Cost Price'] === undefined || row['Cost Price'] === '') {
          errors.push(`Row ${rowNum}: Cost Price is required`);
          return;
        }
        if (row['Selling Price'] === undefined || row['Selling Price'] === '') {
          errors.push(`Row ${rowNum}: Selling Price is required`);
          return;
        }
        if (row['Stock'] === undefined || row['Stock'] === '') {
          errors.push(`Row ${rowNum}: Stock is required`);
          return;
        }
        if (!row['Unit']) {
          errors.push(`Row ${rowNum}: Unit is required`);
          return;
        }

        // Get unit from settings
        const unitInput = row['Unit'].toLowerCase();
        const matchedUnit = availableUnits.find(u => 
          u.name.toLowerCase() === unitInput || u.symbol.toLowerCase() === unitInput
        );
        
        if (!matchedUnit) {
          errors.push(`Row ${rowNum}: Unit '${row['Unit']}' not found in system. Please add it in Settings first.`);
          return;
        }

        // Validate numbers
        const costPrice = parseFloat(row['Cost Price']);
        const sellingPrice = parseFloat(row['Selling Price']);
        const stock = parseFloat(row['Stock']);
        const minStock = row['Min Stock'] !== undefined ? parseFloat(row['Min Stock']) : 5;

        if (isNaN(costPrice) || costPrice < 0) {
          errors.push(`Row ${rowNum}: Cost Price must be a valid positive number`);
          return;
        }
        if (isNaN(sellingPrice) || sellingPrice < 0) {
          errors.push(`Row ${rowNum}: Selling Price must be a valid positive number`);
          return;
        }
        if (isNaN(stock) || stock < 0) {
          errors.push(`Row ${rowNum}: Stock must be a valid positive number`);
          return;
        }
        if (isNaN(minStock) || minStock < 0) {
          errors.push(`Row ${rowNum}: Min Stock must be a valid positive number`);
          return;
        }

        products.push({
          barcode: row['Barcode'].toString(),
          name: row['Product Name'],
          category: row['Category'],
          costPrice,
          sellingPrice,
          stock,
          minStock,
          unit: matchedUnit.symbol,
          supplier: row['Supplier'] || '',
          createdAt: new Date(),
          updatedAt: new Date()
        });
      });

      if (errors.length > 0) {
        toast({
          title: 'Import failed',
          description: `Found ${errors.length} error(s). First error: ${errors[0]}`,
          variant: 'destructive'
        });
        console.error('Import errors:', errors);
        setIsProcessing(false);
        return;
      }

      // Import products
      let imported = 0;
      let updated = 0;

      for (const product of products) {
        // Check if product already exists by barcode
        const existing = await db.products
          .where('barcode')
          .equals(product.barcode)
          .first();

        if (existing) {
          await db.products.update(existing.id!, {
            ...product,
            updatedAt: new Date()
          });
          updated++;
        } else {
          await db.products.add(product);
          imported++;
        }
      }

      toast({
        title: 'Import successful',
        description: `Imported ${imported} new products, updated ${updated} existing products`
      });

      setIsOpen(false);
      
      // Reset file input
      e.target.value = '';
    } catch (error) {
      console.error('Import error:', error);
      toast({
        title: 'Import failed',
        description: error instanceof Error ? error.message : 'Failed to import products',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Upload className="w-4 h-4 mr-2" />
          Import Excel
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Import Products from Excel</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold">Step 1: Download Template</h3>
            <p className="text-sm text-muted-foreground">
              Download the Excel template to see the required format and example data.
            </p>
            <Button onClick={downloadTemplate} variant="outline" className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Download Template
            </Button>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold">Step 2: Upload Filled Excel</h3>
            <p className="text-sm text-muted-foreground">
              Fill in the template with your products and upload it here.
            </p>
            <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                disabled={isProcessing}
                className="hidden"
                id="file-upload"
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <Upload className="w-12 h-12 mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm font-medium">
                  {isProcessing ? 'Processing...' : 'Click to upload Excel file'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Supports .xlsx and .xls files
                </p>
              </label>
            </div>
          </div>

          <div className="bg-muted p-3 rounded-lg text-sm space-y-1">
            <p className="font-semibold">Important Notes:</p>
            <ul className="list-disc list-inside space-y-1 text-muted-foreground">
              <li>All fields except Supplier are required</li>
              <li>Unit must match one defined in Settings (name or symbol)</li>
              <li>Existing products (same barcode) will be updated</li>
              <li>Make sure all numbers are formatted correctly</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
