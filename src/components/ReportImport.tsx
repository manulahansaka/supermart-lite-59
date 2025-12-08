import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Upload, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { db, Sale, SaleItem } from '@/lib/db';
import * as XLSX from 'xlsx';

export const ReportImport = () => {
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const downloadTemplate = () => {
    const templateData = [
      {
        'Date': '2024-01-15',
        'Time': '14:30:00',
        'Cashier': 'John Doe',
        'Payment Method': 'cash',
        'Product Barcode': '1234567890',
        'Product Name': 'Sample Product',
        'Quantity': 2,
        'Price': 75.00,
        'Subtotal': 150.00,
        'Tax': 15.00,
        'Discount': 0,
        'Total': 165.00,
        'Amount Paid': 200.00,
        'Change': 35.00
      },
      {
        'Date': '2024-01-15',
        'Time': '15:45:00',
        'Cashier': 'Jane Smith',
        'Payment Method': 'card',
        'Product Barcode': '0987654321',
        'Product Name': 'Rice Premium',
        'Quantity': 5,
        'Price': 200.00,
        'Subtotal': 1000.00,
        'Tax': 100.00,
        'Discount': 50,
        'Total': 1050.00,
        'Amount Paid': 1050.00,
        'Change': 0
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    ws['!cols'] = [
      { wch: 12 }, { wch: 10 }, { wch: 15 }, { wch: 15 },
      { wch: 15 }, { wch: 25 }, { wch: 10 }, { wch: 10 },
      { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
      { wch: 12 }, { wch: 10 }
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sales');

    const instructions = [
      { 'Column': 'Date', 'Description': 'Sale date (YYYY-MM-DD)', 'Example': '2024-01-15' },
      { 'Column': 'Time', 'Description': 'Sale time (HH:MM:SS)', 'Example': '14:30:00' },
      { 'Column': 'Cashier', 'Description': 'Cashier name', 'Example': 'John Doe' },
      { 'Column': 'Payment Method', 'Description': 'cash or card', 'Example': 'cash' },
      { 'Column': 'Product Barcode', 'Description': 'Product barcode (must exist)', 'Example': '1234567890' },
      { 'Column': 'Product Name', 'Description': 'Product name', 'Example': 'Rice Premium' },
      { 'Column': 'Quantity', 'Description': 'Quantity sold', 'Example': '2' },
      { 'Column': 'Price', 'Description': 'Price per unit', 'Example': '75.00' },
      { 'Column': 'Subtotal', 'Description': 'Subtotal before tax/discount', 'Example': '150.00' },
      { 'Column': 'Tax', 'Description': 'Tax amount', 'Example': '15.00' },
      { 'Column': 'Discount', 'Description': 'Discount amount', 'Example': '0' },
      { 'Column': 'Total', 'Description': 'Final total', 'Example': '165.00' },
      { 'Column': 'Amount Paid', 'Description': 'Amount customer paid', 'Example': '200.00' },
      { 'Column': 'Change', 'Description': 'Change given', 'Example': '35.00' }
    ];
    
    const wsInstructions = XLSX.utils.json_to_sheet(instructions);
    wsInstructions['!cols'] = [{ wch: 20 }, { wch: 50 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instructions');

    XLSX.writeFile(wb, 'sales_import_template.xlsx');
    
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

      const salesMap = new Map<string, any>();
      const errors: string[] = [];

      jsonData.forEach((row, index) => {
        const rowNum = index + 2;

        if (!row['Date']) {
          errors.push(`Row ${rowNum}: Date is required`);
          return;
        }
        if (!row['Time']) {
          errors.push(`Row ${rowNum}: Time is required`);
          return;
        }
        if (!row['Cashier']) {
          errors.push(`Row ${rowNum}: Cashier is required`);
          return;
        }
        if (!row['Payment Method']) {
          errors.push(`Row ${rowNum}: Payment Method is required`);
          return;
        }
        if (!['cash', 'card'].includes(row['Payment Method'].toLowerCase())) {
          errors.push(`Row ${rowNum}: Payment Method must be 'cash' or 'card'`);
          return;
        }
        if (!row['Product Barcode']) {
          errors.push(`Row ${rowNum}: Product Barcode is required`);
          return;
        }

        const dateTime = `${row['Date']}_${row['Time']}_${row['Cashier']}_${row['Payment Method']}`;
        
        if (!salesMap.has(dateTime)) {
          salesMap.set(dateTime, {
            date: row['Date'],
            time: row['Time'],
            cashier: row['Cashier'],
            paymentMethod: row['Payment Method'].toLowerCase(),
            subtotal: parseFloat(row['Subtotal'] || 0),
            tax: parseFloat(row['Tax'] || 0),
            discount: parseFloat(row['Discount'] || 0),
            total: parseFloat(row['Total'] || 0),
            amountPaid: parseFloat(row['Amount Paid'] || 0),
            change: parseFloat(row['Change'] || 0),
            items: []
          });
        }

        salesMap.get(dateTime).items.push({
          barcode: row['Product Barcode'].toString(),
          name: row['Product Name'],
          quantity: parseFloat(row['Quantity']),
          price: parseFloat(row['Price']),
          total: parseFloat(row['Quantity']) * parseFloat(row['Price'])
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

      let imported = 0;

      for (const [_, saleData] of salesMap) {
        const items: SaleItem[] = [];
        
        for (const item of saleData.items) {
          const product = await db.products.where('barcode').equals(item.barcode).first();
          
          if (!product) {
            errors.push(`Product with barcode ${item.barcode} not found`);
            continue;
          }

          items.push({
            productId: product.id!,
            barcode: item.barcode,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            total: item.total,
            unit: product.unit
          });
        }

        if (items.length > 0) {
          const timestamp = new Date(`${saleData.date}T${saleData.time}`);
          
          const sale: Sale = {
            items,
            subtotal: saleData.subtotal,
            tax: saleData.tax,
            discount: saleData.discount,
            total: saleData.total,
            paymentMethod: saleData.paymentMethod,
            amountPaid: saleData.amountPaid,
            change: saleData.change,
            cashier: saleData.cashier,
            timestamp,
            printCount: 0,
            printHistory: []
          };

          await db.sales.add(sale);
          imported++;
        }
      }

      if (errors.length > 0) {
        toast({
          title: 'Partial import',
          description: `Imported ${imported} sales with ${errors.length} errors`,
          variant: 'destructive'
        });
        console.error('Import errors:', errors);
      } else {
        toast({
          title: 'Import successful',
          description: `Imported ${imported} sales`
        });
      }

      setIsOpen(false);
      e.target.value = '';
    } catch (error) {
      console.error('Import error:', error);
      toast({
        title: 'Import failed',
        description: error instanceof Error ? error.message : 'Failed to import sales',
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
          <DialogTitle>Import Sales from Excel</DialogTitle>
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
              Fill in the template with your sales data and upload it here.
            </p>
            <div className="border-2 border-dashed border-border rounded-lg p-6 text-center">
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                disabled={isProcessing}
                className="hidden"
                id="report-file-upload"
              />
              <label htmlFor="report-file-upload" className="cursor-pointer">
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
              <li>Products must exist in database (by barcode)</li>
              <li>Date format: YYYY-MM-DD, Time format: HH:MM:SS</li>
              <li>Payment Method must be: cash or card</li>
              <li>Multiple items with same date/time/cashier will be grouped</li>
            </ul>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
