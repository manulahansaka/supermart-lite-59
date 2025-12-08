-- Create products table
CREATE TABLE IF NOT EXISTS public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id INTEGER,
  device_id TEXT,
  barcode TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT,
  cost_price NUMERIC(10,2) NOT NULL,
  selling_price NUMERIC(10,2) NOT NULL,
  stock INTEGER DEFAULT 0,
  min_stock INTEGER DEFAULT 0,
  unit TEXT DEFAULT 'piece',
  image TEXT,
  supplier TEXT,
  discount_percent NUMERIC(5,2),
  discount_start_date TIMESTAMPTZ,
  discount_end_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create customers table
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id INTEGER,
  device_id TEXT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  email TEXT,
  loyalty_points INTEGER DEFAULT 0,
  total_purchases NUMERIC(10,2) DEFAULT 0,
  loan_balance NUMERIC(10,2) DEFAULT 0,
  loan_purchases JSONB DEFAULT '[]',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create sales table
CREATE TABLE IF NOT EXISTS public.sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id INTEGER,
  device_id TEXT,
  items JSONB NOT NULL,
  subtotal NUMERIC(10,2) NOT NULL,
  tax NUMERIC(10,2) DEFAULT 0,
  discount NUMERIC(10,2) DEFAULT 0,
  total NUMERIC(10,2) NOT NULL,
  payment_method TEXT NOT NULL,
  amount_paid NUMERIC(10,2) NOT NULL,
  change NUMERIC(10,2) DEFAULT 0,
  customer_id UUID REFERENCES public.customers(id),
  customer_name TEXT,
  cashier TEXT NOT NULL,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  print_count INTEGER DEFAULT 0,
  print_history JSONB DEFAULT '[]',
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create expenses table
CREATE TABLE IF NOT EXISTS public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id INTEGER,
  device_id TEXT,
  category TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(10,2) NOT NULL,
  date TIMESTAMPTZ NOT NULL,
  payment_method TEXT DEFAULT 'cash',
  expense_type TEXT DEFAULT 'business',
  receipt TEXT,
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create cashiers table
CREATE TABLE IF NOT EXISTS public.cashiers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id INTEGER,
  device_id TEXT,
  name TEXT NOT NULL UNIQUE,
  pin TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'admin', 'cashier')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create categories table
CREATE TABLE IF NOT EXISTS public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id INTEGER,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create suppliers table
CREATE TABLE IF NOT EXISTS public.suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id INTEGER,
  name TEXT NOT NULL UNIQUE,
  contact TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create units table
CREATE TABLE IF NOT EXISTS public.units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id INTEGER,
  name TEXT NOT NULL UNIQUE,
  symbol TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create quick_quantities table
CREATE TABLE IF NOT EXISTS public.quick_quantities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_id INTEGER,
  value NUMERIC(5,2) NOT NULL,
  label TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create settings table
CREATE TABLE IF NOT EXISTS public.settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_name TEXT NOT NULL,
  store_address TEXT,
  store_phone TEXT,
  store_mobile TEXT,
  store_mobile2 TEXT,
  tax_rate NUMERIC(5,2) DEFAULT 10,
  currency TEXT DEFAULT 'LKR',
  receipt_header TEXT,
  receipt_footer TEXT,
  logo TEXT,
  export_file_name TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security on all tables
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cashiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quick_quantities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Create permissive policies for all tables (will tighten with authentication later)
CREATE POLICY "Allow all operations on products" ON public.products FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on customers" ON public.customers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on sales" ON public.sales FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on expenses" ON public.expenses FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on cashiers" ON public.cashiers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on categories" ON public.categories FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on suppliers" ON public.suppliers FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on units" ON public.units FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on quick_quantities" ON public.quick_quantities FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all operations on settings" ON public.settings FOR ALL USING (true) WITH CHECK (true);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_products_device_id ON public.products(device_id);
CREATE INDEX IF NOT EXISTS idx_products_local_id ON public.products(local_id);
CREATE INDEX IF NOT EXISTS idx_sales_timestamp ON public.sales(timestamp);
CREATE INDEX IF NOT EXISTS idx_sales_device_id ON public.sales(device_id);
CREATE INDEX IF NOT EXISTS idx_customers_device_id ON public.customers(device_id);