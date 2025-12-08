import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db } from '@/lib/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { ShoppingCart } from 'lucide-react';
import { SystemRestore } from '@/components/SystemRestore';
import { SyncStatus } from '@/components/SyncStatus';

const Login = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [pin, setPin] = useState('');
  const [name, setName] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const cashier = await db.cashiers
      .where('name')
      .equalsIgnoreCase(name.trim())
      .and(c => c.pin === pin)
      .first();

    if (cashier) {
      localStorage.setItem('cashier', JSON.stringify(cashier));
      toast({
        title: 'Login successful',
        description: `Welcome, ${cashier.name}!`
      });
      navigate('/sales');
    } else {
      toast({
        title: 'Login failed',
        description: 'Invalid name or PIN',
        variant: 'destructive'
      });
      setPin('');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 to-accent/10 p-4">
      {/* Sync Status in corner */}
      <div className="fixed top-4 right-4 z-50">
        <SyncStatus />
      </div>
      
      <div className="w-full max-w-md space-y-6">
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <ShoppingCart className="w-16 w-16 text-primary" />
            </div>
            <CardTitle className="text-2xl">SuperMart POS</CardTitle>
            <p className="text-muted-foreground">Cashier Login</p>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <Input
                  placeholder="Cashier Name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>
              <div>
                <Input
                  type="password"
                  placeholder="PIN"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  maxLength={6}
                />
              </div>
              <Button type="submit" className="w-full" size="lg">
                Login
              </Button>
            </form>
            <p className="text-sm text-muted-foreground mt-4 text-center">
              Default: Admin / 1234
            </p>
          </CardContent>
        </Card>
        
        <div className="text-center">
          <SystemRestore compact />
        </div>
      </div>
    </div>
  );
};

export default Login;
