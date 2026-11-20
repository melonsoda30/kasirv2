import { request } from "../../lib/api";

export interface StoreRecord {
  store_id: string;
  store_name: string;
  store_address: string;
  store_city: string;
  store_status: string;
  store_branch: { id: string; name: string }[];
  store_days: { days: string; date: string }[];
}

export async function fetchStore(signal?: AbortSignal): Promise<StoreRecord[]> {
  const response = await request<{
    status: string;
    msg?: string;
    data?: StoreRecord[];
  } | null>({
    url: "/store",
    method: "GET",
    params: { action: "list_store", status: "active" },
    signal,
  });
  if (response?.status && response.status !== "success") {
    throw new Error(response.msg || "Gagal memuat daftar store.");
  }
  const stores = response?.data;
  if (
    response?.status !== "success" ||
    !Array.isArray(stores) ||
    stores.some(
      (store) =>
        typeof store?.store_id !== "string" ||
        typeof store.store_name !== "string",
    )
  ) {
    throw new Error("Format daftar store dari server tidak valid.");
  }
  return stores;
}
