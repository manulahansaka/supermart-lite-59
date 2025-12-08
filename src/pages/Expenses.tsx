import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { db, Expense } from "@/lib/db";
import { syncService } from "@/lib/syncService";
import { toast } from "sonner";
import { useLiveQuery } from "dexie-react-hooks";
import { Plus, Trash2 } from "lucide-react";
import { format } from "date-fns";

const expenseCategories = [
  "Rent",
  "Utilities",
  "Salaries",
  "Supplies",
  "Maintenance",
  "Marketing",
  "Transportation",
  "Insurance",
  "Other"
];

const Expenses = () => {
  const expenses = useLiveQuery(() => 
    db.expenses.orderBy('date').reverse().toArray()
  );
  const cashier = useLiveQuery(() => db.cashiers.toArray());

  const [newExpense, setNewExpense] = useState<Partial<Expense>>({
    category: "Other",
    description: "",
    amount: 0,
    date: new Date(),
    paymentMethod: "cash",
    expenseType: "business",
  });
  
  const [showPersonalExpenses, setShowPersonalExpenses] = useState(true);

  const handleAddExpense = async () => {
    if (!newExpense.description || !newExpense.amount || newExpense.amount <= 0) {
      toast.error("Please fill all required fields");
      return;
    }

    try {
      const expenseId = await db.expenses.add({
        category: newExpense.category || "Other",
        description: newExpense.description,
        amount: newExpense.amount,
        date: newExpense.date || new Date(),
        paymentMethod: newExpense.paymentMethod || "cash",
        expenseType: newExpense.expenseType || "business",
        createdBy: cashier?.[0]?.name || "Admin",
        createdAt: new Date(),
      });

      // Sync new expense to cloud
      const addedExpense = await db.expenses.get(expenseId);
      if (addedExpense) {
        await syncService.pushExpenseInstant(addedExpense);
      }

      setNewExpense({
        category: "Other",
        description: "",
        amount: 0,
        date: new Date(),
        paymentMethod: "cash",
        expenseType: "business",
      });

      toast.success("Expense added successfully");
    } catch (error) {
      console.error("Error adding expense:", error);
      toast.error("Failed to add expense");
    }
  };

  const handleDeleteExpense = async (id: number) => {
    try {
      // Get expense before deleting for cloud sync
      const expense = await db.expenses.get(id);
      if (expense) {
        await db.expenses.delete(id);
        // Sync deletion to cloud
        await syncService.deleteExpenseFromCloud(syncService.getDeviceId(), id);
      }
      toast.success("Expense deleted successfully");
    } catch (error) {
      console.error("Error deleting expense:", error);
      toast.error("Failed to delete expense");
    }
  };

  const filteredExpenses = showPersonalExpenses 
    ? expenses 
    : expenses?.filter(exp => exp.expenseType !== 'personal');
  
  const businessExpenses = expenses?.filter(exp => exp.expenseType !== 'personal') || [];
  const personalExpenses = expenses?.filter(exp => exp.expenseType === 'personal') || [];
  
  const totalBusinessExpenses = businessExpenses.reduce((sum, exp) => sum + exp.amount, 0);
  const totalPersonalExpenses = personalExpenses.reduce((sum, exp) => sum + exp.amount, 0);

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Expense Management</h1>
        <p className="text-muted-foreground mt-2">Track and manage business & personal expenses</p>
      </div>

      <div className="grid gap-6 md:grid-cols-4 mb-6">
        <Card>
          <CardHeader>
            <CardTitle>Business Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">LKR {totalBusinessExpenses.toFixed(2)}</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Personal Expenses</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-muted-foreground">LKR {totalPersonalExpenses.toFixed(2)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>This Month (Business)</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              LKR{" "}
              {(
                businessExpenses?.filter(
                  (exp) =>
                    new Date(exp.date).getMonth() === new Date().getMonth() &&
                    new Date(exp.date).getFullYear() === new Date().getFullYear()
                ).reduce((sum, exp) => sum + exp.amount, 0) || 0
              ).toFixed(2)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Total Records</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{expenses?.length || 0}</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Add New Expense</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <Label htmlFor="category">Category</Label>
              <Select
                value={newExpense.category}
                onValueChange={(value) =>
                  setNewExpense({ ...newExpense, category: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {expenseCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={newExpense.description}
                onChange={(e) =>
                  setNewExpense({ ...newExpense, description: e.target.value })
                }
                placeholder="Enter description"
              />
            </div>

            <div>
              <Label htmlFor="amount">Amount (LKR)</Label>
              <Input
                id="amount"
                type="number"
                value={newExpense.amount}
                onChange={(e) =>
                  setNewExpense({ ...newExpense, amount: parseFloat(e.target.value) })
                }
                placeholder="0.00"
              />
            </div>

            <div>
              <Label htmlFor="date">Date</Label>
              <Input
                id="date"
                type="date"
                value={format(newExpense.date || new Date(), "yyyy-MM-dd")}
                onChange={(e) =>
                  setNewExpense({ ...newExpense, date: new Date(e.target.value) })
                }
              />
            </div>

            <div>
              <Label htmlFor="paymentMethod">Payment Method</Label>
              <Select
                value={newExpense.paymentMethod}
                onValueChange={(value: "cash" | "card") =>
                  setNewExpense({ ...newExpense, paymentMethod: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cash">Cash</SelectItem>
                  <SelectItem value="card">Card</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="expenseType">Expense Type</Label>
              <Select
                value={newExpense.expenseType || "business"}
                onValueChange={(value: "business" | "personal") =>
                  setNewExpense({ ...newExpense, expenseType: value })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="business">Business</SelectItem>
                  <SelectItem value="personal">Personal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button onClick={handleAddExpense} className="w-full">
                <Plus className="mr-2 h-4 w-4" />
                Add Expense
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>Expense History</CardTitle>
          <div className="flex items-center gap-2">
            <Label htmlFor="showPersonal" className="text-sm font-normal cursor-pointer">
              Show Personal
            </Label>
            <input
              id="showPersonal"
              type="checkbox"
              checked={showPersonalExpenses}
              onChange={(e) => setShowPersonalExpenses(e.target.checked)}
              className="cursor-pointer"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead>Added By</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExpenses?.map((expense) => (
                <TableRow key={expense.id} className={expense.expenseType === 'personal' ? 'bg-muted/50' : ''}>
                  <TableCell>{format(new Date(expense.date), "PP")}</TableCell>
                  <TableCell>
                    <span className={`text-xs px-2 py-1 rounded ${
                      expense.expenseType === 'personal' 
                        ? 'bg-muted text-muted-foreground' 
                        : 'bg-primary/10 text-primary'
                    }`}>
                      {expense.expenseType === 'personal' ? 'Personal' : 'Business'}
                    </span>
                  </TableCell>
                  <TableCell>{expense.category}</TableCell>
                  <TableCell>{expense.description}</TableCell>
                  <TableCell>LKR {expense.amount.toFixed(2)}</TableCell>
                  <TableCell className="capitalize">{expense.paymentMethod}</TableCell>
                  <TableCell>{expense.createdBy}</TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => expense.id && handleDeleteExpense(expense.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {!filteredExpenses || filteredExpenses.length === 0 && (
            <p className="text-center text-muted-foreground py-8">No expenses recorded yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default Expenses;
