import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/features/auth/auth-store";
import { API_BASE_URL, request } from "@/lib/api";

type SettingItem = { code: string; title: string; is_active: boolean };

export type StoreSettings = {
  store_id: string;
  shift: (SettingItem & { start_time?: string; end_time?: string })[];
  shift_mode?: "none" | "shift";
  cash_tolerance?: number;
  ppn: { value: number; is_active: boolean };
  payment: (SettingItem & { type: string; fee_code: string | null; image?: string })[];
  fee: (Omit<SettingItem, "is_active"> & { type: string; fee: number; fee_type: string; is_active?: boolean })[];
};

export const settingsUrl = "/admin/setting.php";

export async function fetchStoreSettings(signal?: AbortSignal): Promise<StoreSettings> {
  const response = await request<{ status: string; msg?: string; data?: StoreSettings } | null>({
    url: settingsUrl,
    method: "GET",
    params: { action: "setting" },
    signal,
  });
  if (response?.status !== "success" || !response.data) {
    throw new Error(response?.msg || "Gagal memuat pengaturan.");
  }
  const data = response.data;
  const payment = data.payment ?? [];
  const fee = data.fee ?? [];
  if (!Array.isArray(payment) || !Array.isArray(fee)) {
    throw new Error("Format metode pembayaran dan biaya dari server tidak valid.");
  }
  return { ...data, payment, fee };
}

export function useStoreSettings() {
  const username = useAuthStore((state) => state.session?.account.account_username);
  const queryKey = ["admin", "settings", username] as const;
  const query = useQuery({
    queryKey,
    enabled: !!username,
    queryFn: ({ signal }) => fetchStoreSettings(signal),
    meta: { toast: false },
  });
  return { query, queryKey };
}

export function paymentImageUrl(image?: string, directory = "admin") {
  if (!image) return undefined;
  try {
    const base = new URL(API_BASE_URL.replace(/\/$/, "") + `/${directory}/`, globalThis.location?.origin);
    const url = new URL(image, base);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
}
