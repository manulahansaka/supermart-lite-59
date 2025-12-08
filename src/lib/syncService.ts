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

export interface SyncProgress {
  isActive: boolean;
  phase: 'idle' | 'pushing' | 'pulling' | 'complete' | 'error';
  currentTable: string;
  currentBatch: number;
  totalBatches: number;
  processedRecords: number;
  totalRecords: number;
  percentage: number;
  message: string;
}

type SyncCallback = (status: SyncStatus) => void;
type ProgressCallback = (progress: SyncProgress) => void;

const BATCH_SIZE = 100;
const SYNC_CHECKPOINT_KEY = 'sync_checkpoint';
const LAST_SYNC_TIMESTAMPS_KEY = 'last_sync_timestamps';

// Helper to safely convert to ISO string
const toISOString = (date: Date | string | null | undefined): string => {
  if (!date) return new Date().toISOString();
  if (typeof date === 'string') return date;
  if (date instanceof Date) return date.toISOString();
  return new Date().toISOString();
};

interface SyncCheckpoint {
  table: string;
  lastProcessedIndex: number;
  timestamp: string;
}

interface LastSyncTimestamps {
  [table: string]: string;
}

class SyncService {
  private deviceId: string;
  private isOnline: boolean = navigator.onLine;
  private isSyncing: boolean = false;
  private lastSyncTime: Date | null = null;
  private syncCallbacks: Set<SyncCallback> = new Set();
  private progressCallbacks: Set<ProgressCallback> = new Set();
  private autoSyncInterval: number | null = null;
  private realtimeEnabled: boolean = true;
  private realtimeChannel: RealtimeChannel | null = null;
  private initialSyncDone: boolean = false;
  private lastError: string | null = null;
  private pendingChangesCount: number = 0;
  
  private currentProgress: SyncProgress = {
    isActive: false,
    phase: 'idle',
    currentTable: '',
    currentBatch: 0,
    totalBatches: 0,
    processedRecords: 0,
    totalRecords: 0,
    percentage: 0,
    message: ''
  };

  constructor() {
    this.deviceId = this.getOrCreateDeviceId();
    this.realtimeEnabled = localStorage.getItem('realtime_sync_enabled') !== 'false';
    this.setupEventListeners();
    this.startAutoSync();
    this.performInitialSync();
  }

