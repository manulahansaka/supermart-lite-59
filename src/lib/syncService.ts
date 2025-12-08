import { supabase } from "@/integrations/supabase/client";
import { db, SyncLog } from "./db";
import type { Product, Sale, Customer, Expense, Cashier, Category, Supplier, Unit, QuickQuantity, Settings } from "./db";
import type { RealtimeChannel } from "@supabase/supabase-js";

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  pendingChanges: number;
  error: string | null;
  realtimeEnabled: boolean;
}

type SyncCallback = (status: SyncStatus) => void;

// Helper to safely convert to ISO string
// Updated: 2025-12-05 - Using select-then-update pattern for conflict resolution
const toISOString = (date: Date | string | null | undefined): string => {
  if (!date) return new Date().toISOString();
  if (typeof date === 'string') return date;
  if (date instanceof Date) return date.toISOString();
  return new Date().toISOString();
};

class SyncService {
  private deviceId: string;
  private isOnline: boolean = navigator.onLine;
  private isSyncing: boolean = false;
  private lastSyncTime: Date | null = null;
  private syncCallbacks: Set<SyncCallback> = new Set();
  private autoSyncInterval: number | null = null;
  private realtimeEnabled: boolean = true;
  private realtimeChannel: RealtimeChannel | null = null;
  private initialSyncDone: boolean = false;
  private lastError: string | null = null;
  private pendingChangesCount: number = 0;

  constructor() {
    this.deviceId = this.getOrCreateDeviceId();
    this.realtimeEnabled = localStorage.getItem('realtime_sync_enabled') !== 'false';
    this.setupEventListeners();
    this.startAutoSync();
    
    // Initial sync on load (important for login)
    this.performInitialSync();
  }

  private async performInitialSync() {
    if (this.isOnline && !this.initialSyncDone) {
      console.log('[Sync] Performing initial sync on load...');
      await this.addSyncLog('pull', 'all', 0, 'success', 'Starting initial sync...');
      
      // Pull cashiers first for login
      await this.pullCashiers();
      
      // Then full sync
      const result = await this.sync();
      this.initialSyncDone = true;
      
      if (result.success) {
        await this.addSyncLog('pull', 'all', 0, 'success', 'Initial sync completed');
      }
      
      // Setup realtime after initial sync
      if (this.realtimeEnabled) {
        this.setupRealtimeSubscriptions();
      }
    }
  }

  private getOrCreateDeviceId(): string {
    let deviceId = localStorage.getItem('pos_device_id');
    if (!deviceId) {
      deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('pos_device_id', deviceId);
    }
    return deviceId;
  }

  private setupEventListeners() {
    window.addEventListener('online', () => {
      this.isOnline = true;
      this.notifyStatusChange();
      this.sync();
      if (this.realtimeEnabled) {
        this.setupRealtimeSubscriptions();
      }
    });

    window.addEventListener('offline', () => {
      this.isOnline = false;
      this.notifyStatusChange();
      this.cleanupRealtimeSubscriptions();
    });
  }

