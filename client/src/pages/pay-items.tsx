import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { TopBar } from "@/components/top-bar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { PayItem } from "@shared/schema";
import { Plus, Pencil, DollarSign, Check, X } from "lucide-react";

const ITEM_TYPE_LABELS: Record<string, { label: string; color: string }> = {
  EARNINGS: { label: "Earnings", color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  DEDUCTION: { label: "Deduction", color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
  ALLOWANCE: { label: "Allowance", color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  REIMBURSEMENT: { label: "Reimbursement", color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300" },
};

const emptyForm = {
  code: "",
  name: "",
  description: "",
  itemType: "EARNINGS",
  rate: "",
  multiplier: "1.00",
  isTaxable: true,
  isSuperable: true,
  isDefault: false,
};

export default function PayItemsPage() {
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<PayItem | null>(null);
  const [form, setForm] = useState(emptyForm);

  const { data: payItemsList, isLoading } = useQuery<PayItem[]>({
    queryKey: ["/api/pay-items"],
  });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      await apiRequest("POST", "/api/pay-items", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pay-items"] });
      toast({ title: "Pay item created" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Record<string, unknown> }) => {
      await apiRequest("PATCH", `/api/pay-items/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pay-items"] });
      toast({ title: "Pay item updated" });
      closeDialog();
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingItem(null);
    setForm(emptyForm);
  };

  const openEdit = (item: PayItem) => {
    setEditingItem(item);
    setForm({
      code: item.code,
      name: item.name,
      description: item.description || "",
      itemType: item.itemType,
      rate: item.rate || "",
      multiplier: item.multiplier || "1.00",
      isTaxable: item.isTaxable,
      isSuperable: item.isSuperable,
      isDefault: item.isDefault,
    });
    setDialogOpen(true);
  };

  const handleSave = () => {
    const payload = {
      ...form,
      rate: form.rate || null,
      multiplier: form.multiplier || "1.00",
    };
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const toggleActive = (item: PayItem) => {
    updateMutation.mutate({ id: item.id, data: { isActive: !item.isActive } });
  };

  if (isLoading) {
    return (
      <>
        <TopBar title="Pay Items" subtitle="Manage pay codes and rates" />
        <div className="p-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-14 w-full rounded-lg" />
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      <TopBar
        title="Pay Items"
        subtitle="Manage pay codes and rates"
        actions={
          <Button onClick={() => { setForm(emptyForm); setEditingItem(null); setDialogOpen(true); }} data-testid="button-add-pay-item">
            <Plus className="w-4 h-4 mr-2" />
            Add Pay Item
          </Button>
        }
      />
      <div className="p-6">
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Rate</TableHead>
                  <TableHead className="text-right">Multiplier</TableHead>
                  <TableHead className="text-center">Taxable</TableHead>
                  <TableHead className="text-center">Super</TableHead>
                  <TableHead className="text-center">Active</TableHead>
                  <TableHead className="w-20"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!payItemsList || payItemsList.length === 0) ? (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                      No pay items found. Add your first pay item.
                    </TableCell>
                  </TableRow>
                ) : (
                  payItemsList.map((item) => {
                    const typeConfig = ITEM_TYPE_LABELS[item.itemType] || ITEM_TYPE_LABELS.EARNINGS;
                    return (
                      <TableRow key={item.id} className={!item.isActive ? "opacity-50" : ""} data-testid={`row-pay-item-${item.id}`}>
                        <TableCell className="font-mono text-sm font-medium" data-testid={`text-pay-item-code-${item.id}`}>{item.code}</TableCell>
                        <TableCell>
                          <div>
                            <div className="font-medium text-sm">{item.name}</div>
                            {item.description && <div className="text-xs text-muted-foreground">{item.description}</div>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${typeConfig.color}`}>
                            {typeConfig.label}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {item.rate ? `$${parseFloat(item.rate).toFixed(2)}` : "—"}
                        </TableCell>
                        <TableCell className="text-right font-mono text-sm">
                          {item.multiplier ? `${parseFloat(item.multiplier).toFixed(2)}x` : "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          {item.isTaxable ? <Check className="w-4 h-4 text-green-600 mx-auto" /> : <X className="w-4 h-4 text-muted-foreground mx-auto" />}
                        </TableCell>
                        <TableCell className="text-center">
                          {item.isSuperable ? <Check className="w-4 h-4 text-green-600 mx-auto" /> : <X className="w-4 h-4 text-muted-foreground mx-auto" />}
                        </TableCell>
                        <TableCell className="text-center">
                          <Switch
                            checked={item.isActive}
                            onCheckedChange={() => toggleActive(item)}
                            data-testid={`switch-active-${item.id}`}
                          />
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => openEdit(item)} data-testid={`button-edit-${item.id}`}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      <Dialog open={dialogOpen} onOpenChange={() => closeDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Pay Item" : "Add Pay Item"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Code</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                  placeholder="ORD"
                  disabled={!!editingItem}
                  data-testid="input-pay-item-code"
                />
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.itemType} onValueChange={(v) => setForm({ ...form, itemType: v })}>
                  <SelectTrigger data-testid="select-pay-item-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="EARNINGS">Earnings</SelectItem>
                    <SelectItem value="DEDUCTION">Deduction</SelectItem>
                    <SelectItem value="ALLOWANCE">Allowance</SelectItem>
                    <SelectItem value="REIMBURSEMENT">Reimbursement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Name</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Ordinary Hours"
                data-testid="input-pay-item-name"
              />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Optional description"
                data-testid="input-pay-item-description"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Rate ($)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.rate}
                  onChange={(e) => setForm({ ...form, rate: e.target.value })}
                  placeholder="0.00"
                  data-testid="input-pay-item-rate"
                />
              </div>
              <div>
                <Label>Multiplier</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.multiplier}
                  onChange={(e) => setForm({ ...form, multiplier: e.target.value })}
                  placeholder="1.00"
                  data-testid="input-pay-item-multiplier"
                />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={form.isTaxable} onCheckedChange={(v) => setForm({ ...form, isTaxable: v })} data-testid="switch-taxable" />
                <Label className="text-sm">Taxable</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.isSuperable} onCheckedChange={(v) => setForm({ ...form, isSuperable: v })} data-testid="switch-superable" />
                <Label className="text-sm">Superable</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.isDefault} onCheckedChange={(v) => setForm({ ...form, isDefault: v })} data-testid="switch-default" />
                <Label className="text-sm">Default</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog} data-testid="button-cancel-pay-item">Cancel</Button>
            <Button
              onClick={handleSave}
              disabled={createMutation.isPending || updateMutation.isPending || !form.code || !form.name}
              data-testid="button-save-pay-item"
            >
              {(createMutation.isPending || updateMutation.isPending) ? "Saving..." : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