  private async performInitialSync() {
    if (this.isOnline && !this.initialSyncDone) {
      console.log('[Sync] Performing initial sync on load...');
      await this.addSyncLog('pull', 'all', 0, 'success', 'Starting initial sync...');
      await this.pullCashiers();
      const result = await this.sync();
      this.initialSyncDone = true;
      
      if (result.success) {
        await this.addSyncLog('pull', 'all', 0, 'success', 'Initial sync completed');
      }
      
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

  subscribeProgress(callback: ProgressCallback) {
    this.progressCallbacks.add(callback);
    callback(this.currentProgress);
  }

  unsubscribeProgress(callback: ProgressCallback) {
    this.progressCallbacks.delete(callback);
  }

  private notifyStatusChange() {
    const status = this.getStatus();
    this.syncCallbacks.forEach(callback => callback(status));
  }

  private notifyProgressChange() {
    this.progressCallbacks.forEach(callback => callback(this.currentProgress));
  }

  private updateProgress(updates: Partial<SyncProgress>) {
    this.currentProgress = { ...this.currentProgress, ...updates };
    if (this.currentProgress.totalRecords > 0) {
      this.currentProgress.percentage = Math.round(
        (this.currentProgress.processedRecords / this.currentProgress.totalRecords) * 100
      );
    }
    this.notifyProgressChange();
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

  getProgress(): SyncProgress {
    return this.currentProgress;
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
      
      const count = await db.syncLogs.count();
      if (count > 500) {
        const oldest = await db.syncLogs.orderBy('timestamp').limit(count - 500).toArray();
        await db.syncLogs.bulkDelete(oldest.map(l => l.id!));
      }
    } catch (e) {
      console.error('[Sync] Error adding sync log:', e);
    }
  }

  private getLastSyncTimestamps(): LastSyncTimestamps {
    const saved = localStorage.getItem(LAST_SYNC_TIMESTAMPS_KEY);
    return saved ? JSON.parse(saved) : {};
  }

  private saveLastSyncTimestamp(table: string, timestamp: string) {
    const timestamps = this.getLastSyncTimestamps();
    timestamps[table] = timestamp;
    localStorage.setItem(LAST_SYNC_TIMESTAMPS_KEY, JSON.stringify(timestamps));
  }

  private getCheckpoint(): SyncCheckpoint | null {
    const saved = localStorage.getItem(SYNC_CHECKPOINT_KEY);
    return saved ? JSON.parse(saved) : null;
  }

  private saveCheckpoint(table: string, lastProcessedIndex: number) {
    const checkpoint: SyncCheckpoint = {
      table,
      lastProcessedIndex,
      timestamp: new Date().toISOString()
    };
    localStorage.setItem(SYNC_CHECKPOINT_KEY, JSON.stringify(checkpoint));
  }

  private clearCheckpoint() {
    localStorage.removeItem(SYNC_CHECKPOINT_KEY);
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

    this.updateProgress({
      isActive: true,
      phase: 'pushing',
      currentTable: '',
      currentBatch: 0,
      totalBatches: 0,
      processedRecords: 0,
      totalRecords: 0,
      percentage: 0,
      message: 'Starting sync...'
    });

    try {
      console.log('[Sync] Starting optimized delta+batch sync...');
      
      // Calculate total records for progress
      const totalRecords = await this.calculateTotalRecords();
      this.updateProgress({ totalRecords });

      // Push local changes with delta detection
      await this.pushLocalChangesDelta();

      // Pull cloud changes
      this.updateProgress({ phase: 'pulling', message: 'Downloading changes...' });
      await this.pullCloudChanges();

      this.lastSyncTime = new Date();
      localStorage.setItem('last_sync_time', this.lastSyncTime.toISOString());

      this.isSyncing = false;
      this.lastError = null;
      this.pendingChangesCount = 0;
      this.notifyStatusChange();
      
      this.updateProgress({
        isActive: false,
        phase: 'complete',
        percentage: 100,
        message: 'Sync completed successfully'
      });
      
      this.clearCheckpoint();

      console.log('[Sync] Optimized sync completed');
      return { success: true };
    } catch (error) {
      console.error('[Sync] Sync error:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown sync error';
      this.lastError = errorMsg;
      this.isSyncing = false;
      this.notifyStatusChange();
      
      this.updateProgress({
        isActive: false,
        phase: 'error',
        message: `Sync failed: ${errorMsg}`
      });
      
      await this.addSyncLog('push', 'all', 0, 'error', String(error));
      return { success: false, error: errorMsg };
    }
  }

  private async calculateTotalRecords(): Promise<number> {
    const products = await db.products.count();
    const customers = await db.customers.count();
    const sales = await db.sales.count();
    const expenses = await db.expenses.count();
    const cashiers = await db.cashiers.count();
    const categories = await db.categories.count();
    const suppliers = await db.suppliers.count();
    const units = await db.units.count();
    const quickQuantities = await db.quickQuantities.count();
    
    return products + customers + sales + expenses + cashiers + categories + suppliers + units + quickQuantities;
  }

  private async pushLocalChangesDelta() {
    const lastSyncTimestamps = this.getLastSyncTimestamps();
    const checkpoint = this.getCheckpoint();
    let processedRecords = 0;

    // Products - Delta sync (only push updated records)
    const products = await db.products.toArray();
    const productsToSync = products.filter(p => {
      const lastSync = lastSyncTimestamps['products'];
      if (!lastSync) return true;
      return new Date(p.updatedAt) > new Date(lastSync);
    });
    
    if (productsToSync.length > 0) {
      this.updateProgress({ currentTable: 'products', message: `Syncing ${productsToSync.length} products...` });
      await this.pushProductsBatch(productsToSync, checkpoint?.table === 'products' ? checkpoint.lastProcessedIndex : 0);
      processedRecords += productsToSync.length;
      this.saveLastSyncTimestamp('products', new Date().toISOString());
    }
    this.updateProgress({ processedRecords });

    // Customers - Delta sync
    const customers = await db.customers.toArray();
    const customersToSync = customers.filter(c => {
      const lastSync = lastSyncTimestamps['customers'];
      if (!lastSync) return true;
      return new Date(c.createdAt) > new Date(lastSync);
    });
    
    if (customersToSync.length > 0) {
      this.updateProgress({ currentTable: 'customers', message: `Syncing ${customersToSync.length} customers...` });
      await this.pushCustomersBatch(customersToSync);
      processedRecords += customersToSync.length;
      this.saveLastSyncTimestamp('customers', new Date().toISOString());
    }
    this.updateProgress({ processedRecords });

    // Sales - Push all (append-only)
    const sales = await db.sales.toArray();
    if (sales.length > 0) {
      this.updateProgress({ currentTable: 'sales', message: `Syncing ${sales.length} sales...` });
      await this.pushSalesBatch(sales);
      processedRecords += sales.length;
    }
    this.updateProgress({ processedRecords });

    // Expenses - Push all (append-only)
    const expenses = await db.expenses.toArray();
    if (expenses.length > 0) {
      this.updateProgress({ currentTable: 'expenses', message: `Syncing ${expenses.length} expenses...` });
      await this.pushExpensesBatch(expenses);
      processedRecords += expenses.length;
    }
    this.updateProgress({ processedRecords });

    // Cashiers, Categories, Suppliers, Units, QuickQuantities - Batch upsert
    const cashiers = await db.cashiers.toArray();
    if (cashiers.length > 0) {
      this.updateProgress({ currentTable: 'cashiers', message: `Syncing ${cashiers.length} cashiers...` });
      await this.pushCashiersBatch(cashiers);
      processedRecords += cashiers.length;
    }
    this.updateProgress({ processedRecords });

    const categories = await db.categories.toArray();
    if (categories.length > 0) {
      this.updateProgress({ currentTable: 'categories', message: `Syncing ${categories.length} categories...` });
      await this.pushCategoriesBatch(categories);
      processedRecords += categories.length;
    }
    this.updateProgress({ processedRecords });

    const suppliers = await db.suppliers.toArray();
    if (suppliers.length > 0) {
      this.updateProgress({ currentTable: 'suppliers', message: `Syncing ${suppliers.length} suppliers...` });
      await this.pushSuppliersBatch(suppliers);
      processedRecords += suppliers.length;
    }
    this.updateProgress({ processedRecords });

    const units = await db.units.toArray();
    if (units.length > 0) {
      this.updateProgress({ currentTable: 'units', message: `Syncing ${units.length} units...` });
      await this.pushUnitsBatch(units);
      processedRecords += units.length;
    }
    this.updateProgress({ processedRecords });

    const quickQuantities = await db.quickQuantities.toArray();
    if (quickQuantities.length > 0) {
      this.updateProgress({ currentTable: 'quick_quantities', message: `Syncing ${quickQuantities.length} quick quantities...` });
      await this.pushQuickQuantitiesBatch(quickQuantities);
      processedRecords += quickQuantities.length;
    }
    this.updateProgress({ processedRecords });

    // Settings
    const settings = await db.settings.toArray();
    if (settings.length > 0) {
      this.updateProgress({ currentTable: 'settings', message: 'Syncing settings...' });
      await this.pushSettings(settings[0]);
    }

    await this.addSyncLog('push', 'all', processedRecords, 'success', `Delta sync: ${processedRecords} records processed`);
  }

  // Batch push methods
  private async pushProductsBatch(products: Product[], startIndex: number = 0) {
    const batches = this.createBatches(products.slice(startIndex), BATCH_SIZE);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      this.saveCheckpoint('products', startIndex + (i * BATCH_SIZE));
      
      const records = batch.map(p => ({
        local_id: p.id,
        device_id: this.deviceId,
        barcode: p.barcode,
        name: p.name,
        category: p.category || undefined,
        cost_price: p.costPrice,
        selling_price: p.sellingPrice,
        stock: p.stock,
        min_stock: p.minStock,
        unit: p.unit,
        image: p.image || undefined,
        supplier: p.supplier || undefined,
        discount_percent: p.discountPercent || undefined,
        discount_start_date: p.discountStartDate ? toISOString(p.discountStartDate) : undefined,
        discount_end_date: p.discountEndDate ? toISOString(p.discountEndDate) : undefined,
        updated_at: toISOString(p.updatedAt)
      }));

      const { error } = await supabase.from('products').upsert(records, { onConflict: 'barcode' });
      if (error) {
        console.error('[Sync] Batch product push error:', error);
        throw error;
      }
      
      this.updateProgress({
        currentBatch: i + 1,
        totalBatches: batches.length,
        message: `Products: batch ${i + 1}/${batches.length}`
      });
    }
    
    await this.addSyncLog('push', 'products', products.length, 'success', `Batch pushed ${products.length} products`);
  }

  private async pushCustomersBatch(customers: Customer[]) {
    const batches = this.createBatches(customers, BATCH_SIZE);
    
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      const records = batch.map(c => ({
        local_id: c.id,
        device_id: this.deviceId,
        name: c.name,
        phone: c.phone,
        email: c.email || undefined,
        loyalty_points: c.loyaltyPoints,
        total_purchases: c.totalPurchases,
        loan_balance: c.loanBalance,
        loan_purchases: c.loanPurchases as any,
        notes: c.notes || undefined,
        updated_at: new Date().toISOString()
      }));

      const { error } = await supabase.from('customers').upsert(records, { onConflict: 'phone' });
      if (error) throw error;
    }
    
    await this.addSyncLog('push', 'customers', customers.length, 'success', `Batch pushed ${customers.length} customers`);
  }

  private async pushSalesBatch(sales: Sale[]) {
    // For sales, we check which ones already exist to avoid duplicates
    const existingIds = new Set<string>();
    
    const { data: cloudSales } = await supabase
      .from('sales')
      .select('device_id, local_id')
      .eq('device_id', this.deviceId);
    
    if (cloudSales) {
      cloudSales.forEach(s => existingIds.add(`${s.device_id}-${s.local_id}`));
    }

    const newSales = sales.filter(s => !existingIds.has(`${this.deviceId}-${s.id}`));
    
    if (newSales.length === 0) {
      await this.addSyncLog('push', 'sales', 0, 'success', 'No new sales to push');
      return;
    }

    const batches = this.createBatches(newSales, BATCH_SIZE);
    
    for (const batch of batches) {
      const records = batch.map(s => ({
        local_id: s.id,
        device_id: this.deviceId,
        items: s.items as any,
        subtotal: s.subtotal,
        tax: s.tax,
        discount: s.discount,
        total: s.total,
        payment_method: s.paymentMethod,
        amount_paid: s.amountPaid,
        change: s.change,
        customer_name: s.customerName || undefined,
        cashier: s.cashier,
        timestamp: toISOString(s.timestamp),
        print_count: s.printCount,
        print_history: (s.printHistory || []).map(d => toISOString(d)) as any
      }));

      const { error } = await supabase.from('sales').insert(records);
      if (error && !error.message.includes('duplicate')) throw error;
    }
    
    await this.addSyncLog('push', 'sales', newSales.length, 'success', `Batch pushed ${newSales.length} new sales`);
  }

  private async pushExpensesBatch(expenses: Expense[]) {
    const existingIds = new Set<string>();
    
    const { data: cloudExpenses } = await supabase
      .from('expenses')
      .select('device_id, local_id')
      .eq('device_id', this.deviceId);
    
    if (cloudExpenses) {
      cloudExpenses.forEach(e => existingIds.add(`${e.device_id}-${e.local_id}`));
    }

    const newExpenses = expenses.filter(e => !existingIds.has(`${this.deviceId}-${e.id}`));
    
    if (newExpenses.length === 0) {
      await this.addSyncLog('push', 'expenses', 0, 'success', 'No new expenses to push');
      return;
    }

    const batches = this.createBatches(newExpenses, BATCH_SIZE);
    
    for (const batch of batches) {
      const records = batch.map(e => ({
        local_id: e.id,
        device_id: this.deviceId,
        category: e.category,
        description: e.description || undefined,
        amount: e.amount,
        date: toISOString(e.date),
        payment_method: e.paymentMethod,
        expense_type: e.expenseType || undefined,
        receipt: e.receipt || undefined,
        created_by: e.createdBy,
        created_at: toISOString(e.createdAt)
      }));

      const { error } = await supabase.from('expenses').insert(records);
      if (error && !error.message.includes('duplicate')) throw error;
    }
    
    await this.addSyncLog('push', 'expenses', newExpenses.length, 'success', `Batch pushed ${newExpenses.length} new expenses`);
  }

  private async pushCashiersBatch(cashiers: Cashier[]) {
    const records = cashiers.map(c => ({
      local_id: c.id,
      device_id: this.deviceId,
      name: c.name,
      pin: c.pin,
      role: c.role,
      created_at: toISOString(c.createdAt),
      updated_at: new Date().toISOString()
    }));

    const { error } = await supabase.from('cashiers').upsert(records, { onConflict: 'name' });
    if (error) throw error;
    
    await this.addSyncLog('push', 'cashiers', cashiers.length, 'success', `Batch pushed ${cashiers.length} cashiers`);
  }

  private async pushCategoriesBatch(categories: Category[]) {
    const records = categories.map(c => ({
      local_id: c.id,
      name: c.name
    }));

    const { error } = await supabase.from('categories').upsert(records, { onConflict: 'name' });
    if (error) throw error;
    
    await this.addSyncLog('push', 'categories', categories.length, 'success', `Batch pushed ${categories.length} categories`);
  }

  private async pushSuppliersBatch(suppliers: Supplier[]) {
    const records = suppliers.map(s => ({
      local_id: s.id,
      name: s.name,
      contact: s.contact || undefined
    }));

    const { error } = await supabase.from('suppliers').upsert(records, { onConflict: 'name' });
    if (error) throw error;
    
    await this.addSyncLog('push', 'suppliers', suppliers.length, 'success', `Batch pushed ${suppliers.length} suppliers`);
  }

  private async pushUnitsBatch(units: Unit[]) {
    const records = units.map(u => ({
      local_id: u.id,
      name: u.name,
      symbol: u.symbol
    }));

    const { error } = await supabase.from('units').upsert(records, { onConflict: 'name' });
    if (error) throw error;
    
    await this.addSyncLog('push', 'units', units.length, 'success', `Batch pushed ${units.length} units`);
  }

  private async pushQuickQuantitiesBatch(qtys: QuickQuantity[]) {
    const records = qtys.map(q => ({
      local_id: q.id,
      value: q.value,
      label: q.label
    }));

    const { error } = await supabase.from('quick_quantities').upsert(records, { onConflict: 'label' });
    if (error) throw error;
    
    await this.addSyncLog('push', 'quick_quantities', qtys.length, 'success', `Batch pushed ${qtys.length} quick quantities`);
  }

  private createBatches<T>(items: T[], batchSize: number): T[][] {
    const batches: T[][] = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push(items.slice(i, i + batchSize));
    }
    return batches;
  }

