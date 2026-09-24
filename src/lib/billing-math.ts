import type { Bill, BillItem, BillTotals } from "@/types";

const r2 = (n: number) => Math.round(n * 100) / 100;

export function lineTaxable(item: BillItem): number {
  return Math.max(0, item.qty * item.rate - item.discount);
}

export function lineGst(item: BillItem): number {
  return r2((lineTaxable(item) * item.gstRate) / 100);
}

export function lineTotal(item: BillItem): number {
  return r2(lineTaxable(item) + lineGst(item));
}

/** Intra-state supply (Karnataka to Karnataka): GST splits equally into CGST and SGST. */
export function computeBillTotals(bill: Pick<Bill, "items" | "payments">): BillTotals {
  const gross = r2(bill.items.reduce((s, i) => s + i.qty * i.rate, 0));
  const discount = r2(bill.items.reduce((s, i) => s + i.discount, 0));
  const taxable = r2(gross - discount);
  const gst = r2(bill.items.reduce((s, i) => s + lineGst(i), 0));
  const net = Math.round(taxable + gst);
  const paid = r2(bill.payments.reduce((s, p) => s + p.amount, 0));
  return {
    gross,
    discount,
    taxable,
    cgst: r2(gst / 2),
    sgst: r2(gst / 2),
    gst,
    net,
    paid,
    due: Math.max(0, r2(net - paid)),
  };
}
