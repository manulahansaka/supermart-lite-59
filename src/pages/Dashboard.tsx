import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DollarSign, ShoppingBag, Package, TrendingUp, AlertTriangle } from 'lucide-react';
import { db } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';

const Dashboard = () => {
  const navigate = useNavigate();
  const [todaySales, setTodaySales] = useState(0);
  const [todayTransactions, setTodayTransactions] = useState(0);
  const [showAllLowStock, setShowAllLowStock] = useState(false);

  const products = useLiveQuery(() => db.products.toArray());
  const lowStockProducts = useLiveQuery(() => 
    db.products.filter(p => p.stock <= p.minStock).toArray()
  );
  const settings = useLiveQuery(() => db.settings.toArray());
  const currency = settings && settings.length > 0 ? settings[0].currency : 'LKR';

  useEffect(() => {
    const calculateTodaySales = async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const sales = await db.sales
        .where('timestamp')
        .aboveOrEqual(today)
        .toArray();
      
      const total = sales.reduce((sum, sale) => sum + sale.total, 0);
      setTodaySales(total);
      setTodayTransactions(sales.length);
    };

    calculateTodaySales();
  }, []);

  const stats = [
    {
      title: "Today's Sales",
      value: `${currency} ${todaySales.toFixed(2)}`,
      icon: DollarSign,
      color: 'text-success',
      bgColor: 'bg-success/10'
    },
    {
      title: 'Transactions',
      value: todayTransactions.toString(),
      icon: ShoppingBag,
      color: 'text-primary',
      bgColor: 'bg-primary/10'
    },
    {
      title: 'Total Products',
      value: products?.length.toString() || '0',
      icon: Package,
      color: 'text-accent',
      bgColor: 'bg-accent/10'
    },
    {
      title: 'Low Stock Items',
      value: lowStockProducts?.length.toString() || '0',
      icon: AlertTriangle,
      color: 'text-warning',
      bgColor: 'bg-warning/10'
    }
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="mb-6 sm:mb-8">
        <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">Dashboard</h1>
        <p className="text-sm sm:text-base text-muted-foreground">Welcome back! Here's your business overview.</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="border-border hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className={cn(stat.bgColor, 'p-2 rounded-lg')}>
                  <Icon className={cn('h-5 w-5', stat.color)} />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold text-foreground">{stat.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick Actions */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-primary" />
            Quick Actions
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4">
          <Button 
            size="lg" 
            className="bg-primary hover:bg-primary/90"
            onClick={() => navigate('/sales')}
          >
            New Sale
          </Button>
          <Button 
            size="lg" 
            variant="outline"
            onClick={() => navigate('/products')}
          >
            Add Product
          </Button>
          <Button 
            size="lg" 
            variant="outline"
            onClick={() => navigate('/reports')}
          >
            View Reports
          </Button>
        </CardContent>
      </Card>

      {/* Low Stock Alert */}
      {lowStockProducts && lowStockProducts.length > 0 && (
        <Card className="border-warning">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-warning">
                <AlertTriangle className="h-5 w-5" />
                Low Stock Alert
              </span>
              {lowStockProducts.length > 5 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowAllLowStock(!showAllLowStock)}
                >
                  {showAllLowStock ? 'Show Less' : `Show All (${lowStockProducts.length})`}
                </Button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {(showAllLowStock ? lowStockProducts : lowStockProducts.slice(0, 5)).map((product) => (
                <div 
                  key={product.id} 
                  className="flex justify-between items-center p-3 bg-warning/5 rounded-lg"
                >
                  <div>
                    <p className="font-medium">{product.name}</p>
                    <p className="text-sm text-muted-foreground">{product.category}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-warning">{product.stock} units</p>
                    <p className="text-xs text-muted-foreground">Min: {product.minStock}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(' ');
}

export default Dashboard;