  // Instant push methods for real-time sync
  async pushProductInstant(product: Product) {
    if (!this.isOnline) return;
    await this.pushProductsBatch([product]);
  }

  async pushCustomerInstant(customer: Customer) {
    if (!this.isOnline) return;
    await this.pushCustomersBatch([customer]);
  }

  async pushSaleInstant(sale: Sale) {
    if (!this.isOnline) return;
    await this.pushSalesBatch([sale]);
  }

  async pushExpenseInstant(expense: Expense) {
    if (!this.isOnline) return;
    await this.pushExpensesBatch([expense]);
  }

  async pushCashierInstant(cashier: Cashier) {
    if (!this.isOnline) return;
    await this.pushCashiersBatch([cashier]);
  }

  // Delete methods
  async deleteProductFromCloud(barcode: string) {
    if (!this.isOnline) return;
    try {
      const { error } = await supabase.from('products').delete().eq('barcode', barcode);
      if (error) throw error;
      await this.addSyncLog('push', 'products', 1, 'success', `Product deleted from cloud`);
    } catch (error) {
      console.error('[Sync] Error deleting product from cloud:', error);
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
    }
  }

  async deleteSaleFromCloud(deviceId: string, localId: number) {
    if (!this.isOnline) return;
    try {
      const { error } = await supabase.from('sales').delete().eq('device_id', deviceId).eq('local_id', localId);
      if (error) throw error;
    } catch (error) {
      console.error('[Sync] Error deleting sale from cloud:', error);
    }
  }

