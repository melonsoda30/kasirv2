import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { isAxiosError } from "axios";
import { PageLayout } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { paymentMethodsKey } from "@/features/orders/payment-methods";
import { refreshCashSessionData } from "@/features/cash-session/cash-session-query";
import { settingsUrl, useStoreSettings, type StoreSettings } from "./store-settings-query";
import { request } from "@/lib/api";

type SettingsPatch = Partial<Pick<StoreSettings, "shift" | "ppn" | "cash_tolerance" | "fee" | "payment">>;
type SettingsUpdate = (current: StoreSettings) => SettingsPatch;
type QrisUpload = { file: File; paymentCode: string };
export type SaveStoreSettings = (change: SettingsUpdate, upload?: QrisUpload) => Promise<void>;
type SettingsResponse = { status: string; msg?: string; data?: Partial<StoreSettings> };

function settingsBody(patch: SettingsPatch, upload?: QrisUpload) {
  const body = upload ? new FormData() : new URLSearchParams();

  function append(name: string, value: unknown) {
    if (value === undefined) return;
    if (Array.isArray(value) && value.length === 0) {
      body.append(name, "[]");
      return;
    }
    if (value !== null && typeof value === "object") {
      for (const [key, entry] of Object.entries(value)) append(`${name}[${key}]`, entry);
      return;
    }
    body.append(name, typeof value === "boolean" ? String(Number(value)) : String(value ?? ""));
  }

  for (const [key, value] of Object.entries(patch)) append(key, value);
  if (body instanceof FormData && upload) {
    body.append("qris", upload.file);
    body.append("qris_payment_code", upload.paymentCode);
  }
  return body;
}

export function StoreSettingsPage({
  title,
  children,
}: {
  title: string;
  children: (
    data: StoreSettings,
    update: SaveStoreSettings,
  ) => ReactNode;
}) {
  const queryClient = useQueryClient();
  const { query: { data, isPending, error, refetch, isFetching }, queryKey } = useStoreSettings();
  const { mutateAsync: update } = useMutation({
    scope: { id: JSON.stringify(queryKey) },
    mutationFn: async ({ change, upload }: { change: SettingsUpdate; upload?: QrisUpload }) => {
      await queryClient.cancelQueries({ queryKey, exact: true });
      const current = queryClient.getQueryData<StoreSettings | null>(queryKey);
      if (!current) throw new Error("Pengaturan toko belum dimuat.");

      const patch = change(current);
      if (!upload && !Object.keys(patch).length) return;
      const response = await request<SettingsResponse | null>({
        url: settingsUrl,
        method: "POST",
        params: { action: "edit_setting" },
        data: settingsBody(patch, upload),
      }).catch((error: unknown) => {
        if (isAxiosError<SettingsResponse>(error) && error.response?.data?.msg) {
          throw new Error(error.response.data.msg);
        }
        throw error;
      });
      if (response?.status !== "success") {
        throw new Error(response?.msg || "Gagal menyimpan pengaturan.");
      }

      await queryClient.cancelQueries({ queryKey, exact: true });
      queryClient.setQueryData(queryKey, { ...current, ...patch, ...response.data });
      if (patch.shift || patch.cash_tolerance !== undefined) refreshCashSessionData(queryClient);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey, exact: true }),
        ...(patch.payment || patch.fee || upload
          ? [queryClient.invalidateQueries({ queryKey: paymentMethodsKey(current.store_id) })]
          : []),
      ]);
    },
    meta: { toast: false },
  });

  return (
    <PageLayout title={title} prevLink="/profil">
      {isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          Memuat pengaturan…
        </p>
      )}
      {error && (
        <div className="mb-4 space-y-2">
          <p role="alert" className="text-sm text-destructive">
            {error.message}
          </p>
          <Button
            variant="outline"
            size="sm"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            Coba lagi
          </Button>
        </div>
      )}
      {data === null && <p className="text-sm text-muted-foreground">Belum ada pengaturan untuk toko ini.</p>}
      {data && <>{children(data, (change, upload) => update({ change, upload }))}</>}
    </PageLayout>
  );
}
