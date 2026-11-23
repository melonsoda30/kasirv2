import { ImageOff } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "cn";
import { getCashierBranch, useAuthStore } from "@/features/auth/auth-store";
import { refreshCashSessionData } from "@/features/cash-session/cash-session-query";
import { editSalePayment, resolvePendingTransaction, type SalePaymentChanges } from "@/features/orders/payment-details";
import { fetchTransactionDetail } from "./sales-api";
import { SalePaymentEditor } from "./sale-payment-editor";
import { useProductStore } from "@/features/products/product-store";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { formatCurrency } from "@/lib/currency";
import type { Sale, SaleStatus } from "./sales-summary";

const statusClasses: Record<SaleStatus, string> = {
  complete: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  delete: "bg-destructive/10 text-destructive",
  unknown: "bg-muted text-muted-foreground",
};

const dateTime = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

function SaleInformation({ sale }: { sale: Sale }) {
  const date = new Date(sale.occurredAt);
  const details = [
    [
      "Tanggal & jam",
      Number.isNaN(date.getTime())
        ? "Tanggal tidak tersedia"
        : dateTime.format(date),
    ],
    ["Kasir", sale.cashier],
    ...(sale.salesperson ? [["Sales", sale.salesperson.name]] : []),
  ];
  return (
    <dl className="space-y-2 text-sm">
      {details.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4">
          <dt className="shrink-0 text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words text-right">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SaleCardContent({ sale }: { sale: Sale }) {
  const date = new Date(sale.occurredAt);
  const cash = ["tunai", "cash"].includes(
    sale.paymentMethod.trim().toLowerCase(),
  );
  return (
    <span className="flex flex-col gap-3">
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">
            {sale.store}
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {Number.isNaN(date.getTime())
              ? "Tanggal tidak tersedia"
              : dateTime.format(date)}
          </span>
        </span>
        <span
          className={cn(
            "shrink-0 rounded-md px-2 py-0.5 text-xs font-medium",
            statusClasses[sale.status],
          )}
        >
          {sale.status === "unknown" ? "Status belum tersedia" : sale.status}
        </span>
      </span>
      <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className="text-lg font-semibold tabular-nums"
          aria-label={`Total ${formatCurrency(sale.total)}`}
        >
          {formatCurrency(sale.total)}
        </span>
        <span className="text-xs text-muted-foreground">
          {sale.paymentMethod}
        </span>
      </span>
      {cash && sale.status !== "pending" && (
        <span className="flex items-center justify-between gap-3 rounded-md bg-muted/60 px-3 py-2 text-sm">
          <span className="text-foreground">Kembali</span>
          <span className="font-medium text-foreground tabular-nums">
            {formatCurrency(sale.change ?? Math.max(0, sale.paid - sale.total))}
          </span>
        </span>
      )}
      {sale.note && <span className="whitespace-pre-wrap break-words text-sm">{sale.note}</span>}
      <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t pt-2 text-xs text-muted-foreground">
        <span
          className="min-w-0 break-all font-mono"
          aria-label={`ID penjualan ${sale.id}`}
        >
          {sale.id}
        </span>
        <span aria-label={`Kasir ${sale.cashier}`}>{sale.cashier}</span>
      </span>
    </span>
  );
}

export function SalesTransactionList({ sales, queue = false, renderActions }: { sales: readonly Sale[]; queue?: boolean; renderActions?: (sale: Sale) => ReactNode }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"detail" | "edit" | "cancel">("detail");
  const queryClient = useQueryClient();
  const username = useAuthStore(
    (state) => state.session?.account.account_username,
  );
  const branchId = useAuthStore((state) => getCashierBranch(state.session)?.id);
  const detail = useQuery({
    queryKey: ["transactions", "detail", username, selectedId],
    queryFn: ({ signal }) => fetchTransactionDetail(selectedId!, signal),
    enabled: !!selectedId && !!username,
    staleTime: 0,
  });
  const edit = useMutation({
    mutationFn: ({ sale, changes }: { sale: Sale; changes: SalePaymentChanges }) => editSalePayment(sale, changes, branchId),
    onSuccess: async () => {
      refreshCashSessionData(queryClient);
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setView("detail");
      toast.success("Perubahan pembayaran tersimpan.");
    },
    meta: { toast: false },
  });
  const cancel = useMutation({
    mutationFn: (id: string) => resolvePendingTransaction(id, undefined, branchId),
    onSuccess: async () => {
      refreshCashSessionData(queryClient);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["products"] }),
      ]);
      setView("detail");
      toast.success("Transaksi dibatalkan.");
    },
    meta: { toast: false },
  });
  const busy = edit.isPending || cancel.isPending;
  const products = useProductStore((state) => state.products);
  const productImages = new Map(
    products.map((product) => [
      product.id,
      product.photo ||
        (product.image
          ? `https://images.unsplash.com/${product.image}?auto=format&fit=crop&w=120&q=80`
          : ""),
    ]),
  );
  if (!sales.length) return null;
  return (
    <section
      className={cn(!queue && "mt-6 space-y-3")}
      aria-label={queue ? "Antrean pesanan" : undefined}
      aria-labelledby={queue ? undefined : "sales-transactions-title"}
    >
      {!queue && <div className="flex items-center justify-between gap-3">
        <h2 id="sales-transactions-title" className="font-semibold">
          Daftar transaksi
        </h2>
        <span className="text-sm text-muted-foreground">
          {sales.length} transaksi
        </span>
      </div>}
      <ul className="grid min-w-0 grid-cols-1 gap-2">
        {sales.map((listedSale) => {
          const detailLoading = detail.isPending || selectedId !== listedSale.id;
          const sale =
            selectedId === listedSale.id && detail.data
              ? {
                  ...detail.data,
                  note: detail.data.note ?? listedSale.note,
                  salesperson:
                    detail.data.salesperson ?? listedSale.salesperson,
                }
              : listedSale;
          let subtotal = sale.subtotal;
          if (subtotal === undefined && sale.items.length > 0 &&
            sale.items.every(({ lineTotal, unitPrice }) => lineTotal !== undefined || unitPrice !== undefined)) {
            subtotal = sale.items.reduce((sum, { lineTotal, unitPrice, quantity }) =>
              sum + (lineTotal ?? (unitPrice ?? 0) * quantity), 0);
          }
          const additionalPrices = sale.additionalPrices?.filter(({ value }) => value !== 0) ?? [];
          const discounts = sale.discounts?.filter(({ value }) => value !== 0) ?? [];
          const selected = selectedId === sale.id;
          const showingEdit = selected && view === "edit";
          const showingCancel = selected && view === "cancel";
          const showingDetail = !showingEdit && !showingCancel;
          const actionReady = !queue && !detailLoading && !detail.isError && (!branchId || sale.branchId === branchId);
          const canEdit = actionReady && (sale.status === "complete" || sale.status === "pending");
          const canCancel = actionReady && sale.status === "pending";
          let drawerTitle = "Detail transaksi";
          if (showingEdit) drawerTitle = "Edit pembayaran";
          if (showingCancel) drawerTitle = "Batalkan transaksi?";
          return (
            <li key={sale.id} className="min-w-0">
              <Drawer dismissible={!busy} onOpenChange={(open) => {
                setView("detail");
                setSelectedId(open ? listedSale.id : null);
              }}>
                <DrawerTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Detail penjualan ${sale.id}, ${sale.store}`}
                    className="bento-surface w-full p-4 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <SaleCardContent sale={listedSale} />
                  </button>
                </DrawerTrigger>
                <DrawerContent className="product-drawer pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
                  <DrawerHeader className="shrink-0 border-b text-left">
                    <DrawerTitle>{drawerTitle}</DrawerTitle>
                    <DrawerDescription className="break-all font-mono text-xs">
                      {sale.id}
                    </DrawerDescription>
                  </DrawerHeader>
                  {showingEdit && <SalePaymentEditor sale={sale} busy={edit.isPending} error={edit.error?.message}
                    onBack={() => setView("detail")} onSave={(changes) => edit.mutate({ sale, changes })} />}
                  {showingCancel && <>
                    <div className="flow-panel min-h-0 space-y-2 overflow-y-auto p-4">
                      <p>Stok produk akan dikembalikan saat transaksi dibatalkan.</p>
                      {cancel.error && <p role="alert" className="text-destructive">{cancel.error.message}</p>}
                    </div>
                    <DrawerFooter className="shrink-0 border-t">
                      <div className="grid grid-cols-2 gap-2">
                        <Button type="button" variant="outline" disabled={cancel.isPending} onClick={() => setView("detail")}>Kembali</Button>
                        <Button type="button" variant="destructive" loading={cancel.isPending} disabled={cancel.isPending || !canCancel}
                          onClick={() => cancel.mutate(sale.id)}>Batalkan transaksi</Button>
                      </div>
                    </DrawerFooter>
                  </>}
                  {showingDetail && <div className="flow-panel min-h-0 space-y-3 overflow-y-auto p-4">
                    {detailLoading && (
                      <div
                        role="status"
                        aria-label="Memuat detail transaksi"
                        className="space-y-3"
                      >
                        <span className="sr-only">Memuat detail transaksi</span>
                        {[0, 1, 2].map((item) => (
                          <div
                            key={item}
                            aria-hidden="true"
                            className="h-16 rounded-md bg-muted motion-safe:animate-pulse"
                          />
                        ))}
                      </div>
                    )}
                    {!detailLoading && detail.isError && (
                      <div role="alert" className="space-y-3 py-6 text-center">
                        <p className="text-sm">
                          Gagal memuat detail transaksi.
                        </p>
                        <Button
                          type="button"
                          variant="outline"
                          loading={detail.isFetching}
                          onClick={() => void detail.refetch()}
                        >
                          Coba lagi
                        </Button>
                      </div>
                    )}
                    {!detailLoading && !detail.isError && (
                      <>
                        <div className="flex items-center justify-between gap-3">
                          <p className="min-w-0 break-words text-base font-semibold">
                            {sale.store}
                          </p>
                          <span
                            className={cn(
                              "shrink-0 rounded-md px-2 py-0.5 text-xs font-medium",
                              statusClasses[sale.status],
                            )}
                          >
                            {sale.status === "unknown"
                              ? "Status belum tersedia"
                              : sale.status}
                          </span>
                        </div>
                        <section aria-label="Produk terjual">
                          {sale.items.length > 0 && (
                            <ul className="divide-y">
                              {sale.items.map((item, index) => (
                                <li
                                  key={`${item.productId}-${index}`}
                                  className="flex items-center gap-3 py-2.5"
                                >
                                  <div className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                                    <ImageOff
                                      className="size-4 text-muted-foreground"
                                      aria-hidden="true"
                                    />
                                    {(item.image ||
                                      productImages.get(item.productId)) && (
                                      <img
                                        src={
                                          item.image ||
                                          productImages.get(item.productId)
                                        }
                                        alt=""
                                        loading="lazy"
                                        className="absolute inset-0 size-full object-cover"
                                        onError={(event) => {
                                          event.currentTarget.style.display =
                                            "none";
                                        }}
                                      />
                                    )}
                                  </div>
                                  <div className="min-w-0 flex-1">
                                    <p className="break-words font-medium">
                                      {item.title}
                                    </p>
                                    <p className="mt-1 text-sm text-muted-foreground">
                                      {item.quantity} ×{" "}
                                      {item.unitPrice == null
                                        ? "Harga belum tersedia"
                                        : formatCurrency(item.unitPrice)}
                                    </p>
                                  </div>
                                  {item.unitPrice != null && (
                                    <p className="shrink-0 text-sm font-medium tabular-nums">
                                      {formatCurrency(
                                        item.lineTotal ??
                                          item.quantity * item.unitPrice,
                                      )}
                                    </p>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                          {!sale.items.length && (
                            <p className="text-sm text-muted-foreground">
                              Rincian item belum tersedia.
                            </p>
                          )}
                        </section>
                        <section
                          aria-label="Ringkasan pembayaran"
                          className="space-y-2 border-t pt-3"
                        >
                          {subtotal !== undefined && (
                            <div className="flex justify-between gap-3 text-sm">
                              <span className="text-muted-foreground">Subtotal produk</span>
                              <span className="shrink-0 tabular-nums">{formatCurrency(subtotal)}</span>
                            </div>
                          )}
                          {additionalPrices.length > 0 && (
                            <div className="space-y-1 border-t pt-2 text-sm">
                              <h3 className="font-medium">Biaya tambahan</h3>
                              <dl className="space-y-1">
                                {additionalPrices.map(({ title, value }, index) => (
                                  <div key={`${title}-${index}`} className="flex justify-between gap-3">
                                    <dt className="min-w-0 break-words text-muted-foreground">{title}</dt>
                                    <dd className="shrink-0 tabular-nums">{formatCurrency(value)}</dd>
                                  </div>
                                ))}
                              </dl>
                            </div>
                          )}
                          {discounts.length > 0 && (
                            <div className="space-y-1 border-t pt-2 text-sm">
                              <h3 className="font-medium">Diskon</h3>
                              <dl className="space-y-1">
                                {discounts.map(({ title, type, value }, index) => (
                                  <div key={`${title}-${index}`} className="flex justify-between gap-3">
                                    <dt className="min-w-0 break-words text-muted-foreground">{title}</dt>
                                    <dd className="shrink-0 tabular-nums">
                                      −{type === "percent" ? `${value.toLocaleString("id-ID")}%` : formatCurrency(value)}
                                    </dd>
                                  </div>
                                ))}
                              </dl>
                            </div>
                          )}
                          <div className="flex items-baseline justify-between gap-3 border-t pt-2 font-semibold">
                            <span>Total pembayaran</span>
                            <span className="shrink-0 text-lg tabular-nums">{formatCurrency(sale.total)}</span>
                          </div>
                          <div className="flex justify-between gap-3 text-sm">
                            <h3 className="text-muted-foreground">Metode pembayaran</h3>
                            <p className="min-w-0 break-words text-right font-medium">{sale.paymentMethod}</p>
                          </div>
                          {sale.status !== "pending" && ["tunai", "cash"].includes(
                            sale.paymentMethod.trim().toLowerCase(),
                          ) && (
                            <div className="flex items-center justify-between gap-3 text-sm">
                              <span className="text-muted-foreground">
                                Kembali
                              </span>
                              <span className="font-medium tabular-nums">
                                {formatCurrency(
                                  sale.change ??
                                    Math.max(0, sale.paid - sale.total),
                                )}
                              </span>
                            </div>
                          )}
                        </section>
                        <section
                          aria-label="Informasi transaksi"
                          className="border-t pt-3"
                        >
                          <SaleInformation sale={sale} />
                        </section>
                        {sale.note && (
                          <section className="space-y-1 border-t pt-3">
                            <h3 className="font-medium">Catatan pesanan</h3>
                            <p className="whitespace-pre-wrap break-words">{sale.note}</p>
                          </section>
                        )}
                        {sale.paymentMethod.trim().toLowerCase() === "qris" && (
                          <section
                            aria-label="Bukti pembayaran"
                            className="space-y-2 border-t pt-3"
                          >
                            <h3 className="text-sm font-semibold">
                              Bukti pembayaran
                            </h3>
                            {sale.paymentProof ? (
                              <a
                                href={sale.paymentProof.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block space-y-2 rounded-lg border p-3 text-sm"
                              >
                                {sale.paymentProof.type === "image" && (
                                  <img
                                    src={sale.paymentProof.url}
                                    alt={`Bukti pembayaran ${sale.id}`}
                                    loading="lazy"
                                    className="max-h-96 w-full rounded-md object-contain"
                                    onError={(event) => {
                                      event.currentTarget.style.display =
                                        "none";
                                    }}
                                  />
                                )}
                                <span className="underline underline-offset-4">
                                  Buka bukti pembayaran
                                </span>
                              </a>
                            ) : (
                              <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
                                Bukti pembayaran belum tersedia.
                              </div>
                            )}
                          </section>
                        )}
                      </>
                    )}
                  </div>}
                  {showingDetail && (canEdit || canCancel) && <DrawerFooter className="shrink-0 border-t">
                    <div className={cn("grid gap-2", canCancel && "grid-cols-2")}>
                      {canEdit && <Button type="button" variant="outline" onClick={() => {
                        edit.reset();
                        setView("edit");
                      }}>
                        Edit
                      </Button>}
                      {canCancel && <Button type="button" variant="destructive" onClick={() => {
                        cancel.reset();
                        setView("cancel");
                      }}>
                        Batalkan
                      </Button>}
                    </div>
                  </DrawerFooter>}
                </DrawerContent>
              </Drawer>
              {renderActions?.(listedSale)}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