  async deleteExpenseFromCloud(deviceId: string, localId: number) {
    if (!this.isOnline) return;
    try {
      const { error } = await supabase.from('expenses').delete().eq('device_id', deviceId).eq('local_id', localId);
      if (error) throw error;
    } catch (error) {
      console.error('[Sync] Error deleting expense from cloud:', error);
    }
  }

  async deleteCashierFromCloud(name: string) {
    if (!this.isOnline) return;
    try {
      const { error } = await supabase.from('cashiers').delete().eq('name', name);
      if (error) throw error;
    } catch (error) {
      console.error('[Sync] Error deleting cashier from cloud:', error);
    }
  }

  async deleteCategoryFromCloud(name: string) {
    if (!this.isOnline) return;
    try {
      const { error } = await supabase.from('categories').delete().eq('name', name);
      if (error) throw error;
    } catch (error) {
      console.error('[Sync] Error deleting category from cloud:', error);
    }
  }

  async deleteSupplierFromCloud(name: string) {
    if (!this.isOnline) return;
    try {
      const { error } = await supabase.from('suppliers').delete().eq('name', name);
      if (error) throw error;
    } catch (error) {
      console.error('[Sync] Error deleting supplier from cloud:', error);
    }
  }

  async deleteUnitFromCloud(name: string) {
    if (!this.isOnline) return;
    try {
      const { error } = await supabase.from('units').delete().eq('name', name);
      if (error) throw error;
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
    } catch (error) {
      console.error('[Sync] Error bulk deleting sales from cloud:', error);
    }
  }

