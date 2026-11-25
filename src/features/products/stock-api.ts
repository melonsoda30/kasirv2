import { isEmptyListResponse, request } from "@/lib/api";
import { getBranchFilterId } from "@/features/auth/auth-store";

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
  branch_name?: string | null;
  quantity: number;
  product_status: string;
  updated_at: string;
  history: StockHistoryEntry[];
}

export async function fetchProductStock(signal: AbortSignal, branchId?: string) {
  const filterId = getBranchFilterId(branchId);
  const response = await request<
    | StockRecord[]
    | { status?: string; msg?: string; data?: StockRecord[] }
    | null
  >({
    url: "/admin/stock",
    method: "GET",
    params: { action: "list_stock", ...(filterId && { branch_id: filterId }) },
    signal,
  });
  if (isEmptyListResponse(response)) return [];
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

  return filterId ? records.filter((item) => item.branch_id === filterId) : records;
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
