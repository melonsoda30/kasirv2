import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { useAuthStore } from "@/features/auth/auth-store";
import { paymentImageUrl } from "@/features/settings/store-settings-query";
import { request } from "@/lib/api";
import type { PaymentReceipt } from "./payment-details";

const paymentRecord = z.object({
  payment_code: z.string().trim().min(1),
  payment_method: z.string(),
  payment_type: z.string(),
  fee_code: z.string().nullish(),
  fee: z.coerce.number().nonnegative().nullish(),
  fee_type: z.string().nullish(),
  image: z.string().nullish(),
  is_active: z.boolean(),
  fee_active: z.boolean(),
  fee_found: z.boolean(),
});
const paymentList = z.array(paymentRecord);

type PaymentMethod = PaymentReceipt["method"] & {
  image?: string;
  fee?: { amount: number; type: string };
  missingFee: boolean;
};

export const paymentMethodsKey = (storeId?: string) =>
  ["payment-methods", storeId] as const;

export async function fetchPaymentMethods(
  signal?: AbortSignal,
): Promise<PaymentMethod[]> {
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
  if (response?.status !== "success")
    throw new Error(response?.msg || "Gagal memuat metode pembayaran.");
  const parsed = paymentList.safeParse(response.data);
  if (!parsed.success)
    throw new Error("Format metode pembayaran dari server tidak valid.");

  return parsed.data.flatMap<PaymentMethod>((record) => {
    const hasFee = !!record.fee_code;
    if (!record.is_active || (hasFee && record.fee_found && !record.fee_active))
      return [];

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
        image:
          image && !/^[?#]/.test(image)
            ? paymentImageUrl(image, "transaksi")
            : undefined,
        fee:
          hasFee && record.fee_found && record.fee_active && record.fee
            ? { amount: record.fee, type: record.fee_type ?? "" }
            : undefined,
        missingFee: hasFee && !record.fee_found,
      },
    ];
  });
}

export function usePaymentMethods() {
  const account = useAuthStore((state) => state.session?.account);
  const storeId = account?.store?.id || account?.event_id;
  return useQuery({
    queryKey: paymentMethodsKey(storeId),
    queryFn: ({ signal }) => fetchPaymentMethods(signal),
    enabled: !!account,
    meta: { toast: false },
  });
}