  async deleteExpensesFromCloudByDate(cutoffDate: Date) {
    if (!this.isOnline) return;
    try {
      const { error } = await supabase.from('expenses').delete().gte('date', cutoffDate.toISOString());
      if (error) throw error;
    } catch (error) {
      console.error('[Sync] Error bulk deleting expenses from cloud:', error);
    }
  }

  async deleteProductsFromCloudByDate(cutoffDate: Date) {
    if (!this.isOnline) return;
    try {
      const { error } = await supabase.from('products').delete().gte('created_at', cutoffDate.toISOString());
      if (error) throw error;
    } catch (error) {
      console.error('[Sync] Error bulk deleting products from cloud:', error);
    }
  }

  // Complete data wipe for system restore "Everything" option
  async clearAllCloudData() {
    if (!this.isOnline) return;
    
    console.log('[Sync] Clearing ALL cloud data...');
    
    try {
      // Delete in order to avoid foreign key issues
      await supabase.from('sales').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('expenses').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('products').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('customers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('cashiers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('categories').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('suppliers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('units').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('quick_quantities').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      await supabase.from('settings').delete().neq('id', '00000000-0000-0000-0000-000000000000');
      
      // Clear sync timestamps to force full re-sync later
      localStorage.removeItem(LAST_SYNC_TIMESTAMPS_KEY);
      localStorage.removeItem(SYNC_CHECKPOINT_KEY);
      
      await this.addSyncLog('push', 'all', 0, 'success', 'All cloud data cleared');
      console.log('[Sync] All cloud data cleared successfully');
    } catch (error) {
      console.error('[Sync] Error clearing cloud data:', error);
      await this.addSyncLog('push', 'all', 0, 'error', `Failed to clear cloud data: ${error}`);
      throw error;
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

  private async pushSettings(settings: Settings) {
    try {
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

      if (existing) {
        await supabase.from('settings').update(settingsData).eq('id', existing.id);
      } else {
        await supabase.from('settings').insert(settingsData);
      }
    } catch (error) {
      console.error('[Sync] Error pushing settings:', error);
    }
  }

  private async pullCloudChanges() {
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
    
    if (count > 0) {
      await this.addSyncLog('pull', 'products', count, 'success', `Pulled ${count} products`);
    }
  }

  private async pullCustomers() {
    const { data: cloudCustomers, error } = await supabase.from('customers').select('*');
    
    if (error || !cloudCustomers) return;

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
      }
    }
    
    if (count > 0) {
      await this.addSyncLog('pull', 'customers', count, 'success', `Pulled ${count} customers`);
    }
  }

  private async pullSales() {
    const { data: cloudSales, error } = await supabase.from('sales').select('*');
    
    if (error || !cloudSales) return;

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
    
    if (count > 0) {
      await this.addSyncLog('pull', 'sales', count, 'success', `Pulled ${count} sales`);
    }
  }

  private async pullExpenses() {
    const { data: cloudExpenses, error } = await supabase.from('expenses').select('*');
    
    if (error || !cloudExpenses) return;

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
    
    if (count > 0) {
      await this.addSyncLog('pull', 'expenses', count, 'success', `Pulled ${count} expenses`);
    }
  }

  private async pullCashiers() {
    const { data: cloudCashiers, error } = await supabase.from('cashiers').select('*');
    
    if (error || !cloudCashiers) return;

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
    
    if (count > 0) {
      await this.addSyncLog('pull', 'cashiers', count, 'success', `Pulled ${count} cashiers`);
    }
  }

  private async pullCategories() {
    const { data: cloudCategories, error } = await supabase.from('categories').select('*');
    
    if (error || !cloudCategories) return;

    let count = 0;
    for (const cloud of cloudCategories) {
      const localCategory = await db.categories.where('name').equals(cloud.name).first();
      if (!localCategory) {
        await db.categories.add({ name: cloud.name });
        count++;
      }
    }
    
    if (count > 0) {
      await this.addSyncLog('pull', 'categories', count, 'success', `Pulled ${count} categories`);
    }
  }

  private async pullSuppliers() {
    const { data: cloudSuppliers, error } = await supabase.from('suppliers').select('*');
    
    if (error || !cloudSuppliers) return;

    let count = 0;
    for (const cloud of cloudSuppliers) {
      const localSupplier = await db.suppliers.where('name').equals(cloud.name).first();
      if (!localSupplier) {
        await db.suppliers.add({ name: cloud.name, contact: cloud.contact || undefined });
        count++;
      }
    }
    
    if (count > 0) {
      await this.addSyncLog('pull', 'suppliers', count, 'success', `Pulled ${count} suppliers`);
    }
  }

  private async pullUnits() {
    const { data: cloudUnits, error } = await supabase.from('units').select('*');
    
    if (error || !cloudUnits) return;

    let count = 0;
    for (const cloud of cloudUnits) {
      const localUnit = await db.units.where('name').equals(cloud.name).first();
      if (!localUnit) {
        await db.units.add({ name: cloud.name, symbol: cloud.symbol });
        count++;
      }
    }
    
    if (count > 0) {
      await this.addSyncLog('pull', 'units', count, 'success', `Pulled ${count} units`);
    }
  }

  private async pullQuickQuantities() {
    const { data: cloudQtys, error } = await supabase.from('quick_quantities').select('*');
    
    if (error || !cloudQtys) return;

    let count = 0;
    for (const cloud of cloudQtys) {
      const localQty = await db.quickQuantities.where('label').equals(cloud.label).first();
      if (!localQty) {
        await db.quickQuantities.add({ value: Number(cloud.value), label: cloud.label });
        count++;
      }
    }
    
    if (count > 0) {
      await this.addSyncLog('pull', 'quick_quantities', count, 'success', `Pulled ${count} quick quantities`);
    }
  }

  private async pullSettings() {
    const { data: cloudSettings, error } = await supabase.from('settings').select('*').limit(1);
    
    if (error || !cloudSettings || cloudSettings.length === 0) return;

    const cloud = cloudSettings[0];
    const localSettings = await db.settings.toArray();
    
    if (localSettings.length > 0) {
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
