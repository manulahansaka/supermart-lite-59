import Dexie, { Table } from 'dexie';

export interface Product {
  id?: number;
  barcode: string;
  name: string;
  category: string;
  costPrice: number;
  sellingPrice: number;
  stock: number;
  minStock: number;
  unit: string;
  image?: string;
  supplier?: string;
  discountPercent?: number;
  discountStartDate?: Date;
  discountEndDate?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface Sale {
  id?: number;
  items: SaleItem[];
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  paymentMethod: 'cash' | 'card' | 'split';
  amountPaid: number;
  change: number;
  customerId?: number;
  customerName?: string;
  cashier: string;
  timestamp: Date;
  printCount: number;
  printHistory: Date[];
}

export interface SaleItem {
  productId: number;
  barcode: string;
  name: string;
  price: number;
  quantity: number;
  total: number;
  unit?: string;
  discountType?: 'percent' | 'amount';
  discountPercent?: number;
  discountAmount?: number;
}

export interface Customer {
  id?: number;
  name: string;
  phone: string;
  email?: string;
  loyaltyPoints: number;
  totalPurchases: number;
  loanBalance: number;
  loanPurchases: LoanPurchase[];
  notes?: string;
  createdAt: Date;
}

export interface LoanPurchase {
  id: string;
  items: string;
  amount: number;
  date: Date;
  paid: number;
  remaining: number;
}

export interface Settings {
  id?: number;
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  storeMobile?: string;
  storeMobile2?: string;
  taxRate: number;
  currency: string;
  receiptHeader: string;
  receiptFooter: string;
  logo?: string;
  exportFileName?: string;
}

export interface Category {
  id?: number;
  name: string;
}

export interface Supplier {
  id?: number;
  name: string;
  contact?: string;
}

export interface Unit {
  id?: number;
  name: string;
  symbol: string;
}

export interface Cashier {
  id?: number;
  name: string;
  pin: string;
  role: 'super_admin' | 'admin' | 'cashier';
  createdAt: Date;
}

export interface Expense {
  id?: number;
  category: string;
  description: string;
  amount: number;
  date: Date;
  paymentMethod: 'cash' | 'card';
  expenseType?: 'business' | 'personal';
  receipt?: string;
  createdBy: string;
  createdAt: Date;
}

export interface QuickQuantity {
  id?: number;
  value: number;
  label: string;
}

export interface SyncLog {
  id?: number;
  timestamp: Date;
  action: 'push' | 'pull' | 'realtime';
  table: string;
  recordCount: number;
  status: 'success' | 'error';
  message?: string;
}

export class POSDatabase extends Dexie {
  products!: Table<Product>;
  sales!: Table<Sale>;
  customers!: Table<Customer>;
  settings!: Table<Settings>;
  cashiers!: Table<Cashier>;
  categories!: Table<Category>;
  suppliers!: Table<Supplier>;
  units!: Table<Unit>;
  expenses!: Table<Expense>;
  quickQuantities!: Table<QuickQuantity>;
  syncLogs!: Table<SyncLog>;

