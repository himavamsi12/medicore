import { addDays, format } from "date-fns";
import type { InventoryItem, InventoryRow, ListParams, NewPoInput, Paginated, PurchaseOrder, PurchaseOrderView, Vendor } from "@/types";
import { mock, notFound, ServiceError } from "./http";
import { db, nextId } from "./mappers";
import { oneOf, runQuery } from "./query";

const OPEN_PO = ["Pending approval", "Approved", "Sent", "Partially received"];

function row(item: InventoryItem): InventoryRow {
  const d = db();
  const vendor = d.vendors.find((v) => v.id === item.vendorId)!;
  const openPoQty = d.purchaseOrders
    .filter((p) => OPEN_PO.includes(p.status))
    .flatMap((p) => p.lines)
    .filter((l) => l.itemId === item.id)
    .reduce((s, l) => s + l.qty - l.receivedQty, 0);
  return {
    ...item,
    vendor,
    value: Math.round(item.stock * item.unitCost),
    daysOfCover: item.avgDailyUsage > 0 ? Math.round((item.stock / item.avgDailyUsage) * 10) / 10 : 999,
    status: item.stock === 0 ? "Out of stock" : item.stock < item.reorderLevel ? "Low" : "In stock",
    openPoQty,
  };
}

function poView(p: PurchaseOrder): PurchaseOrderView {
  const d = db();
  const lineItems = p.lines.map((l) => ({ ...l, item: d.inventory.find((i) => i.id === l.itemId)! }));
  return {
    ...p,
    vendor: d.vendors.find((v) => v.id === p.vendorId)!,
    total: Math.round(p.lines.reduce((s, l) => s + l.qty * l.rate * (1 + l.gstRate / 100), 0)),
    itemCount: p.lines.length,
    lineItems,
  };
}

export const inventoryService = {
  getItems(params: ListParams = {}): Promise<Paginated<InventoryRow>> {
    return mock(() =>
      runQuery(db().inventory.map(row), params, {
        search: (r) => [r.name, r.sku, r.vendor.name, r.category, r.store],
        filters: { category: (r, v) => oneOf(r.category, v), status: (r, v) => oneOf(r.status, v), store: (r, v) => oneOf(r.store, v) },
        sort: { name: (r) => r.name, stock: (r) => r.stock, daysOfCover: (r) => r.daysOfCover, value: (r) => r.value, category: (r) => r.category },
        defaultSort: { id: "daysOfCover", desc: false },
      }),
    );
  },

  getVendors(): Promise<Vendor[]> {
    return mock(() => db().vendors, { min: 50, max: 120 });
  },

  getPurchaseOrders(params: ListParams = {}): Promise<Paginated<PurchaseOrderView>> {
    return mock(() =>
      runQuery(db().purchaseOrders.map(poView), params, {
        search: (r) => [r.poNo, r.vendor.name, ...r.lineItems.map((l) => l.item.name)],
        filters: { status: (r, v) => oneOf(r.status, v), vendorId: (r, v) => oneOf(r.vendorId, v) },
        sort: { createdAt: (r) => r.createdAt, total: (r) => r.total, vendor: (r) => r.vendor.name, expectedAt: (r) => r.expectedAt },
        date: (r) => r.createdAt,
        defaultSort: { id: "createdAt", desc: true },
      }),
    );
  },

  getPurchaseOrder(id: string): Promise<PurchaseOrderView> {
    return mock(() => poView(db().purchaseOrders.find((p) => p.id === id) ?? notFound("Purchase order", id)));
  },

  createPurchaseOrder(input: NewPoInput, createdBy: string, submit: boolean): Promise<PurchaseOrderView> {
    return mock(() => {
      const d = db();
      if (!input.lines.length) throw new ServiceError("Add at least one item");
      const id = nextId("PO", d.purchaseOrders, 4);
      const po: PurchaseOrder = {
        id,
        poNo: `PO/26-27/${String(400 + d.purchaseOrders.length).padStart(4, "0")}`,
        vendorId: input.vendorId,
        createdAt: new Date().toISOString(),
        expectedAt: input.expectedAt,
        status: submit ? "Pending approval" : "Draft",
        lines: input.lines.map((l) => ({ ...l, receivedQty: 0 })),
        createdBy,
        notes: input.notes,
      };
      d.purchaseOrders.unshift(po);
      return poView(po);
    });
  },

  /** Suggested reorder quantities for items below reorder level, grouped by vendor. */
  getReorderSuggestions(): Promise<{ vendor: Vendor; lines: { item: InventoryItem; qty: number }[] }[]> {
    return mock(() => {
      const d = db();
      const low = d.inventory.map(row).filter((r) => r.stock + r.openPoQty < r.reorderLevel);
      const byVendor = new Map<string, { item: InventoryItem; qty: number }[]>();
      for (const r of low) {
        const list = byVendor.get(r.vendorId) ?? [];
        list.push({ item: r, qty: Math.max(1, r.maxLevel - r.stock - r.openPoQty) });
        byVendor.set(r.vendorId, list);
      }
      return [...byVendor.entries()].map(([vid, lines]) => ({ vendor: d.vendors.find((v) => v.id === vid)!, lines }));
    });
  },

  approve(id: string, by: string): Promise<PurchaseOrderView> {
    return mock(() => {
      const p = db().purchaseOrders.find((x) => x.id === id) ?? notFound("Purchase order", id);
      if (p.status !== "Pending approval") throw new ServiceError(`PO is ${p.status.toLowerCase()}`);
      Object.assign(p, { status: "Approved", approvedBy: by, approvedAt: new Date().toISOString() });
      return poView(p);
    });
  },

  setStatus(id: string, status: PurchaseOrder["status"]): Promise<PurchaseOrderView> {
    return mock(() => {
      const p = db().purchaseOrders.find((x) => x.id === id) ?? notFound("Purchase order", id);
      p.status = status;
      if (status === "Sent") p.expectedAt = format(addDays(new Date(), db().vendors.find((v) => v.id === p.vendorId)?.leadTimeDays ?? 5), "yyyy-MM-dd");
      return poView(p);
    });
  },

  /** Goods receipt: adds received quantities to stock (GRN). */
  receive(id: string, received: { itemId: string; qty: number }[]): Promise<PurchaseOrderView> {
    return mock(() => {
      const d = db();
      const p = d.purchaseOrders.find((x) => x.id === id) ?? notFound("Purchase order", id);
      for (const r of received) {
        const line = p.lines.find((l) => l.itemId === r.itemId);
        const item = d.inventory.find((i) => i.id === r.itemId);
        if (!line || !item) continue;
        const qty = Math.min(r.qty, line.qty - line.receivedQty);
        line.receivedQty += qty;
        item.stock += qty;
        item.lastReceivedAt = format(new Date(), "yyyy-MM-dd");
      }
      p.status = p.lines.every((l) => l.receivedQty >= l.qty) ? "Received" : "Partially received";
      return poView(p);
    });
  },

  stats(): Promise<{ lowStock: number; outOfStock: number; inventoryValue: number; pendingApproval: number; openPoValue: number }> {
    return mock(() => {
      const rows = db().inventory.map(row);
      const pos = db().purchaseOrders.map(poView);
      return {
        lowStock: rows.filter((r) => r.status === "Low").length,
        outOfStock: rows.filter((r) => r.status === "Out of stock").length,
        inventoryValue: rows.reduce((s, r) => s + r.value, 0),
        pendingApproval: pos.filter((p) => p.status === "Pending approval").length,
        openPoValue: pos.filter((p) => OPEN_PO.includes(p.status)).reduce((s, p) => s + p.total, 0),
      };
    });
  },
};
