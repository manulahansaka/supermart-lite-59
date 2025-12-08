import { Sale, Settings, db } from '@/lib/db';
import jsPDF from 'jspdf';

export const printReceipt = async (sale: Sale, settings: Settings) => {
  // Update print count and history if sale has an ID
  if (sale.id) {
    const existingSale = await db.sales.get(sale.id);
    if (existingSale) {
      await db.sales.update(sale.id, {
        printCount: existingSale.printCount + 1,
        printHistory: [...existingSale.printHistory, new Date()]
      });
    }
  }
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: [80, 200]
  });

  let y = 10;
  const lineHeight = 5;

  // Store name
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text(settings.storeName, 40, y, { align: 'center' });
  y += lineHeight + 2;

  // Mobile numbers
  if (settings.storeMobile || settings.storeMobile2) {
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    
    if (settings.storeMobile && settings.storeMobile2) {
      doc.text(`Tel: ${settings.storeMobile} / ${settings.storeMobile2}`, 40, y, { align: 'center' });
    } else if (settings.storeMobile) {
      doc.text(`Tel: ${settings.storeMobile}`, 40, y, { align: 'center' });
    } else if (settings.storeMobile2) {
      doc.text(`Tel: ${settings.storeMobile2}`, 40, y, { align: 'center' });
    }
    y += lineHeight;
  }

  // Receipt header
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(settings.receiptHeader, 40, y, { align: 'center' });
  y += lineHeight + 3;

  // Date and cashier
  doc.setFontSize(8);
  doc.text(`Date: ${sale.timestamp.toLocaleString()}`, 5, y);
  y += lineHeight;
  doc.text(`Cashier: ${sale.cashier}`, 5, y);
  y += lineHeight + 2;

  // Line separator
  doc.text('----------------------------------------', 5, y);
  y += lineHeight;

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

  // Items
  doc.setFont('helvetica', 'bold');
  doc.text('Item', 5, y);
  doc.text('Qty', 45, y);
  doc.text('Price', 55, y);
  doc.text('Total', 68, y);
  y += lineHeight;
  
  doc.setFont('helvetica', 'normal');
  sale.items.forEach(item => {
    const name = item.name.length > 20 ? item.name.substring(0, 20) + '...' : item.name;
    const displayUnit = getDisplayUnit(item.quantity, item.unit);
    
    doc.text(name, 5, y);
    doc.text(`${displayUnit.qty} ${displayUnit.unit}`, 45, y);
    doc.text(item.price.toFixed(2), 55, y);
    y += lineHeight;
    
    // Show item discount if exists
    if ((item.discountPercent && item.discountPercent > 0) || (item.discountAmount && item.discountAmount > 0)) {
      const itemSubtotal = item.quantity * item.price;
      const itemDiscount = item.discountType === 'percent' 
        ? itemSubtotal * ((item.discountPercent || 0) / 100)
        : (item.discountAmount || 0);
      
      doc.setFontSize(7);
      doc.text(`  Discount: -${settings.currency} ${itemDiscount.toFixed(2)}`, 5, y);
      y += lineHeight - 1;
      doc.setFontSize(8);
    }
    
    doc.text(item.total.toFixed(2), 68, y);
    y += lineHeight;
  });

  y += 2;
  doc.text('----------------------------------------', 5, y);
  y += lineHeight;

  // Totals
  doc.text('Subtotal:', 5, y);
  doc.text(`${settings.currency} ${sale.subtotal.toFixed(2)}`, 55, y, { align: 'right' });
  y += lineHeight;

  if (sale.discount > 0) {
    doc.text('Discount:', 5, y);
    doc.text(`-${settings.currency} ${sale.discount.toFixed(2)}`, 55, y, { align: 'right' });
    y += lineHeight;
  }

  doc.text('Tax:', 5, y);
  doc.text(`${settings.currency} ${sale.tax.toFixed(2)}`, 55, y, { align: 'right' });
  y += lineHeight + 2;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('TOTAL:', 5, y);
  doc.text(`${settings.currency} ${sale.total.toFixed(2)}`, 55, y, { align: 'right' });
  y += lineHeight + 2;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text('Payment:', 5, y);
  doc.text(sale.paymentMethod.toUpperCase(), 55, y, { align: 'right' });
  y += lineHeight;

  if (sale.change > 0) {
    doc.text('Change:', 5, y);
    doc.text(`${settings.currency} ${sale.change.toFixed(2)}`, 55, y, { align: 'right' });
    y += lineHeight;
  }

  y += 3;
  doc.text('----------------------------------------', 5, y);
  y += lineHeight + 2;

  // Footer
  doc.setFontSize(9);
  doc.text(settings.receiptFooter, 40, y, { align: 'center' });

  // Print
  doc.autoPrint();
  window.open(doc.output('bloburl'), '_blank');
};