  constructor() {
    super('SuperMartPOS');
    this.version(5).stores({
      products: '++id, barcode, name, category, stock',
      sales: '++id, timestamp, customerId',
      customers: '++id, phone, name',
      settings: '++id',
      cashiers: '++id, name',
      categories: '++id, name',
      suppliers: '++id, name',
      units: '++id, name',
      expenses: '++id, date, category',
      quickQuantities: '++id, value'
    }).upgrade(tx => {
      return tx.table('products').toCollection().modify(product => {
        if (!product.unit) {
          product.unit = 'piece';
        }
      });
    });

    // Version 6: Add label index to quickQuantities for sync
    this.version(6).stores({
      products: '++id, barcode, name, category, stock',
      sales: '++id, timestamp, customerId',
      customers: '++id, phone, name',
      settings: '++id',
      cashiers: '++id, name',
      categories: '++id, name',
      suppliers: '++id, name',
      units: '++id, name',
      expenses: '++id, date, category',
      quickQuantities: '++id, value, label'
    });

    // Version 7: Add syncLogs table
    this.version(7).stores({
      products: '++id, barcode, name, category, stock',
      sales: '++id, timestamp, customerId',
      customers: '++id, phone, name',
      settings: '++id',
      cashiers: '++id, name',
      categories: '++id, name',
      suppliers: '++id, name',
      units: '++id, name',
      expenses: '++id, date, category',
      quickQuantities: '++id, value, label',
      syncLogs: '++id, timestamp, action, table, status'
    });

    // Version 8: Add role index to cashiers for super_admin lookup
    this.version(8).stores({
      products: '++id, barcode, name, category, stock',
      sales: '++id, timestamp, customerId',
      customers: '++id, phone, name',
      settings: '++id',
      cashiers: '++id, name, role',
      categories: '++id, name',
      suppliers: '++id, name',
      units: '++id, name',
      expenses: '++id, date, category',
      quickQuantities: '++id, value, label',
      syncLogs: '++id, timestamp, action, table, status'
    });
  }
}

export const db = new POSDatabase();

// Initialize default settings
export const initializeSettings = async () => {
  const count = await db.settings.count();
  if (count === 0) {
    await db.settings.add({
      storeName: 'SuperMart POS',
      taxRate: 10,
      currency: 'LKR',
      receiptHeader: 'Thank you for shopping with us!',
      receiptFooter: 'Visit again soon!'
    });
  }
};

// Initialize default categories
export const initializeCategories = async () => {
  const count = await db.categories.count();
  if (count === 0) {
    await db.categories.bulkAdd([
      { name: 'Dairy' },
      { name: 'Bakery' },
      { name: 'Grains' },
      { name: 'Pantry' },
      { name: 'Beverages' }
    ]);
  }
};

// Initialize default suppliers
export const initializeSuppliers = async () => {
  const count = await db.suppliers.count();
  if (count === 0) {
    await db.suppliers.bulkAdd([
      { name: 'Fresh Farms', contact: '' },
      { name: 'Daily Bakery', contact: '' },
      { name: 'Global Grains', contact: '' },
      { name: 'Oil Co', contact: '' }
    ]);
  }
};

// Initialize default units
export const initializeUnits = async () => {
  const count = await db.units.count();
  if (count === 0) {
    await db.units.bulkAdd([
      { name: 'piece', symbol: 'pc' },
      { name: 'kilogram', symbol: 'kg' },
      { name: 'gram', symbol: 'g' },
      { name: 'liter', symbol: 'L' },
      { name: 'milliliter', symbol: 'mL' }
    ]);
  }
};

// Initialize default super admin account
export const initializeCashiers = async () => {
  const count = await db.cashiers.count();
  if (count === 0) {
    await db.cashiers.add({
      name: 'super_admin',
      pin: '0000',
      role: 'super_admin',
      createdAt: new Date()
    });
  }
};

// Initialize default quick quantities
export const initializeQuickQuantities = async () => {
  const count = await db.quickQuantities.count();
  if (count === 0) {
    await db.quickQuantities.bulkAdd([
      { value: 0.1, label: '0.1' },
      { value: 0.25, label: '0.25' },
      { value: 0.5, label: '0.5' },
      { value: 0.75, label: '0.75' }
    ]);
  }
};

// Initialize with sample products
export const initializeSampleData = async () => {
  const count = await db.products.count();
  if (count === 0) {
    const sampleProducts: Product[] = [
      {
        barcode: '1234567890',
        name: 'Milk 1L',
        category: 'Dairy',
        costPrice: 1.5,
        sellingPrice: 2.5,
        stock: 50,
        minStock: 10,
        unit: 'piece',
        supplier: 'Fresh Farms',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        barcode: '1234567891',
        name: 'Bread White',
        category: 'Bakery',
        costPrice: 1.0,
        sellingPrice: 1.8,
        stock: 30,
        minStock: 5,
        unit: 'piece',
        supplier: 'Daily Bakery',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        barcode: '1234567892',
        name: 'Eggs 12pk',
        category: 'Dairy',
        costPrice: 2.5,
        sellingPrice: 4.0,
        stock: 25,
        minStock: 10,
        unit: 'piece',
        supplier: 'Fresh Farms',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        barcode: '1234567893',
        name: 'Rice Basmati',
        category: 'Grains',
        costPrice: 8.0,
        sellingPrice: 12.0,
        stock: 100,
        minStock: 15,
        unit: 'kg',
        supplier: 'Global Grains',
        createdAt: new Date(),
        updatedAt: new Date()
      },
      {
        barcode: '1234567894',
        name: 'Cooking Oil 1L',
        category: 'Pantry',
        costPrice: 3.5,
        sellingPrice: 5.5,
        stock: 35,
        minStock: 10,
        unit: 'piece',
        supplier: 'Oil Co',
        createdAt: new Date(),
        updatedAt: new Date()
      }
    ];
    await db.products.bulkAdd(sampleProducts);
  }
};
