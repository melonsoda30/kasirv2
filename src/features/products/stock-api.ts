import { request } from "@/lib/api";

interface StockHistoryEntry {
  at: string;
  type: string;
  before: number;
  after: number;
  delta: number;
  note: string;
  by_id: string;
  by_username: string;
  by_name: string;
}

export interface StockRecord {
  product_sku: string;
  product_name: string;
  product_category: string;
  price: string;
  store_id: string;
  branch_id: string;
  quantity: number;
  product_status: string;
  updated_at: string;
  history: StockHistoryEntry[];
}

export async function fetchProductStock(signal: AbortSignal) {
  const response = await request<
    | StockRecord[]
    | { status?: string; msg?: string; data?: StockRecord[] }
    | null
  >({
    url: "/admin/stock",
    method: "GET",
    params: { action: "list_stock" },
    signal,
  });
  if (
    !Array.isArray(response) &&
    response?.status &&
    response.status !== "success"
  ) {
    throw new Error(response.msg || "Gagal memuat stok produk.");
  }
  const records = Array.isArray(response) ? response : response?.data;
  if (!Array.isArray(records)) {
    throw new Error("Format daftar stok dari server tidak valid.");
  }

  return records;
}

export async function updateProductStock(input: {
  action: "mutasi_stock" | "set_stock";
  product_sku: string;
  quantity: number;
  note: string;
}) {
  const data = new FormData();
  data.set("action", input.action);
  data.set("product_sku", input.product_sku);
  data.set("quantity", String(input.quantity));
  data.set("note", input.note);
  const response = await request<{ status?: string; msg?: string } | null>({
    url: "/admin/stock",
    method: "POST",
    data,
  });
  if (response?.status !== "success") {
    throw new Error(response?.msg || "Gagal menyimpan perubahan stok.");
  }
  return response.msg || "Perubahan stok disimpan.";
}
