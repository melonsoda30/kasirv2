import type { DateRange } from "react-day-picker";
import { formatDateRange } from "@/lib/date";

export const transactionStatusOptions = [
  { value: "all", label: "Semua" },
  { value: "pending", label: "Menunggu pembayaran" },
  { value: "completed", label: "Lunas" },
  { value: "cancelled", label: "Dibatalkan" },
  { value: "refund_partial", label: "Refund parsial" },
  { value: "refund_full", label: "Refund penuh" },
] as const;

export interface SalesFilters {
  dateRange: DateRange | undefined;
  paymentMethod: string;
  store: string;
  cashier: string;
  product: string;
  status: typeof transactionStatusOptions[number]["value"];
}

export type TransactionFilters = Partial<Pick<SalesFilters, "dateRange" | "paymentMethod" | "cashier" | "status">> & {
  branchId?: string;
  sales?: string;
};

export const defaultSalesFilters: SalesFilters = {
  dateRange: undefined,
  paymentMethod: "all",
  store: "all",
  cashier: "all",
  product: "all",
  status: "all",
};

export const cashiers = ["Kasir 1", "Kasir 2"];

export function salesFilterChips(
  filters: SalesFilters,
  products: { id: string; title: string }[],
  stores: { value: string; label: string }[] = [],
  cashiers: { value: string; label: string }[] = [],
  paymentOptions: { value: string; label: string }[] = [],
) {
  const chips: { key: keyof SalesFilters; label: string }[] = [];
  if (filters.dateRange?.from)
    chips.push({ key: "dateRange", label: formatDateRange(filters.dateRange) });
  if (filters.paymentMethod !== "all")
    chips.push({ key: "paymentMethod", label: paymentOptions.find((option) => option.value === filters.paymentMethod)?.label ?? filters.paymentMethod });
  if (filters.status !== "all") {
    const status = transactionStatusOptions.find(({ value }) => value === filters.status);
    if (status) chips.push({ key: "status", label: status.label });
  }
  if (filters.store !== "all")
    chips.push({ key: "store", label: stores.find((option) => option.value === filters.store)?.label ?? filters.store });
  if (filters.cashier !== "all")
    chips.push({ key: "cashier", label: cashiers.find((option) => option.value === filters.cashier)?.label ?? filters.cashier });
  if (filters.product !== "all")
    chips.push({
      key: "product",
      label:
        products.find((item) => item.id === filters.product)?.title ??
        "Produk dipilih",
    });
  return chips;
}
