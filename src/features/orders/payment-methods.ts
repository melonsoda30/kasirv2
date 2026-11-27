import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuthStore } from "@/features/auth/auth-store";
import { paymentImageUrl } from "@/features/settings/store-settings-query";
import { isEmptyListResponse, request } from "@/lib/api";
import type { PaymentReceipt } from "./payment-details";

const paymentRecord = z.object({
  payment_code: z.string().trim().min(1),
  payment_method: z.string(),
  payment_type: z.string(),
  fee: z.coerce.number().nonnegative().nullish(),
  fee_type: z.string().nullish(),
  fee_bearer: z.string().nullish(),
  image: z.string().nullish(),
  is_active: z.boolean(),
  fee_active: z.boolean(),
});
const paymentList = z.array(paymentRecord);
const paymentSettings = z.union([
  z.object({
    payments: paymentList,
    ppn: z.object({ value: z.number().min(0).max(100), is_active: z.boolean() }),
  }),
  paymentList.transform((payments) => ({ payments, ppn: undefined })),
]);

export type PaymentMethod = PaymentReceipt["method"] & {
  image?: string;
};

export function findRecordedPaymentMethod(methods: readonly PaymentMethod[], recorded?: string) {
  const value = recorded?.trim().toLowerCase();
  return methods.find(({ code }) => code.toLowerCase() === value) ??
    methods.find(({ title }) => title.trim().toLowerCase() === value);
}

export const paymentMethodsKey = (storeId?: string) =>
  ["payment-methods", storeId] as const;

type PaymentMethodScope = "active" | "all";
type PaymentSettings = { payments: PaymentMethod[]; ppnRate?: number };

export async function fetchPaymentMethods(
  signal?: AbortSignal,
  scope: PaymentMethodScope = "active",
): Promise<PaymentSettings> {
  const response = await request<{
    status?: string;
    msg?: string;
    data?: unknown;
  } | null>({
    url: "/transaction/trx",
    method: "GET",
    params: { action: "list_payment" },
    signal,
  });
  if (isEmptyListResponse(response)) return { payments: [] };
  if (response?.status !== "success")
    throw new Error(response?.msg || "Gagal memuat metode pembayaran.");
  const parsed = paymentSettings.safeParse(response.data);
  if (!parsed.success)
    throw new Error("Format metode pembayaran dari server tidak valid.");

  const { ppn } = parsed.data;
  const ppnRate = ppn && (ppn.is_active ? ppn.value : 0);
  const payments = parsed.data.payments.flatMap<PaymentMethod>((record) => {
    if (scope === "active" && !record.is_active) return [];

    const type = record.payment_type.trim().toLowerCase();
    const code = record.payment_code.toLowerCase();
    let kind: PaymentMethod["kind"] = "noncash";
    if (type === "qris" || code === "qris") kind = "qris";
    if (type === "cash" || type === "tunai" || code === "cash" || code === "tunai") kind = "cash";
    const image = record.image?.trim();
    return [
      {
        code: record.payment_code,
        title: record.payment_method || record.payment_code,
        kind,
        paymentType: type,
        image:
          image && !/^[?#]/.test(image)
            ? paymentImageUrl(image, "transaksi")
            : undefined,
        fee:
          record.fee_active && record.fee != null
            ? { amount: record.fee, type: record.fee_type ?? "" }
            : undefined,
        feeBearer: record.fee_bearer,
      },
    ];
  });
  return { payments, ...(ppnRate !== undefined && { ppnRate }) };
}

export function usePaymentMethods(enabled = true, refetchOnMount?: "always", scope: PaymentMethodScope = "active") {
  const account = useAuthStore((state) => state.session?.account);
  const storeId = account?.store?.id || account?.event_id;
  return useQuery({
    queryKey: scope === "all" ? [...paymentMethodsKey(storeId), scope] : paymentMethodsKey(storeId),
    queryFn: ({ signal }) => fetchPaymentMethods(signal, scope),
    enabled: enabled && !!account,
    refetchOnMount,
    meta: { toast: false },
  });
}
