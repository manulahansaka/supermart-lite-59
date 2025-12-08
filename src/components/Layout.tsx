import { useEffect, useState } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Package, ShoppingCart, Settings, Users, BarChart3, Database, Receipt, Calculator, Menu, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { SyncStatus } from '@/components/SyncStatus';

const Layout = () => {
  const location = useLocation();
  const [cashierRole, setCashierRole] = useState<'super_admin' | 'admin' | 'cashier'>('admin');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  useEffect(() => {
    const cashierData = localStorage.getItem('cashier');
    if (cashierData) {
      const cashier = JSON.parse(cashierData);
      setCashierRole(cashier.role);
    }
  }, []);

  useEffect(() => {
    // Close sidebar on route change (mobile)
    setIsSidebarOpen(false);
  }, [location.pathname]);

  const allNavItems = [
    { icon: LayoutDashboard, label: 'Dashboard', path: '/dashboard', roles: ['super_admin', 'admin'] },
    { icon: ShoppingCart, label: 'Sales', path: '/sales', roles: ['super_admin', 'admin', 'cashier'] },
    { icon: Package, label: 'Products', path: '/products', roles: ['super_admin', 'admin'] },
    { icon: Users, label: 'Customers', path: '/customers', roles: ['super_admin', 'admin'] },
    { icon: BarChart3, label: 'Reports', path: '/reports', roles: ['super_admin', 'admin'] },
    { icon: Receipt, label: 'Expenses', path: '/expenses', roles: ['super_admin', 'admin'] },
    { icon: Calculator, label: 'Accounting', path: '/accounting', roles: ['super_admin', 'admin'] },
    { icon: Database, label: 'Export', path: '/export', roles: ['super_admin', 'admin'] },
    { icon: Settings, label: 'Settings', path: '/settings', roles: ['super_admin', 'admin'] }
  ];

  const navItems = allNavItems.filter(item => item.roles.includes(cashierRole));

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-50 bg-card border-b border-border px-4 py-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-primary">SuperMart POS</h1>
        <div className="flex items-center gap-2">
          <SyncStatus />
          <Button 
            variant="ghost" 
            size="icon"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          >
            {isSidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div 
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed lg:static inset-y-0 left-0 z-50 w-64 bg-card border-r border-border flex flex-col transition-transform duration-300",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="p-6 border-b border-border">
          <h1 className="text-2xl font-bold text-primary">SuperMart POS</h1>
          <p className="text-sm text-muted-foreground mt-1">Point of Sale System</p>
        </div>
        
        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-lg transition-all",
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-md" 
                    : "text-foreground hover:bg-secondary"
                )}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border space-y-3">
          <SyncStatus />
          <div className="bg-secondary rounded-lg p-3">
            <p className="text-sm font-medium capitalize">
              {cashierRole === 'super_admin' ? 'Super Admin' : cashierRole === 'admin' ? 'Admin' : 'Cashier'}
            </p>
            <p className="text-xs text-muted-foreground">
              {localStorage.getItem('cashier') ? JSON.parse(localStorage.getItem('cashier')!).name : 'Unknown'}
            </p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto pt-16 lg:pt-0">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