  private setupRealtimeSubscriptions() {
    if (this.realtimeChannel) {
      this.cleanupRealtimeSubscriptions();
    }

    console.log('[Sync] Setting up realtime subscriptions...');

    this.realtimeChannel = supabase
      .channel('db-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, (payload) => this.handleRealtimeChange('products', payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'customers' }, (payload) => this.handleRealtimeChange('customers', payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sales' }, (payload) => this.handleRealtimeChange('sales', payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses' }, (payload) => this.handleRealtimeChange('expenses', payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'cashiers' }, (payload) => this.handleRealtimeChange('cashiers', payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'categories' }, (payload) => this.handleRealtimeChange('categories', payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'suppliers' }, (payload) => this.handleRealtimeChange('suppliers', payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'units' }, (payload) => this.handleRealtimeChange('units', payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'quick_quantities' }, (payload) => this.handleRealtimeChange('quick_quantities', payload))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settings' }, (payload) => this.handleRealtimeChange('settings', payload))
      .subscribe((status) => {
        console.log('[Sync] Realtime subscription status:', status);
      });
  }

  private cleanupRealtimeSubscriptions() {
    if (this.realtimeChannel) {
      supabase.removeChannel(this.realtimeChannel);
      this.realtimeChannel = null;
    }
  }

  private async handleRealtimeChange(table: string, payload: any) {
    const { eventType, new: newRecord, old: oldRecord } = payload;
    
    // Skip if this change came from this device
    if (newRecord?.device_id === this.deviceId) {
      return;
    }

    console.log(`[Sync] Realtime ${eventType} on ${table}:`, newRecord || oldRecord);

    try {
      switch (table) {
        case 'products':
          await this.handleProductChange(eventType, newRecord, oldRecord);
          break;
        case 'customers':
          await this.handleCustomerChange(eventType, newRecord, oldRecord);
          break;
        case 'sales':
          await this.handleSaleChange(eventType, newRecord, oldRecord);
          break;
        case 'expenses':
          await this.handleExpenseChange(eventType, newRecord, oldRecord);
          break;
        case 'cashiers':
          await this.handleCashierChange(eventType, newRecord, oldRecord);
          break;
        case 'categories':
          await this.handleCategoryChange(eventType, newRecord, oldRecord);
          break;
        case 'suppliers':
          await this.handleSupplierChange(eventType, newRecord, oldRecord);
          break;
        case 'units':
          await this.handleUnitChange(eventType, newRecord, oldRecord);
          break;
        case 'quick_quantities':
          await this.handleQuickQuantityChange(eventType, newRecord, oldRecord);
          break;
        case 'settings':
          await this.handleSettingsChange(eventType, newRecord);
          break;
      }
      
      await this.addSyncLog('realtime', table, 1, 'success', `${eventType} received`);
    } catch (error) {
      console.error(`[Sync] Error handling realtime change for ${table}:`, error);
      await this.addSyncLog('realtime', table, 0, 'error', String(error));
    }
  }

  private async handleProductChange(eventType: string, newRecord: any, oldRecord: any) {
    if (eventType === 'DELETE' && oldRecord) {
      const local = await db.products.where('barcode').equals(oldRecord.barcode).first();
      if (local) await db.products.delete(local.id!);
    } else if (newRecord) {
      const local = await db.products.where('barcode').equals(newRecord.barcode).first();
      const productData = {
        barcode: newRecord.barcode,
        name: newRecord.name,
        category: newRecord.category || '',
        costPrice: Number(newRecord.cost_price),
        sellingPrice: Number(newRecord.selling_price),
        stock: newRecord.stock || 0,
        minStock: newRecord.min_stock || 0,
        unit: newRecord.unit || 'piece',
        image: newRecord.image || undefined,
        supplier: newRecord.supplier || undefined,
        discountPercent: newRecord.discount_percent ? Number(newRecord.discount_percent) : undefined,
        discountStartDate: newRecord.discount_start_date ? new Date(newRecord.discount_start_date) : undefined,
        discountEndDate: newRecord.discount_end_date ? new Date(newRecord.discount_end_date) : undefined,
        createdAt: newRecord.created_at ? new Date(newRecord.created_at) : new Date(),
        updatedAt: newRecord.updated_at ? new Date(newRecord.updated_at) : new Date()
      };
      
      if (local) {
        await db.products.update(local.id!, productData);
      } else {
        await db.products.add(productData);
      }
    }
  }

  private async handleCustomerChange(eventType: string, newRecord: any, oldRecord: any) {
    if (eventType === 'DELETE' && oldRecord) {
      const local = await db.customers.where('phone').equals(oldRecord.phone).first();
      if (local) await db.customers.delete(local.id!);
    } else if (newRecord) {
      const local = await db.customers.where('phone').equals(newRecord.phone).first();
      const customerData = {
        name: newRecord.name,
        phone: newRecord.phone,
        email: newRecord.email || undefined,
        loyaltyPoints: newRecord.loyalty_points || 0,
        totalPurchases: Number(newRecord.total_purchases) || 0,
        loanBalance: Number(newRecord.loan_balance) || 0,
        loanPurchases: (newRecord.loan_purchases as any[]) || [],
        notes: newRecord.notes || undefined,
        createdAt: newRecord.created_at ? new Date(newRecord.created_at) : new Date()
      };
      
      if (local) {
        await db.customers.update(local.id!, customerData);
      } else {
        await db.customers.add(customerData);
      }
    }
  }

  private async handleSaleChange(eventType: string, newRecord: any, oldRecord: any) {
    if (eventType === 'INSERT' && newRecord) {
      await db.sales.add({
        items: newRecord.items as any[],
        subtotal: Number(newRecord.subtotal),
        tax: Number(newRecord.tax) || 0,
        discount: Number(newRecord.discount) || 0,
        total: Number(newRecord.total),
        paymentMethod: newRecord.payment_method as any,
        amountPaid: Number(newRecord.amount_paid),
        change: Number(newRecord.change) || 0,
        customerName: newRecord.customer_name || undefined,
        cashier: newRecord.cashier,
        timestamp: new Date(newRecord.timestamp),
        printCount: newRecord.print_count || 0,
        printHistory: ((newRecord.print_history as any[]) || []).map((d: string) => new Date(d))
      });
    }
  }

  private async handleExpenseChange(eventType: string, newRecord: any, oldRecord: any) {
    if (eventType === 'INSERT' && newRecord) {
      await db.expenses.add({
        category: newRecord.category,
        description: newRecord.description || '',
        amount: Number(newRecord.amount),
        date: new Date(newRecord.date),
        paymentMethod: (newRecord.payment_method || 'cash') as 'cash' | 'card',
        expenseType: (newRecord.expense_type || 'business') as 'business' | 'personal',
        receipt: newRecord.receipt || undefined,
        createdBy: newRecord.created_by,
        createdAt: newRecord.created_at ? new Date(newRecord.created_at) : new Date()
      });
    }
  }

  private async handleCashierChange(eventType: string, newRecord: any, oldRecord: any) {
    if (eventType === 'DELETE' && oldRecord) {
      const local = await db.cashiers.where('name').equals(oldRecord.name).first();
      if (local) await db.cashiers.delete(local.id!);
    } else if (newRecord) {
      const local = await db.cashiers.where('name').equals(newRecord.name).first();
      const cashierData = {
        name: newRecord.name,
        pin: newRecord.pin,
        role: newRecord.role as any,
        createdAt: newRecord.created_at ? new Date(newRecord.created_at) : new Date()
      };
      
      if (local) {
        await db.cashiers.update(local.id!, cashierData);
      } else {
        await db.cashiers.add(cashierData);
      }
    }
  }

  private async handleCategoryChange(eventType: string, newRecord: any, oldRecord: any) {
    if (eventType === 'DELETE' && oldRecord) {
      const local = await db.categories.where('name').equals(oldRecord.name).first();
      if (local) await db.categories.delete(local.id!);
    } else if (newRecord) {
      const local = await db.categories.where('name').equals(newRecord.name).first();
      if (!local) {
        await db.categories.add({ name: newRecord.name });
      }
    }
  }

  private async handleSupplierChange(eventType: string, newRecord: any, oldRecord: any) {
    if (eventType === 'DELETE' && oldRecord) {
      const local = await db.suppliers.where('name').equals(oldRecord.name).first();
      if (local) await db.suppliers.delete(local.id!);
    } else if (newRecord) {
      const local = await db.suppliers.where('name').equals(newRecord.name).first();
      if (!local) {
        await db.suppliers.add({ name: newRecord.name, contact: newRecord.contact || undefined });
      } else {
        await db.suppliers.update(local.id!, { contact: newRecord.contact || undefined });
      }
    }
  }

  private async handleUnitChange(eventType: string, newRecord: any, oldRecord: any) {
    if (eventType === 'DELETE' && oldRecord) {
      const local = await db.units.where('name').equals(oldRecord.name).first();
      if (local) await db.units.delete(local.id!);
    } else if (newRecord) {
      const local = await db.units.where('name').equals(newRecord.name).first();
      if (!local) {
        await db.units.add({ name: newRecord.name, symbol: newRecord.symbol });
      }
    }
  }

  private async handleQuickQuantityChange(eventType: string, newRecord: any, oldRecord: any) {
    if (eventType === 'DELETE' && oldRecord) {
      const local = await db.quickQuantities.where('label').equals(oldRecord.label).first();
      if (local) await db.quickQuantities.delete(local.id!);
    } else if (newRecord) {
      const local = await db.quickQuantities.where('label').equals(newRecord.label).first();
      if (!local) {
        await db.quickQuantities.add({ value: Number(newRecord.value), label: newRecord.label });
      }
    }
  }

  private async handleSettingsChange(eventType: string, newRecord: any) {
    if (newRecord) {
      const localSettings = await db.settings.toArray();
      if (localSettings.length > 0) {
        // Use cloud tax_rate value directly, don't default to 10
        const cloudTaxRate = newRecord.tax_rate !== null && newRecord.tax_rate !== undefined 
          ? Number(newRecord.tax_rate) 
          : localSettings[0].taxRate;
        
        await db.settings.update(localSettings[0].id!, {
          storeName: newRecord.store_name,
          storeAddress: newRecord.store_address || '',
          storePhone: newRecord.store_phone || '',
          storeMobile: newRecord.store_mobile || '',
          storeMobile2: newRecord.store_mobile2 || '',
          taxRate: cloudTaxRate,
          currency: newRecord.currency || 'LKR',
          receiptHeader: newRecord.receipt_header || '',
          receiptFooter: newRecord.receipt_footer || '',
          logo: newRecord.logo || undefined,
          exportFileName: newRecord.export_file_name || undefined
        });
      }
    }
  }

  private startAutoSync() {
    this.autoSyncInterval = window.setInterval(() => {
      if (this.isOnline && !this.isSyncing) {
        this.sync();
      }
    }, 5 * 60 * 1000);
  }

  subscribe(callback: SyncCallback) {
    this.syncCallbacks.add(callback);
    callback(this.getStatus());
  }

  unsubscribe(callback: SyncCallback) {
    this.syncCallbacks.delete(callback);
  }

  private notifyStatusChange() {
    const status = this.getStatus();
    this.syncCallbacks.forEach(callback => callback(status));
  }

  getStatus(): SyncStatus {
    return {
      isOnline: this.isOnline,
      isSyncing: this.isSyncing,
      lastSyncTime: this.lastSyncTime,
      pendingChanges: this.pendingChangesCount,
      error: this.lastError,
      realtimeEnabled: this.realtimeEnabled
    };
  }

  clearError() {
    this.lastError = null;
    this.notifyStatusChange();
  }

  setRealtimeEnabled(enabled: boolean) {
    this.realtimeEnabled = enabled;
    localStorage.setItem('realtime_sync_enabled', String(enabled));
    
    if (enabled && this.isOnline) {
      this.setupRealtimeSubscriptions();
    } else {
      this.cleanupRealtimeSubscriptions();
    }
    
    this.notifyStatusChange();
  }

  async getSyncLogs(limit: number = 50): Promise<SyncLog[]> {
    return db.syncLogs.orderBy('timestamp').reverse().limit(limit).toArray();
  }

  async clearSyncLogs() {
    await db.syncLogs.clear();
  }

  private async addSyncLog(action: 'push' | 'pull' | 'realtime', table: string, recordCount: number, status: 'success' | 'error', message?: string) {
    try {
      await db.syncLogs.add({
        timestamp: new Date(),
        action,
        table,
        recordCount,
        status,
        message
      });
      
      // Keep only last 500 logs
      const count = await db.syncLogs.count();
      if (count > 500) {
        const oldest = await db.syncLogs.orderBy('timestamp').limit(count - 500).toArray();
        await db.syncLogs.bulkDelete(oldest.map(l => l.id!));
      }
    } catch (e) {
      console.error('[Sync] Error adding sync log:', e);
    }
  }

  async sync(): Promise<{ success: boolean; error?: string }> {
    if (!this.isOnline) {
      this.lastError = 'Device is offline';
      this.notifyStatusChange();
      return { success: false, error: 'Device is offline' };
    }

    if (this.isSyncing) {
      return { success: false, error: 'Sync already in progress' };
    }

    this.isSyncing = true;
    this.lastError = null;
    this.notifyStatusChange();

    try {
      console.log('[Sync] Starting full sync...');
      
      // Push local changes to cloud
      await this.pushLocalChanges();

      // Pull cloud changes to local
      await this.pullCloudChanges();

      this.lastSyncTime = new Date();
      localStorage.setItem('last_sync_time', this.lastSyncTime.toISOString());

      this.isSyncing = false;
      this.lastError = null;
      this.pendingChangesCount = 0;
      this.notifyStatusChange();

      console.log('[Sync] Full sync completed');
      return { success: true };
    } catch (error) {
      console.error('[Sync] Sync error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown sync error';
      this.lastError = errorMsg;
      this.isSyncing = false;
      this.notifyStatusChange();
      await this.addSyncLog('push', 'all', 0, 'error', String(error));
      return { 
        success: false, 
        error: errorMsg 
      };
    }
  }

  // Instant push methods for real-time sync on local changes
  async pushProductInstant(product: Product) {
    if (!this.isOnline) return;
    await this.pushProduct(product);
    await this.addSyncLog('push', 'products', 1, 'success', `Product ${product.name} synced`);
  }

  async pushCustomerInstant(customer: Customer) {
    if (!this.isOnline) return;
    await this.pushCustomer(customer);
    await this.addSyncLog('push', 'customers', 1, 'success', `Customer ${customer.name} synced`);
  }

  async pushSaleInstant(sale: Sale) {
    if (!this.isOnline) return;
    await this.pushSale(sale);
    await this.addSyncLog('push', 'sales', 1, 'success', `Sale synced`);
  }

  async pushExpenseInstant(expense: Expense) {
    if (!this.isOnline) return;
    await this.pushExpense(expense);
    await this.addSyncLog('push', 'expenses', 1, 'success', `Expense synced`);
  }

  async pushCashierInstant(cashier: Cashier) {
    if (!this.isOnline) return;
    await this.pushCashier(cashier);
    await this.addSyncLog('push', 'cashiers', 1, 'success', `Cashier ${cashier.name} synced`);
  }

  // Delete methods - sync deletions to cloud
  async deleteProductFromCloud(barcode: string) {
    if (!this.isOnline) return;
    try {
      const { error } = await supabase.from('products').delete().eq('barcode', barcode);
      if (error) throw error;
      await this.addSyncLog('push', 'products', 1, 'success', `Product deleted from cloud`);
    } catch (error) {
      console.error('[Sync] Error deleting product from cloud:', error);
      await this.addSyncLog('push', 'products', 0, 'error', `Failed to delete product: ${error}`);
    }
  }

  async deleteCustomerFromCloud(phone: string) {
    if (!this.isOnline) return;
    try {
      const { error } = await supabase.from('customers').delete().eq('phone', phone);
      if (error) throw error;
      await this.addSyncLog('push', 'customers', 1, 'success', `Customer deleted from cloud`);
    } catch (error) {
      console.error('[Sync] Error deleting customer from cloud:', error);
      await this.addSyncLog('push', 'customers', 0, 'error', `Failed to delete customer: ${error}`);
    }
  }

  async deleteSaleFromCloud(deviceId: string, localId: number) {
    if (!this.isOnline) return;
    try {
      const { error } = await supabase.from('sales').delete().eq('device_id', deviceId).eq('local_id', localId);
      if (error) throw error;
      await this.addSyncLog('push', 'sales', 1, 'success', `Sale deleted from cloud`);
    } catch (error) {
      console.error('[Sync] Error deleting sale from cloud:', error);
      await this.addSyncLog('push', 'sales', 0, 'error', `Failed to delete sale: ${error}`);
    }
  }

  async deleteExpenseFromCloud(deviceId: string, localId: number) {
    if (!this.isOnline) return;
    try {
      const { error } = await supabase.from('expenses').delete().eq('device_id', deviceId).eq('local_id', localId);
      if (error) throw error;
      await this.addSyncLog('push', 'expenses', 1, 'success', `Expense deleted from cloud`);
    } catch (error) {
      console.error('[Sync] Error deleting expense from cloud:', error);
      await this.addSyncLog('push', 'expenses', 0, 'error', `Failed to delete expense: ${error}`);
    }
  }

  async deleteCashierFromCloud(name: string) {
    if (!this.isOnline) return;
    try {
      const { error } = await supabase.from('cashiers').delete().eq('name', name);
      if (error) throw error;
      await this.addSyncLog('push', 'cashiers', 1, 'success', `Cashier deleted from cloud`);
    } catch (error) {
      console.error('[Sync] Error deleting cashier from cloud:', error);
      await this.addSyncLog('push', 'cashiers', 0, 'error', `Failed to delete cashier: ${error}`);
    }
  }

  async deleteCategoryFromCloud(name: string) {
    if (!this.isOnline) return;
    try {
      const { error } = await supabase.from('categories').delete().eq('name', name);
      if (error) throw error;
      await this.addSyncLog('push', 'categories', 1, 'success', `Category deleted from cloud`);
    } catch (error) {
      console.error('[Sync] Error deleting category from cloud:', error);
    }
  }

  async deleteSupplierFromCloud(name: string) {
    if (!this.isOnline) return;
    try {
      const { error } = await supabase.from('suppliers').delete().eq('name', name);
      if (error) throw error;
      await this.addSyncLog('push', 'suppliers', 1, 'success', `Supplier deleted from cloud`);
    } catch (error) {
      console.error('[Sync] Error deleting supplier from cloud:', error);
    }
  }

  async deleteUnitFromCloud(name: string) {
    if (!this.isOnline) return;
    try {
      const { error } = await supabase.from('units').delete().eq('name', name);
      if (error) throw error;
      await this.addSyncLog('push', 'units', 1, 'success', `Unit deleted from cloud`);
    } catch (error) {
      console.error('[Sync] Error deleting unit from cloud:', error);
    }
  }

  // Bulk delete methods for restore operations
  async deleteSalesFromCloudByTimestamp(cutoffDate: Date) {
    if (!this.isOnline) return;
    try {
      const { error } = await supabase.from('sales').delete().gte('timestamp', cutoffDate.toISOString());
      if (error) throw error;
      await this.addSyncLog('push', 'sales', 1, 'success', `Sales after ${cutoffDate.toISOString()} deleted from cloud`);
    } catch (error) {
      console.error('[Sync] Error bulk deleting sales from cloud:', error);
      await this.addSyncLog('push', 'sales', 0, 'error', `Failed to bulk delete sales: ${error}`);
    }
  }

  async deleteExpensesFromCloudByDate(cutoffDate: Date) {
    if (!this.isOnline) return;
    try {
      const { error } = await supabase.from('expenses').delete().gte('date', cutoffDate.toISOString());
      if (error) throw error;
      await this.addSyncLog('push', 'expenses', 1, 'success', `Expenses after ${cutoffDate.toISOString()} deleted from cloud`);
    } catch (error) {
      console.error('[Sync] Error bulk deleting expenses from cloud:', error);
      await this.addSyncLog('push', 'expenses', 0, 'error', `Failed to bulk delete expenses: ${error}`);
    }
  }

  async deleteProductsFromCloudByDate(cutoffDate: Date) {
    if (!this.isOnline) return;
    try {
      const { error } = await supabase.from('products').delete().gte('created_at', cutoffDate.toISOString());
      if (error) throw error;
      await this.addSyncLog('push', 'products', 1, 'success', `Products created after ${cutoffDate.toISOString()} deleted from cloud`);
    } catch (error) {
      console.error('[Sync] Error bulk deleting products from cloud:', error);
      await this.addSyncLog('push', 'products', 0, 'error', `Failed to bulk delete products: ${error}`);
    }
  }

  async updateProductStockInCloud(barcode: string, newStock: number) {
    if (!this.isOnline) return;
    try {
      const { error } = await supabase.from('products').update({ stock: newStock, updated_at: new Date().toISOString() }).eq('barcode', barcode);
      if (error) throw error;
    } catch (error) {
      console.error('[Sync] Error updating product stock in cloud:', error);
    }
  }

  getDeviceId(): string {
    return this.deviceId;
  }

  private async pushLocalChanges() {
    const products = await db.products.toArray();
    for (const product of products) {
      await this.pushProduct(product);
    }
    await this.addSyncLog('push', 'products', products.length, 'success', `Pushed ${products.length} products to cloud`);

    const customers = await db.customers.toArray();
    for (const customer of customers) {
      await this.pushCustomer(customer);
    }
    await this.addSyncLog('push', 'customers', customers.length, 'success', `Pushed ${customers.length} customers to cloud`);

    const sales = await db.sales.toArray();
    for (const sale of sales) {
      await this.pushSale(sale);
    }
    await this.addSyncLog('push', 'sales', sales.length, 'success', `Pushed ${sales.length} sales to cloud`);

    const expenses = await db.expenses.toArray();
    for (const expense of expenses) {
      await this.pushExpense(expense);
    }
    await this.addSyncLog('push', 'expenses', expenses.length, 'success', `Pushed ${expenses.length} expenses to cloud`);

    const cashiers = await db.cashiers.toArray();
    for (const cashier of cashiers) {
      await this.pushCashier(cashier);
    }
    await this.addSyncLog('push', 'cashiers', cashiers.length, 'success', `Pushed ${cashiers.length} cashiers to cloud`);

    const categories = await db.categories.toArray();
    for (const category of categories) {
      await this.pushCategory(category);
    }
    await this.addSyncLog('push', 'categories', categories.length, 'success', `Pushed ${categories.length} categories to cloud`);

    const suppliers = await db.suppliers.toArray();
    for (const supplier of suppliers) {
      await this.pushSupplier(supplier);
    }
    await this.addSyncLog('push', 'suppliers', suppliers.length, 'success', `Pushed ${suppliers.length} suppliers to cloud`);

    const units = await db.units.toArray();
    for (const unit of units) {
      await this.pushUnit(unit);
    }
    await this.addSyncLog('push', 'units', units.length, 'success', `Pushed ${units.length} units to cloud`);

    const quickQuantities = await db.quickQuantities.toArray();
    for (const qty of quickQuantities) {
      await this.pushQuickQuantity(qty);
    }
    await this.addSyncLog('push', 'quick_quantities', quickQuantities.length, 'success', `Pushed ${quickQuantities.length} quick quantities to cloud`);

    const settings = await db.settings.toArray();
    for (const setting of settings) {
      await this.pushSettings(setting);
    }
    await this.addSyncLog('push', 'settings', settings.length, 'success', `Pushed ${settings.length} settings to cloud`);
  }

  private async pushProduct(product: Product) {
    try {
      const { error } = await supabase
        .from('products')
        .upsert({
          local_id: product.id,
          device_id: this.deviceId,
          barcode: product.barcode,
          name: product.name,
          category: product.category || undefined,
          cost_price: product.costPrice,
          selling_price: product.sellingPrice,
          stock: product.stock,
          min_stock: product.minStock,
          unit: product.unit,
          image: product.image || undefined,
          supplier: product.supplier || undefined,
          discount_percent: product.discountPercent || undefined,
          discount_start_date: product.discountStartDate ? toISOString(product.discountStartDate) : undefined,
          discount_end_date: product.discountEndDate ? toISOString(product.discountEndDate) : undefined,
          updated_at: toISOString(product.updatedAt)
        }, { onConflict: 'barcode' });

      if (error) {
        console.error('[Sync] Error pushing product:', error);
        throw error;
      }
    } catch (error) {
      await this.addSyncLog('push', 'products', 0, 'error', `Failed to push product ${product.name}: ${error}`);
      throw error;
    }
  }

  private async pushCustomer(customer: Customer) {
    try {
      const { error } = await supabase
        .from('customers')
        .upsert({
          local_id: customer.id,
          device_id: this.deviceId,
          name: customer.name,
          phone: customer.phone,
          email: customer.email || undefined,
          loyalty_points: customer.loyaltyPoints,
          total_purchases: customer.totalPurchases,
          loan_balance: customer.loanBalance,
          loan_purchases: customer.loanPurchases as any,
          notes: customer.notes || undefined,
          updated_at: new Date().toISOString()
        }, { onConflict: 'phone' });

      if (error) {
        console.error('[Sync] Error pushing customer:', error);
        throw error;
      }
    } catch (error) {
      await this.addSyncLog('push', 'customers', 0, 'error', `Failed to push customer ${customer.name}: ${error}`);
      throw error;
    }
  }

  private async pushSale(sale: Sale) {
    try {
      // Check if sale already exists in cloud
      const { data: existing } = await supabase
        .from('sales')
        .select('id')
        .eq('device_id', this.deviceId)
        .eq('local_id', sale.id)
        .maybeSingle();

      const saleData = {
        local_id: sale.id,
        device_id: this.deviceId,
        items: sale.items as any,
        subtotal: sale.subtotal,
        tax: sale.tax,
        discount: sale.discount,
        total: sale.total,
        payment_method: sale.paymentMethod,
        amount_paid: sale.amountPaid,
        change: sale.change,
        customer_name: sale.customerName || undefined,
        cashier: sale.cashier,
        timestamp: toISOString(sale.timestamp),
        print_count: sale.printCount,
        print_history: (sale.printHistory || []).map(d => toISOString(d)) as any
      };

      let error;
      if (existing) {
        // Update existing record
        const result = await supabase
          .from('sales')
          .update(saleData)
          .eq('id', existing.id);
        error = result.error;
      } else {
        // Insert new record
        const result = await supabase
          .from('sales')
          .insert(saleData);
        error = result.error;
      }

      if (error) {
        console.error('[Sync] Error pushing sale:', error);
        throw error;
      }
    } catch (error) {
      await this.addSyncLog('push', 'sales', 0, 'error', `Failed to push sale: ${error}`);
      throw error;
    }
  }

  private async pushExpense(expense: Expense) {
    try {
      // Check if expense already exists in cloud
      const { data: existing } = await supabase
        .from('expenses')
        .select('id')
        .eq('device_id', this.deviceId)
        .eq('local_id', expense.id)
        .maybeSingle();

      const expenseData = {
        local_id: expense.id,
        device_id: this.deviceId,
        category: expense.category,
        description: expense.description || undefined,
        amount: expense.amount,
        date: toISOString(expense.date),
        payment_method: expense.paymentMethod,
        expense_type: expense.expenseType || undefined,
        receipt: expense.receipt || undefined,
        created_by: expense.createdBy,
        created_at: toISOString(expense.createdAt)
      };

      let error;
      if (existing) {
        // Update existing record
        const result = await supabase
          .from('expenses')
          .update(expenseData)
          .eq('id', existing.id);
        error = result.error;
      } else {
        // Insert new record
        const result = await supabase
          .from('expenses')
          .insert(expenseData);
        error = result.error;
      }

      if (error) {
        console.error('[Sync] Error pushing expense:', error);
        throw error;
      }
    } catch (error) {
      await this.addSyncLog('push', 'expenses', 0, 'error', `Failed to push expense: ${error}`);
      throw error;
    }
  }

  private async pushCashier(cashier: Cashier) {
    try {
      const { error } = await supabase
        .from('cashiers')
        .upsert({
          local_id: cashier.id,
          device_id: this.deviceId,
          name: cashier.name,
          pin: cashier.pin,
          role: cashier.role,
          created_at: toISOString(cashier.createdAt),
          updated_at: toISOString(new Date())
        }, { onConflict: 'name' });

      if (error) {
        console.error('[Sync] Error pushing cashier:', error);
        throw error;
      }
    } catch (error) {
      await this.addSyncLog('push', 'cashiers', 0, 'error', `Failed to push cashier ${cashier.name}: ${error}`);
      throw error;
    }
  }

  private async pushCategory(category: Category) {
    try {
      const { error } = await supabase
        .from('categories')
        .upsert({
          local_id: category.id,
          name: category.name
        }, { onConflict: 'name' });

      if (error) {
        console.error('[Sync] Error pushing category:', error);
        throw error;
      }
    } catch (error) {
      await this.addSyncLog('push', 'categories', 0, 'error', `Failed to push category ${category.name}: ${error}`);
      throw error;
    }
  }

  private async pushSupplier(supplier: Supplier) {
    try {
      const { error } = await supabase
        .from('suppliers')
        .upsert({
          local_id: supplier.id,
          name: supplier.name,
          contact: supplier.contact || undefined
        }, { onConflict: 'name' });

      if (error) {
        console.error('[Sync] Error pushing supplier:', error);
        throw error;
      }
    } catch (error) {
      await this.addSyncLog('push', 'suppliers', 0, 'error', `Failed to push supplier ${supplier.name}: ${error}`);
      throw error;
    }
  }

  private async pushUnit(unit: Unit) {
    try {
      const { error } = await supabase
        .from('units')
        .upsert({
          local_id: unit.id,
          name: unit.name,
          symbol: unit.symbol
        }, { onConflict: 'name' });

      if (error) {
        console.error('[Sync] Error pushing unit:', error);
        throw error;
      }
    } catch (error) {
      await this.addSyncLog('push', 'units', 0, 'error', `Failed to push unit ${unit.name}: ${error}`);
      throw error;
    }
  }

  private async pushQuickQuantity(qty: QuickQuantity) {
    try {
      const { error } = await supabase
        .from('quick_quantities')
        .upsert({
          local_id: qty.id,
          value: qty.value,
          label: qty.label
        }, { onConflict: 'label' });

      if (error) {
        console.error('[Sync] Error pushing quick quantity:', error);
        throw error;
      }
    } catch (error) {
      await this.addSyncLog('push', 'quick_quantities', 0, 'error', `Failed to push quick quantity ${qty.label}: ${error}`);
      throw error;
    }
  }

  private async pushSettings(settings: Settings) {
    try {
      // Check if settings already exist in cloud
      const { data: existing } = await supabase
        .from('settings')
        .select('id')
        .eq('store_name', settings.storeName)
        .maybeSingle();

      const settingsData = {
        store_name: settings.storeName,
        store_address: settings.storeAddress || undefined,
        store_phone: settings.storePhone || undefined,
        store_mobile: settings.storeMobile || undefined,
        store_mobile2: settings.storeMobile2 || undefined,
        tax_rate: settings.taxRate,
        currency: settings.currency,
        receipt_header: settings.receiptHeader,
        receipt_footer: settings.receiptFooter,
        logo: settings.logo || undefined,
        export_file_name: settings.exportFileName || undefined,
        updated_at: new Date().toISOString()
      };

      let error;
      if (existing) {
        // Update existing record
        const result = await supabase
          .from('settings')
          .update(settingsData)
          .eq('id', existing.id);
        error = result.error;
      } else {
        // Insert new record
        const result = await supabase
          .from('settings')
          .insert(settingsData);
        error = result.error;
      }

      if (error) {
        console.error('[Sync] Error pushing settings:', error);
        throw error;
      }
    } catch (error) {
      await this.addSyncLog('push', 'settings', 0, 'error', `Failed to push settings: ${error}`);
      throw error;
    }
  }

  private async pullCloudChanges() {
    // Pull cashiers first (important for login)
    await this.pullCashiers();
    await this.pullProducts();
    await this.pullCustomers();
    await this.pullSales();
    await this.pullExpenses();
    await this.pullCategories();
    await this.pullSuppliers();
    await this.pullUnits();
    await this.pullQuickQuantities();
    await this.pullSettings();
  }

  private async pullProducts() {
    const { data: cloudProducts, error } = await supabase.from('products').select('*');
    
    if (error || !cloudProducts) {
      console.error('[Sync] Error pulling products:', error);
      await this.addSyncLog('pull', 'products', 0, 'error', error?.message);
      return;
    }

    let count = 0;
    for (const cloud of cloudProducts) {
      const localProduct = await db.products.where('barcode').equals(cloud.barcode).first();
      
      if (!localProduct) {
        await db.products.add({
          barcode: cloud.barcode,
          name: cloud.name,
          category: cloud.category || '',
          costPrice: Number(cloud.cost_price),
          sellingPrice: Number(cloud.selling_price),
          stock: cloud.stock || 0,
          minStock: cloud.min_stock || 0,
          unit: cloud.unit || 'piece',
          image: cloud.image || undefined,
          supplier: cloud.supplier || undefined,
          discountPercent: cloud.discount_percent ? Number(cloud.discount_percent) : undefined,
          discountStartDate: cloud.discount_start_date ? new Date(cloud.discount_start_date) : undefined,
          discountEndDate: cloud.discount_end_date ? new Date(cloud.discount_end_date) : undefined,
          createdAt: cloud.created_at ? new Date(cloud.created_at) : new Date(),
          updatedAt: cloud.updated_at ? new Date(cloud.updated_at) : new Date()
        });
        count++;
      } else {
        const cloudUpdatedAt = cloud.updated_at ? new Date(cloud.updated_at) : new Date(0);
        const localUpdatedAt = localProduct.updatedAt || new Date(0);
        
        if (cloudUpdatedAt > localUpdatedAt) {
          await db.products.update(localProduct.id!, {
            name: cloud.name,
            category: cloud.category || '',
            costPrice: Number(cloud.cost_price),
            sellingPrice: Number(cloud.selling_price),
            stock: cloud.stock || 0,
            minStock: cloud.min_stock || 0,
            unit: cloud.unit || 'piece',
            image: cloud.image || undefined,
            supplier: cloud.supplier || undefined,
            discountPercent: cloud.discount_percent ? Number(cloud.discount_percent) : undefined,
            discountStartDate: cloud.discount_start_date ? new Date(cloud.discount_start_date) : undefined,
            discountEndDate: cloud.discount_end_date ? new Date(cloud.discount_end_date) : undefined,
            updatedAt: cloudUpdatedAt
          });
          count++;
        }
      }
    }
    await this.addSyncLog('pull', 'products', count, 'success', count > 0 ? `Pulled ${count} products from cloud` : 'Products up to date');
  }

  private async pullCustomers() {
    const { data: cloudCustomers, error } = await supabase.from('customers').select('*');
    
    if (error || !cloudCustomers) {
      console.error('[Sync] Error pulling customers:', error);
      await this.addSyncLog('pull', 'customers', 0, 'error', error?.message);
      return;
    }

    let count = 0;
    for (const cloud of cloudCustomers) {
      const localCustomer = await db.customers.where('phone').equals(cloud.phone).first();
      
      if (!localCustomer) {
        await db.customers.add({
          name: cloud.name,
          phone: cloud.phone,
          email: cloud.email || undefined,
          loyaltyPoints: cloud.loyalty_points || 0,
          totalPurchases: Number(cloud.total_purchases) || 0,
          loanBalance: Number(cloud.loan_balance) || 0,
          loanPurchases: (cloud.loan_purchases as any[]) || [],
          notes: cloud.notes || undefined,
          createdAt: cloud.created_at ? new Date(cloud.created_at) : new Date()
        });
        count++;
      } else {
        const cloudUpdatedAt = cloud.updated_at ? new Date(cloud.updated_at) : new Date(0);
        const localUpdatedAt = localCustomer.createdAt || new Date(0);
        
        if (cloudUpdatedAt > localUpdatedAt) {
          await db.customers.update(localCustomer.id!, {
            name: cloud.name,
            email: cloud.email || undefined,
            loyaltyPoints: cloud.loyalty_points || 0,
            totalPurchases: Number(cloud.total_purchases) || 0,
            loanBalance: Number(cloud.loan_balance) || 0,
            loanPurchases: (cloud.loan_purchases as any[]) || [],
            notes: cloud.notes || undefined
          });
          count++;
        }
      }
    }
    await this.addSyncLog('pull', 'customers', count, 'success', count > 0 ? `Pulled ${count} customers from cloud` : 'Customers up to date');
  }

  private async pullSales() {
    const { data: cloudSales, error } = await supabase.from('sales').select('*');
    
    if (error || !cloudSales) {
      console.error('[Sync] Error pulling sales:', error);
      await this.addSyncLog('pull', 'sales', 0, 'error', error?.message);
      return;
    }

    let count = 0;
    for (const cloud of cloudSales) {
      const existingSale = await db.sales
        .where('timestamp')
        .equals(new Date(cloud.timestamp!))
        .filter(s => s.cashier === cloud.cashier && s.total === Number(cloud.total))
        .first();
      
      if (!existingSale) {
        await db.sales.add({
          items: cloud.items as any[],
          subtotal: Number(cloud.subtotal),
          tax: Number(cloud.tax) || 0,
          discount: Number(cloud.discount) || 0,
          total: Number(cloud.total),
          paymentMethod: cloud.payment_method as any,
          amountPaid: Number(cloud.amount_paid),
          change: Number(cloud.change) || 0,
          customerName: cloud.customer_name || undefined,
          cashier: cloud.cashier,
          timestamp: new Date(cloud.timestamp!),
          printCount: cloud.print_count || 0,
          printHistory: ((cloud.print_history as any[]) || []).map((d: string) => new Date(d))
        });
        count++;
      }
    }
    await this.addSyncLog('pull', 'sales', count, 'success', count > 0 ? `Pulled ${count} new sales from cloud` : 'Sales up to date');
  }

  private async pullExpenses() {
    const { data: cloudExpenses, error } = await supabase.from('expenses').select('*');
    
    if (error || !cloudExpenses) {
      console.error('[Sync] Error pulling expenses:', error);
      await this.addSyncLog('pull', 'expenses', 0, 'error', error?.message);
      return;
    }

    let count = 0;
    for (const cloud of cloudExpenses) {
      const existingExpense = await db.expenses
        .where('date')
        .equals(new Date(cloud.date))
        .filter(e => e.amount === Number(cloud.amount) && e.category === cloud.category)
        .first();
      
      if (!existingExpense) {
        await db.expenses.add({
          category: cloud.category,
          description: cloud.description || '',
          amount: Number(cloud.amount),
          date: new Date(cloud.date),
          paymentMethod: (cloud.payment_method || 'cash') as 'cash' | 'card',
          expenseType: (cloud.expense_type || 'business') as 'business' | 'personal',
          receipt: cloud.receipt || undefined,
          createdBy: cloud.created_by,
          createdAt: cloud.created_at ? new Date(cloud.created_at) : new Date()
        });
        count++;
      }
    }
    await this.addSyncLog('pull', 'expenses', count, 'success', count > 0 ? `Pulled ${count} new expenses from cloud` : 'Expenses up to date');
  }

  private async pullCashiers() {
    const { data: cloudCashiers, error } = await supabase.from('cashiers').select('*');
    
    if (error || !cloudCashiers) {
      console.error('[Sync] Error pulling cashiers:', error);
      await this.addSyncLog('pull', 'cashiers', 0, 'error', error?.message);
      return;
    }

    let count = 0;
    for (const cloud of cloudCashiers) {
      const localCashier = await db.cashiers.where('name').equals(cloud.name).first();
      
      if (!localCashier) {
        await db.cashiers.add({
          name: cloud.name,
          pin: cloud.pin,
          role: cloud.role as any,
          createdAt: cloud.created_at ? new Date(cloud.created_at) : new Date()
        });
        count++;
      } else {
        const cloudUpdatedAt = cloud.updated_at ? new Date(cloud.updated_at) : new Date(0);
        const localUpdatedAt = localCashier.createdAt || new Date(0);
        
        if (cloudUpdatedAt > localUpdatedAt) {
          await db.cashiers.update(localCashier.id!, {
            pin: cloud.pin,
            role: cloud.role as any
          });
          count++;
        }
      }
    }
    await this.addSyncLog('pull', 'cashiers', count, 'success', count > 0 ? `Pulled ${count} cashiers from cloud` : 'Cashiers up to date');
  }

  private async pullCategories() {
    const { data: cloudCategories, error } = await supabase.from('categories').select('*');
    
    if (error || !cloudCategories) {
      await this.addSyncLog('pull', 'categories', 0, 'error', error?.message);
      return;
    }

    let count = 0;
    for (const cloud of cloudCategories) {
      const localCategory = await db.categories.where('name').equals(cloud.name).first();
      if (!localCategory) {
        await db.categories.add({ name: cloud.name });
        count++;
      }
    }
    await this.addSyncLog('pull', 'categories', count, 'success', count > 0 ? `Pulled ${count} new categories from cloud` : 'Categories up to date');
  }

  private async pullSuppliers() {
    const { data: cloudSuppliers, error } = await supabase.from('suppliers').select('*');
    
    if (error || !cloudSuppliers) {
      await this.addSyncLog('pull', 'suppliers', 0, 'error', error?.message);
      return;
    }

    let count = 0;
    for (const cloud of cloudSuppliers) {
      const localSupplier = await db.suppliers.where('name').equals(cloud.name).first();
      if (!localSupplier) {
        await db.suppliers.add({ name: cloud.name, contact: cloud.contact || undefined });
        count++;
      } else if (cloud.contact && !localSupplier.contact) {
        await db.suppliers.update(localSupplier.id!, { contact: cloud.contact });
        count++;
      }
    }
    await this.addSyncLog('pull', 'suppliers', count, 'success', count > 0 ? `Pulled ${count} suppliers from cloud` : 'Suppliers up to date');
  }

  private async pullUnits() {
    const { data: cloudUnits, error } = await supabase.from('units').select('*');
    
    if (error || !cloudUnits) {
      await this.addSyncLog('pull', 'units', 0, 'error', error?.message);
      return;
    }

    let count = 0;
    for (const cloud of cloudUnits) {
      const localUnit = await db.units.where('name').equals(cloud.name).first();
      if (!localUnit) {
        await db.units.add({ name: cloud.name, symbol: cloud.symbol });
        count++;
      }
    }
    await this.addSyncLog('pull', 'units', count, 'success', count > 0 ? `Pulled ${count} new units from cloud` : 'Units up to date');
  }

  private async pullQuickQuantities() {
    const { data: cloudQtys, error } = await supabase.from('quick_quantities').select('*');
    
    if (error || !cloudQtys) {
      await this.addSyncLog('pull', 'quick_quantities', 0, 'error', error?.message);
      return;
    }

    let count = 0;
    for (const cloud of cloudQtys) {
      const localQty = await db.quickQuantities.where('label').equals(cloud.label).first();
      if (!localQty) {
        await db.quickQuantities.add({ value: Number(cloud.value), label: cloud.label });
        count++;
      }
    }
    await this.addSyncLog('pull', 'quick_quantities', count, 'success', count > 0 ? `Pulled ${count} quick quantities from cloud` : 'Quick quantities up to date');
  }

  private async pullSettings() {
    const { data: cloudSettings, error } = await supabase.from('settings').select('*').limit(1);
    
    if (error || !cloudSettings || cloudSettings.length === 0) {
      return;
    }

    const cloud = cloudSettings[0];
    const localSettings = await db.settings.toArray();
    
    if (localSettings.length > 0) {
      // Use cloud tax_rate directly, don't default to 10
      const cloudTaxRate = cloud.tax_rate !== null && cloud.tax_rate !== undefined 
        ? Number(cloud.tax_rate) 
        : localSettings[0].taxRate;
      
      await db.settings.update(localSettings[0].id!, {
        storeName: cloud.store_name,
        storeAddress: cloud.store_address || '',
        storePhone: cloud.store_phone || '',
        storeMobile: cloud.store_mobile || '',
        storeMobile2: cloud.store_mobile2 || '',
        taxRate: cloudTaxRate,
        currency: cloud.currency || 'LKR',
        receiptHeader: cloud.receipt_header || '',
        receiptFooter: cloud.receipt_footer || '',
        logo: cloud.logo || undefined,
        exportFileName: cloud.export_file_name || undefined
      });
    }
    await this.addSyncLog('pull', 'settings', 1, 'success', 'Settings synced from cloud');
  }

  destroy() {
    if (this.autoSyncInterval) {
      clearInterval(this.autoSyncInterval);
    }
    this.cleanupRealtimeSubscriptions();
    window.removeEventListener('online', () => {});
    window.removeEventListener('offline', () => {});
  }
}

export const syncService = new SyncService();
