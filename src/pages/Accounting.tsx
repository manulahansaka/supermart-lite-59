import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/lib/db";
import { useLiveQuery } from "dexie-react-hooks";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, DollarSign, Package, FileDown, Printer } from "lucide-react";
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, eachMonthOfInterval } from "date-fns";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { toast } from "sonner";
import { BarChart, Bar, PieChart, Pie, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";

const Accounting = () => {
  const sales = useLiveQuery(() => db.sales.toArray());
  const expenses = useLiveQuery(() => db.expenses.toArray());
  const products = useLiveQuery(() => db.products.toArray());
  const settings = useLiveQuery(() => db.settings.toArray());

  const taxRate = settings?.[0]?.taxRate || 0;

  // Calculate metrics
  const totalRevenue = sales?.reduce((sum, sale) => sum + sale.total, 0) || 0;
  const totalCost = sales?.reduce((sum, sale) => {
    return sum + sale.items.reduce((itemSum, item) => {
      const product = products?.find(p => p.id === item.productId);
      return itemSum + (product?.costPrice || 0) * item.quantity;
    }, 0);
  }, 0) || 0;
  
  const totalExpenses = expenses?.filter(exp => exp.expenseType !== 'personal').reduce((sum, exp) => sum + exp.amount, 0) || 0;
  const grossProfit = totalRevenue - totalCost;
  const netProfit = grossProfit - totalExpenses;
  const totalTax = sales?.reduce((sum, sale) => sum + sale.tax, 0) || 0;

  // Current month calculations
  const currentMonth = new Date();
  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);

  const monthSales = sales?.filter(s => {
    const saleDate = new Date(s.timestamp);
    return saleDate >= monthStart && saleDate <= monthEnd;
  }) || [];

  const monthRevenue = monthSales.reduce((sum, sale) => sum + sale.total, 0);
  const monthExpenses = expenses?.filter(e => {
    const expDate = new Date(e.date);
    return e.expenseType !== 'personal' && expDate >= monthStart && expDate <= monthEnd;
  }).reduce((sum, exp) => sum + exp.amount, 0) || 0;
  const monthProfit = monthRevenue - monthExpenses;

  // Current year calculations
  const yearStart = startOfYear(currentMonth);
  const yearEnd = endOfYear(currentMonth);

  const yearSales = sales?.filter(s => {
    const saleDate = new Date(s.timestamp);
    return saleDate >= yearStart && saleDate <= yearEnd;
  }) || [];

  const yearRevenue = yearSales.reduce((sum, sale) => sum + sale.total, 0);
  const yearExpenses = expenses?.filter(e => {
    const expDate = new Date(e.date);
    return e.expenseType !== 'personal' && expDate >= yearStart && expDate <= yearEnd;
  }).reduce((sum, exp) => sum + exp.amount, 0) || 0;
  const yearProfit = yearRevenue - yearExpenses;

  // Inventory valuation
  const inventoryValue = products?.reduce((sum, p) => sum + (p.costPrice * p.stock), 0) || 0;
  const inventorySaleValue = products?.reduce((sum, p) => sum + (p.sellingPrice * p.stock), 0) || 0;

  // Category breakdown (business expenses only)
  const expensesByCategory = expenses?.filter(exp => exp.expenseType !== 'personal').reduce((acc, exp) => {
    acc[exp.category] = (acc[exp.category] || 0) + exp.amount;
    return acc;
  }, {} as Record<string, number>) || {};

  // Monthly trend data for last 6 months
  const last6Months = eachMonthOfInterval({
    start: subMonths(new Date(), 5),
    end: new Date()
  });

  const monthlyTrendData = last6Months.map(monthDate => {
    const monthStart = startOfMonth(monthDate);
    const monthEnd = endOfMonth(monthDate);
    
    const monthSalesData = sales?.filter(s => {
      const saleDate = new Date(s.timestamp);
      return saleDate >= monthStart && saleDate <= monthEnd;
    }) || [];

    const monthExpensesData = expenses?.filter(e => {
      const expDate = new Date(e.date);
      return e.expenseType !== 'personal' && expDate >= monthStart && expDate <= monthEnd;
    }) || [];

    const revenue = monthSalesData.reduce((sum, sale) => sum + sale.total, 0);
    const expense = monthExpensesData.reduce((sum, exp) => sum + exp.amount, 0);
    const tax = monthSalesData.reduce((sum, sale) => sum + (sale.tax || 0), 0);

    return {
      month: format(monthDate, 'MMM yyyy'),
      revenue: Number(revenue.toFixed(2)),
      expenses: Number(expense.toFixed(2)),
      profit: Number((revenue - expense).toFixed(2)),
      tax: Number(tax.toFixed(2))
    };
  });

  // Expense category chart data
  const expenseCategoryData = Object.entries(expensesByCategory).map(([category, amount]) => ({
    name: category,
    value: Number(amount.toFixed(2))
  }));

  // Inventory by category chart data
  const inventoryCategoryData = Object.entries(
    products?.reduce((acc, p) => {
      if (!acc[p.category]) {
        acc[p.category] = { cost: 0, retail: 0 };
      }
      acc[p.category].cost += p.costPrice * p.stock;
      acc[p.category].retail += p.sellingPrice * p.stock;
      return acc;
    }, {} as Record<string, { cost: number; retail: number }>) || {}
  ).map(([category, data]) => ({
    category,
    costValue: Number(data.cost.toFixed(2)),
    retailValue: Number(data.retail.toFixed(2))
  }));

  const COLORS = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))', 'hsl(var(--muted))', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981'];

  // PDF Export Functions
  const exportOverviewPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    
    doc.setFontSize(18);
    doc.text("Accounting Overview Report", pageWidth / 2, 15, { align: "center" });
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), "PPP")}`, pageWidth / 2, 22, { align: "center" });
    
    // Summary metrics
    autoTable(doc, {
      startY: 30,
      head: [["Metric", "Amount"]],
      body: [
        ["Total Revenue", `LKR ${(totalRevenue ?? 0).toFixed(2)}`],
        ["Total Expenses", `LKR ${(totalExpenses ?? 0).toFixed(2)}`],
        ["Net Profit", `LKR ${(netProfit ?? 0).toFixed(2)}`],
        ["Inventory Value", `LKR ${(inventoryValue ?? 0).toFixed(2)}`],
      ],
    });
    
    // Monthly summary
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [["Period", "Revenue", "Expenses", "Net Profit"]],
      body: [
        ["This Month", `LKR ${(monthRevenue ?? 0).toFixed(2)}`, `LKR ${(monthExpenses ?? 0).toFixed(2)}`, `LKR ${(monthProfit ?? 0).toFixed(2)}`],
        ["This Year", `LKR ${(yearRevenue ?? 0).toFixed(2)}`, `LKR ${(yearExpenses ?? 0).toFixed(2)}`, `LKR ${(yearProfit ?? 0).toFixed(2)}`],
      ],
    });
    
    doc.save(`accounting-overview-${format(new Date(), "yyyy-MM-dd")}.pdf`);
    toast.success("Overview report exported to PDF");
  };

  const exportProfitLossPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    
    doc.setFontSize(18);
    doc.text("Profit & Loss Statement", pageWidth / 2, 15, { align: "center" });
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), "PPP")}`, pageWidth / 2, 22, { align: "center" });
    
    // P&L Statement
    const plData = [
      ["Total Sales Revenue", `LKR ${(totalRevenue ?? 0).toFixed(2)}`],
      ["Cost of Goods Sold", `(LKR ${(totalCost ?? 0).toFixed(2)})`],
      ["Gross Profit", `LKR ${(grossProfit ?? 0).toFixed(2)}`],
      ["", ""],
      ["Operating Expenses", ""],
      ...Object.entries(expensesByCategory).map(([cat, amt]) => [`  ${cat}`, `(LKR ${(amt ?? 0).toFixed(2)})`]),
      ["Total Operating Expenses", `(LKR ${(totalExpenses ?? 0).toFixed(2)})`],
      ["", ""],
      ["Net Profit", `LKR ${(netProfit ?? 0).toFixed(2)}`],
    ];
    
    autoTable(doc, {
      startY: 30,
      head: [["Item", "Amount"]],
      body: plData,
    });
    
    // Ratios
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [["Metric", "Value"]],
      body: [
        ["Profit Margin", `${totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(2) : 0}%`],
        ["Gross Margin", `${totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(2) : 0}%`],
        ["Expense Ratio", `${totalRevenue > 0 ? ((totalExpenses / totalRevenue) * 100).toFixed(2) : 0}%`],
      ],
    });
    
    doc.save(`profit-loss-statement-${format(new Date(), "yyyy-MM-dd")}.pdf`);
    toast.success("P&L statement exported to PDF");
  };

  const exportInventoryPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    
    doc.setFontSize(18);
    doc.text("Inventory Valuation Report", pageWidth / 2, 15, { align: "center" });
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), "PPP")}`, pageWidth / 2, 22, { align: "center" });
    
    // Summary
    autoTable(doc, {
      startY: 30,
      head: [["Metric", "Amount"]],
      body: [
        ["Cost Value", `LKR ${(inventoryValue ?? 0).toFixed(2)}`],
        ["Retail Value", `LKR ${(inventorySaleValue ?? 0).toFixed(2)}`],
        ["Potential Profit", `LKR ${((inventorySaleValue ?? 0) - (inventoryValue ?? 0)).toFixed(2)}`],
      ],
    });
    
    // Category breakdown
    const categoryData = Object.entries(
      products?.reduce((acc, p) => {
        if (!acc[p.category]) {
          acc[p.category] = { count: 0, cost: 0, retail: 0 };
        }
        acc[p.category].count += p.stock;
        acc[p.category].cost += p.costPrice * p.stock;
        acc[p.category].retail += p.sellingPrice * p.stock;
        return acc;
      }, {} as Record<string, { count: number; cost: number; retail: number }>) || {}
    ).map(([category, data]) => [
      category,
      data.count.toString(),
      `LKR ${(data.cost ?? 0).toFixed(2)}`,
      `LKR ${(data.retail ?? 0).toFixed(2)}`,
      `LKR ${((data.retail ?? 0) - (data.cost ?? 0)).toFixed(2)}`,
    ]);
    
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [["Category", "Items", "Cost Value", "Retail Value", "Potential Profit"]],
      body: categoryData,
    });
    
    doc.save(`inventory-valuation-${format(new Date(), "yyyy-MM-dd")}.pdf`);
    toast.success("Inventory report exported to PDF");
  };

  const exportTaxPDF = () => {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.width;
    
    doc.setFontSize(18);
    doc.text("Tax Summary Report", pageWidth / 2, 15, { align: "center" });
    doc.setFontSize(10);
    doc.text(`Generated: ${format(new Date(), "PPP")}`, pageWidth / 2, 22, { align: "center" });
    
    // Tax summary
    autoTable(doc, {
      startY: 30,
      head: [["Metric", "Value"]],
      body: [
        ["Tax Rate", `${taxRate ?? 0}%`],
        ["Total Tax Collected", `LKR ${(totalTax ?? 0).toFixed(2)}`],
        ["Tax This Month", `LKR ${monthSales.reduce((sum, s) => sum + (s.tax ?? 0), 0).toFixed(2)}`],
      ],
    });
    
    // Recent tax history
    const taxHistory = sales?.slice(-10).reverse().map((sale) => [
      format(new Date(sale.timestamp), "PPp"),
      `LKR ${((sale.total ?? 0) - (sale.tax ?? 0)).toFixed(2)}`,
      `LKR ${(sale.tax ?? 0).toFixed(2)}`,
      `LKR ${(sale.total ?? 0).toFixed(2)}`,
    ]) || [];
    
    autoTable(doc, {
      startY: (doc as any).lastAutoTable.finalY + 10,
      head: [["Date", "Sales Amount", "Tax Collected", "Total"]],
      body: taxHistory,
    });
    
    doc.save(`tax-summary-${format(new Date(), "yyyy-MM-dd")}.pdf`);
    toast.success("Tax report exported to PDF");
  };

  const handlePrint = () => {
    window.print();
    toast.success("Print dialog opened");
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6 flex flex-col sm:flex-row items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold">Accounting & Financial Reports</h1>
          <p className="text-muted-foreground mt-2 text-sm sm:text-base">
            Comprehensive financial overview and accounting reports
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handlePrint}>
            <Printer className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Print</span>
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview" className="space-y-4 sm:space-y-6">
        <TabsList className="w-full sm:w-auto grid grid-cols-2 sm:flex">
          <TabsTrigger value="overview" className="text-xs sm:text-sm">Overview</TabsTrigger>
          <TabsTrigger value="profitloss" className="text-xs sm:text-sm">Profit & Loss</TabsTrigger>
          <TabsTrigger value="inventory" className="text-xs sm:text-sm">Inventory</TabsTrigger>
          <TabsTrigger value="tax" className="text-xs sm:text-sm">Tax</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 sm:space-y-6">
          <div className="flex justify-end mb-4">
            <Button onClick={exportOverviewPDF} size="sm">
              <FileDown className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Export to PDF</span>
            </Button>
          </div>
          <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Revenue</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">LKR {(totalRevenue ?? 0).toFixed(2)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
                <TrendingDown className="h-4 w-4 text-destructive" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-destructive">
                  LKR {(totalExpenses ?? 0).toFixed(2)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Net Profit</CardTitle>
                <TrendingUp className="h-4 w-4 text-green-600" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">
                  LKR {(netProfit ?? 0).toFixed(2)}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Inventory Value</CardTitle>
                <Package className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">LKR {(inventoryValue ?? 0).toFixed(2)}</div>
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>This Month</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Revenue:</span>
                  <span className="font-semibold">LKR {(monthRevenue ?? 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expenses:</span>
                  <span className="font-semibold text-destructive">
                    LKR {(monthExpenses ?? 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="font-medium">Net Profit:</span>
                  <span className={`font-bold ${monthProfit >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                    LKR {(monthProfit ?? 0).toFixed(2)}
                  </span>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>This Year</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Revenue:</span>
                  <span className="font-semibold">LKR {(yearRevenue ?? 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Expenses:</span>
                  <span className="font-semibold text-destructive">
                    LKR {(yearExpenses ?? 0).toFixed(2)}
                  </span>
                </div>
                <div className="flex justify-between border-t pt-2">
                  <span className="font-medium">Net Profit:</span>
                  <span className={`font-bold ${yearProfit >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                    LKR {(yearProfit ?? 0).toFixed(2)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Revenue & Expenses Trend (Last 6 Months)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={monthlyTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="revenue" fill="hsl(var(--primary))" name="Revenue" />
                  <Bar dataKey="expenses" fill="hsl(var(--destructive))" name="Expenses" />
                  <Bar dataKey="profit" fill="#10b981" name="Profit" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profitloss" className="space-y-6">
          <div className="flex justify-end mb-4">
            <Button onClick={exportProfitLossPDF} size="sm">
              <FileDown className="h-4 w-4 mr-2" />
              Export to PDF
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Profit & Loss Statement</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-semibold">Total Sales Revenue</TableCell>
                    <TableCell className="text-right font-semibold">
                      LKR {(totalRevenue ?? 0).toFixed(2)}
                    </TableCell>
                  </TableRow>
                  <TableRow>
                    <TableCell className="pl-8">Cost of Goods Sold</TableCell>
                    <TableCell className="text-right text-destructive">
                      (LKR {(totalCost ?? 0).toFixed(2)})
                    </TableCell>
                  </TableRow>
                  <TableRow className="border-t-2">
                    <TableCell className="font-semibold">Gross Profit</TableCell>
                    <TableCell className="text-right font-semibold">
                      LKR {(grossProfit ?? 0).toFixed(2)}
                    </TableCell>
                  </TableRow>
                  <TableRow className="border-t">
                    <TableCell className="font-medium pt-4">Operating Expenses</TableCell>
                    <TableCell></TableCell>
                  </TableRow>
                  {Object.entries(expensesByCategory).map(([category, amount]) => (
                    <TableRow key={category}>
                      <TableCell className="pl-8">{category}</TableCell>
                      <TableCell className="text-right text-destructive">
                        (LKR {(amount ?? 0).toFixed(2)})
                      </TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="border-t-2">
                    <TableCell className="font-semibold">Total Operating Expenses</TableCell>
                    <TableCell className="text-right font-semibold text-destructive">
                      (LKR {(totalExpenses ?? 0).toFixed(2)})
                    </TableCell>
                  </TableRow>
                  <TableRow className="border-t-2 bg-muted/50">
                    <TableCell className="font-bold text-lg">Net Profit</TableCell>
                    <TableCell className={`text-right font-bold text-lg ${netProfit >= 0 ? 'text-green-600' : 'text-destructive'}`}>
                      LKR {(netProfit ?? 0).toFixed(2)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Profit Margin</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  {totalRevenue > 0 ? ((netProfit / totalRevenue) * 100).toFixed(2) : 0}%
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Gross Margin</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  {totalRevenue > 0 ? ((grossProfit / totalRevenue) * 100).toFixed(2) : 0}%
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Expense Ratio</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  {totalRevenue > 0 ? ((totalExpenses / totalRevenue) * 100).toFixed(2) : 0}%
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Expenses Breakdown by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={expenseCategoryData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={100}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {expenseCategoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="inventory" className="space-y-6">
          <div className="flex justify-end mb-4">
            <Button onClick={exportInventoryPDF} size="sm">
              <FileDown className="h-4 w-4 mr-2" />
              Export to PDF
            </Button>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Cost Value</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">LKR {(inventoryValue ?? 0).toFixed(2)}</p>
                <p className="text-sm text-muted-foreground mt-2">Total cost of current stock</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Retail Value</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">LKR {(inventorySaleValue ?? 0).toFixed(2)}</p>
                <p className="text-sm text-muted-foreground mt-2">Potential sales value</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Potential Profit</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold text-green-600">
                  LKR {((inventorySaleValue ?? 0) - (inventoryValue ?? 0)).toFixed(2)}
                </p>
                <p className="text-sm text-muted-foreground mt-2">If all stock is sold</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Inventory Breakdown by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Items</TableHead>
                    <TableHead className="text-right">Cost Value</TableHead>
                    <TableHead className="text-right">Retail Value</TableHead>
                    <TableHead className="text-right">Potential Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(
                    products?.reduce((acc, p) => {
                      if (!acc[p.category]) {
                        acc[p.category] = { count: 0, cost: 0, retail: 0 };
                      }
                      acc[p.category].count += p.stock;
                      acc[p.category].cost += p.costPrice * p.stock;
                      acc[p.category].retail += p.sellingPrice * p.stock;
                      return acc;
                    }, {} as Record<string, { count: number; cost: number; retail: number }>) || {}
                  ).map(([category, data]) => (
                    <TableRow key={category}>
                      <TableCell className="font-medium">{category}</TableCell>
                      <TableCell className="text-right">{data.count}</TableCell>
                      <TableCell className="text-right">LKR {(data.cost ?? 0).toFixed(2)}</TableCell>
                      <TableCell className="text-right">LKR {(data.retail ?? 0).toFixed(2)}</TableCell>
                      <TableCell className="text-right text-green-600">
                        LKR {((data.retail ?? 0) - (data.cost ?? 0)).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Inventory Value by Category</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={inventoryCategoryData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="category" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey="costValue" fill="hsl(var(--primary))" name="Cost Value" />
                  <Bar dataKey="retailValue" fill="#10b981" name="Retail Value" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tax" className="space-y-6">
          <div className="flex justify-end mb-4">
            <Button onClick={exportTaxPDF} size="sm">
              <FileDown className="h-4 w-4 mr-2" />
              Export to PDF
            </Button>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Tax Rate</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">{taxRate}%</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Total Tax Collected</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">LKR {(totalTax ?? 0).toFixed(2)}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Tax This Month</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-3xl font-bold">
                  LKR {monthSales.reduce((sum, s) => sum + (s.tax ?? 0), 0).toFixed(2)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Tax Collection History</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Sales Amount</TableHead>
                    <TableHead className="text-right">Tax Collected</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales?.slice(-10).reverse().map((sale) => (
                    <TableRow key={sale.id}>
                      <TableCell>{format(new Date(sale.timestamp), "PPp")}</TableCell>
                      <TableCell className="text-right">
                        LKR {((sale.total ?? 0) - (sale.tax ?? 0)).toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right">LKR {(sale.tax ?? 0).toFixed(2)}</TableCell>
                      <TableCell className="text-right font-semibold">
                        LKR {(sale.total ?? 0).toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tax Collection Trend (Last 6 Months)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={monthlyTrendData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="month" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line type="monotone" dataKey="tax" stroke="hsl(var(--primary))" strokeWidth={2} name="Tax Collected" />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Accounting;
