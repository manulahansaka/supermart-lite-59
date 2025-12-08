import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Upload } from "lucide-react";
import { db } from "@/lib/db";
import { toast } from "sonner";
import { useLiveQuery } from "dexie-react-hooks";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { useState } from "react";
import { SystemRestore } from "@/components/SystemRestore";

const Export = () => {
  const settings = useLiveQuery(() => db.settings.toArray());
  const [exportOptions, setExportOptions] = useState({
    products: true,
    sales: true,
    customers: true,
    settings: true,
    categories: true,
    suppliers: true,
    units: true,
    cashiers: true,
    expenses: true,
    quickQuantities: true,
  });

  const handleExport = async () => {
    try {
      const data: any = {
        exportDate: new Date().toISOString(),
      };

      if (exportOptions.products) data.products = await db.products.toArray();
      if (exportOptions.sales) data.sales = await db.sales.toArray();
      if (exportOptions.customers) data.customers = await db.customers.toArray();
      if (exportOptions.settings) data.settings = await db.settings.toArray();
      if (exportOptions.categories) data.categories = await db.categories.toArray();
      if (exportOptions.suppliers) data.suppliers = await db.suppliers.toArray();
      if (exportOptions.units) data.units = await db.units.toArray();
      if (exportOptions.cashiers) data.cashiers = await db.cashiers.toArray();
      if (exportOptions.expenses) data.expenses = await db.expenses.toArray();
      if (exportOptions.quickQuantities) data.quickQuantities = await db.quickQuantities.toArray();

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      
      const fileName = settings?.[0]?.exportFileName || 'pos-backup';
      a.download = `${fileName}-${new Date().toISOString().split('T')[0]}.json`;
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Database exported successfully");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export database");
    }
  };

  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      await db.transaction('rw', [db.products, db.sales, db.customers, db.settings, db.categories, db.suppliers, db.units, db.cashiers, db.expenses, db.quickQuantities], async () => {
        if (data.products) await db.products.clear();
        if (data.sales) await db.sales.clear();
        if (data.customers) await db.customers.clear();
        if (data.settings) await db.settings.clear();
        if (data.categories) await db.categories.clear();
        if (data.suppliers) await db.suppliers.clear();
        if (data.units) await db.units.clear();
        if (data.cashiers) await db.cashiers.clear();
        if (data.expenses) await db.expenses.clear();
        if (data.quickQuantities) await db.quickQuantities.clear();

        if (data.products?.length) await db.products.bulkAdd(data.products);
        if (data.sales?.length) await db.sales.bulkAdd(data.sales);
        if (data.customers?.length) await db.customers.bulkAdd(data.customers);
        if (data.settings?.length) await db.settings.bulkAdd(data.settings);
        if (data.categories?.length) await db.categories.bulkAdd(data.categories);
        if (data.suppliers?.length) await db.suppliers.bulkAdd(data.suppliers);
        if (data.units?.length) await db.units.bulkAdd(data.units);
        if (data.cashiers?.length) await db.cashiers.bulkAdd(data.cashiers);
        if (data.expenses?.length) await db.expenses.bulkAdd(data.expenses);
        if (data.quickQuantities?.length) await db.quickQuantities.bulkAdd(data.quickQuantities);
      });

      toast.success("Database imported successfully");
      setTimeout(() => window.location.reload(), 1000);
    } catch (error) {
      console.error("Import error:", error);
      toast.error("Failed to import database");
    }
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-bold">Database Export & Import</h1>
        <p className="text-muted-foreground mt-2">
          Backup and restore your POS database
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Download className="h-5 w-5" />
              Export Database
            </CardTitle>
            <CardDescription>
              Download a complete backup of your database
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Select which data types to export:
            </p>
            <div className="mb-4">
              <Label htmlFor="exportFileName">Export Filename Pattern</Label>
              <Input
                id="exportFileName"
                value={settings?.[0]?.exportFileName || 'pos-backup'}
                onChange={async (e) => {
                  const existing = await db.settings.toArray();
                  if (existing.length > 0) {
                    await db.settings.update(existing[0].id!, { exportFileName: e.target.value });
                  }
                }}
                placeholder="pos-backup"
                className="mt-2"
              />
              <p className="text-xs text-muted-foreground mt-1">
                This will be used as the filename when exporting database. Date will be automatically appended.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-6">
              {Object.entries(exportOptions).map(([key, value]) => (
                <div key={key} className="flex items-center space-x-2">
                  <Checkbox
                    id={key}
                    checked={value}
                    onCheckedChange={(checked) =>
                      setExportOptions({ ...exportOptions, [key]: !!checked })
                    }
                  />
                  <Label htmlFor={key} className="text-sm capitalize cursor-pointer">
                    {key}
                  </Label>
                </div>
              ))}
            </div>
            <Button 
              onClick={handleExport} 
              className="w-full"
              disabled={!Object.values(exportOptions).some(v => v)}
            >
              <Download className="mr-2 h-4 w-4" />
              Export Selected Data
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Import Database
            </CardTitle>
            <CardDescription>
              Restore your database from a backup file
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              This will replace all current data with the data from the backup file. This action cannot be undone.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => document.getElementById('import-file')?.click()}
            >
              <Upload className="mr-2 h-4 w-4" />
              Import Database
            </Button>
            <input
              id="import-file"
              type="file"
              accept=".json"
              onChange={handleImport}
              className="hidden"
            />
          </CardContent>
        </Card>
      </div>

      {/* System Restore */}
      <SystemRestore />
    </div>
  );
};

export default Export;
