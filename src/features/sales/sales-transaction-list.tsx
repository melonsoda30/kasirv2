import { ImageOff } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "cn";
import { getCashierBranch, useAuthStore } from "@/features/auth/auth-store";
import { refreshCashSessionData } from "@/features/cash-session/cash-session-query";
import {
  editSalePayment,
  percentageOf,
  refundSale,
  resolvePendingTransaction,
  type SalePaymentChanges,
  type TransactionRefund,
} from "@/features/orders/payment-details";
import { fetchTransactionDetail } from "./sales-api";
import { SalePaymentEditor } from "./sale-payment-editor";
import { SaleRefundForm } from "./sale-refund-form";
import { useProductStore } from "@/features/products/product-store";
import type { Product } from "@/features/products/sample-products";
import { Button } from "@/components/ui/button";
import { SkeletonGroup, SkeletonRows } from "@/components/ui/skeleton";
import { SkeletonImage } from "@/components/ui/skeleton-image";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerTrigger,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { formatCurrency, formatNominal } from "@/lib/currency";
import type { Sale, SaleStatus } from "./sales-summary";

const saleStatuses: Record<SaleStatus, { tone: StatusTone; label: string }> = {
  complete: { tone: "success", label: "Lunas" },
  pending: { tone: "warning", label: "Menunggu pembayaran" },
  delete: { tone: "danger", label: "Dibatalkan" },
  refund_partial: { tone: "warning", label: "Refund parsial" },
  refund_full: { tone: "danger", label: "Refund penuh" },
  unknown: { tone: "neutral", label: "Status belum tersedia" },
};

function SaleStatusBadge({ status }: { status: SaleStatus }) {
  const { tone, label } = saleStatuses[status];
  return (
    <StatusBadge tone={tone} className="shrink-0">
      {label}
    </StatusBadge>
  );
}

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

function SaleRefundInformation({ sale }: { sale: Sale }) {
  const { refund, netRevenue } = sale;
  if (!refund && netRevenue === undefined) return null;
  const details = [
    ...(refund?.amount !== undefined
      ? [["Nominal refund", formatCurrency(refund.amount, 2)]]
      : []),
    ...(refund?.method
      ? [["Metode refund", refund.method === "cash" ? "Tunai" : refund.method]]
      : []),
    ...(netRevenue !== undefined
      ? [["Omzet bersih", formatCurrency(netRevenue, 2)]]
      : []),
    ...(refund?.restored !== undefined
      ? [["Stok dikembalikan", `${formatNominal(refund.restored)} unit`]]
      : []),
    ...(refund?.reason ? [["Alasan refund", refund.reason]] : []),
  ];
  return (
    <section aria-label="Rincian refund" className="space-y-2 border-t pt-3">
      <h3 className="text-sm font-semibold">Rincian refund</h3>
      <dl className="space-y-2 text-sm">
        {details.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4">
            <dt className="shrink-0 text-muted-foreground">{label}</dt>
            <dd className="min-w-0 whitespace-pre-wrap wrap-anywhere text-right">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SaleCardAmount({ label, value }: { label: string; value: string }) {
  return (
    <span className="flex items-center justify-between gap-3 rounded-md bg-muted/60 px-3 py-2 text-sm">
      <span className="text-foreground">{label}</span>
      <span className="font-medium text-foreground tabular-nums">{value}</span>
    </span>
  );
}

function SaleCardContent({ sale }: { sale: Sale }) {
  const date = new Date(sale.occurredAt);
  const cash = ["tunai", "cash"].includes(
    sale.paymentMethod.trim().toLowerCase(),
  );
  const refunded = sale.status === "refund_partial" || sale.status === "refund_full";
  const refundAmount = sale.refund?.amount;
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
        <SaleStatusBadge status={sale.status} />
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
        <SaleCardAmount
          label="Kembali"
          value={formatCurrency(sale.change ?? Math.max(0, sale.paid - sale.total))}
        />
      )}
      {refunded && refundAmount !== undefined && (
        <SaleCardAmount label="Refund" value={formatCurrency(refundAmount, 2)} />
      )}
      {sale.note && (
        <span className="whitespace-pre-wrap break-words text-sm">
          {sale.note}
        </span>
      )}
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

type RefundConfirmation = { sale: Sale; option: TransactionRefund };

export function SalesTransactionList({
  sales,
  queue = false,
  headerAction,
  renderActions,
  catalogProducts,
}: {
  sales: readonly Sale[];
  queue?: boolean;
  headerAction?: ReactNode;
  renderActions?: (sale: Sale) => ReactNode;
  catalogProducts?: readonly Product[];
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<"detail" | "edit" | "cancel" | "refund">(
    "detail",
  );
  const [refundConfirmation, setRefundConfirmation] =
    useState<RefundConfirmation | null>(null);
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
    mutationFn: ({
      sale,
      changes,
    }: {
      sale: Sale;
      changes: SalePaymentChanges;
    }) => editSalePayment(sale, changes, branchId),
    onSuccess: async () => {
      refreshCashSessionData(queryClient);
      await queryClient.invalidateQueries({ queryKey: ["transactions"] });
      setView("detail");
      toast.success("Perubahan pembayaran tersimpan.");
    },
    meta: { toast: false },
  });
  const cancel = useMutation({
    mutationFn: (id: string) =>
      resolvePendingTransaction(id, undefined, branchId),
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
  const refund = useMutation({
    mutationFn: ({ sale, option }: RefundConfirmation) =>
      refundSale(sale, option, branchId),
    onSuccess: (result) => {
      setRefundConfirmation(null);
      setView("detail");
      toast.success("Refund berhasil diproses.", {
        description: `Tunai ${formatCurrency(result.refund.amount, 2)} · Omzet bersih ${formatCurrency(result.netRevenue, 2)}`,
      });
    },
    onSettled: async (_result, _error, { option }) => {
      refreshCashSessionData(queryClient);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["transactions"] }),
        ...(!option.isPartial
          ? [queryClient.invalidateQueries({ queryKey: ["products"] })]
          : []),
      ]);
    },
    retry: false,
    meta: { toast: false },
  });
  const busy = edit.isPending || cancel.isPending || refund.isPending;
  const currentSale = detail.data;
  const refundDetailChanged =
    !!refundConfirmation &&
    (currentSale?.id !== refundConfirmation.sale.id ||
      currentSale.status !== "complete" ||
      currentSale.total !== refundConfirmation.sale.total ||
      (!!branchId && currentSale.branchId !== branchId));
  const products = useProductStore((state) => state.products);
  const productImages = new Map(
    (catalogProducts ?? products).map((product) => [
      product.id,
      product.photo ||
        (product.image
          ? `https://images.unsplash.com/${product.image}?auto=format&fit=crop&w=120&q=80`
          : ""),
    ]),
  );
  if (!sales.length && !headerAction) return null;
  return (
    <section
      className={cn(!queue && "mt-6 space-y-3")}
      aria-label={queue ? "Antrean pesanan" : undefined}
      aria-labelledby={queue ? undefined : "sales-transactions-title"}
    >
      {!queue && (
        <div className="flex items-center justify-between gap-3">
          <h2 id="sales-transactions-title" className="font-semibold">
            Daftar transaksi
          </h2>
          {headerAction ?? (
            <span className="text-sm text-muted-foreground">{sales.length} transaksi</span>
          )}
        </div>
      )}
      {sales.length > 0 && <ul className="grid min-w-0 grid-cols-1 gap-2">
        {sales.map((listedSale) => {
          const detailLoading =
            detail.isPending || selectedId !== listedSale.id;
          const transaction =
            selectedId === listedSale.id && detail.data
              ? {
                  ...detail.data,
                  note: detail.data.note ?? listedSale.note,
                  salesperson:
                    detail.data.salesperson ?? listedSale.salesperson,
                  refund: detail.data.refund ?? listedSale.refund,
                  netRevenue: detail.data.netRevenue ?? listedSale.netRevenue,
                }
              : listedSale;
          const completedRefund = refund.data?.id === listedSale.id ? refund.data : undefined;
          const sale = completedRefund ? { ...transaction, ...completedRefund } : transaction;
          let subtotal = sale.subtotal;
          if (
            subtotal === undefined &&
            sale.items.length > 0 &&
            sale.items.every(
              ({ lineTotal, unitPrice }) =>
                lineTotal !== undefined || unitPrice !== undefined,
            )
          ) {
            subtotal = sale.items.reduce(
              (sum, { lineTotal, unitPrice, quantity }) =>
                sum + (lineTotal ?? (unitPrice ?? 0) * quantity),
              0,
            );
          }
          const additionalPrices =
            sale.additionalPrices?.filter(({ value }) => value !== 0) ?? [];
          const paymentFeeRate = sale.paymentFee ?? 0;
          const paymentFeeAmount = subtotal === undefined ? undefined : percentageOf(subtotal, paymentFeeRate);
          const discounts =
            sale.discounts?.filter(({ value }) => value !== 0) ?? [];
          const selected = selectedId === sale.id;
          const showingEdit = selected && view === "edit";
          const showingCancel = selected && view === "cancel";
          const showingRefund = selected && view === "refund";
          const showingDetail =
            !showingEdit && !showingCancel && !showingRefund;
          const actionReady =
            !queue &&
            !detailLoading &&
            !detail.isError &&
            (!branchId || sale.branchId === branchId);
          const canEdit =
            actionReady &&
            (sale.status === "complete" || sale.status === "pending");
          const canCancel = actionReady && sale.status === "pending";
          const canRefund =
            actionReady &&
            !detail.isFetching &&
            sale.status === "complete" &&
            sale.total > 0;
          let drawerTitle = "Detail transaksi";
          if (showingEdit) drawerTitle = "Edit pembayaran";
          if (showingCancel) drawerTitle = "Batalkan transaksi?";
          if (showingRefund) drawerTitle = "Refund transaksi";
          return (
            <li key={sale.id} className="min-w-0">
              <Drawer
                dismissible={!busy && !refundConfirmation}
                onOpenChange={(open) => {
                  setRefundConfirmation(null);
                  setView("detail");
                  setSelectedId(open ? listedSale.id : null);
                }}
              >
                <DrawerTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Detail penjualan ${sale.id}, ${sale.store}`}
                    className="bento-surface w-full p-4 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <SaleCardContent sale={completedRefund ? { ...listedSale, ...completedRefund } : listedSale} />
                  </button>
                </DrawerTrigger>
                <DrawerContent>
                  <DrawerHeader>
                    <DrawerTitle>{drawerTitle}</DrawerTitle>
                    <DrawerDescription className="break-all font-mono text-xs">
                      {sale.id}
                    </DrawerDescription>
                  </DrawerHeader>
                  {showingEdit && (
                    <SalePaymentEditor
                      sale={sale}
                      busy={edit.isPending}
                      error={edit.error?.message}
                      onBack={() => setView("detail")}
                      onSave={(changes) => edit.mutate({ sale, changes })}
                    />
                  )}
                  {showingRefund && (
                    <SaleRefundForm
                      total={sale.total}
                      available={canRefund}
                      busy={refund.isPending}
                      onBack={() => setView("detail")}
                      onContinue={(option) => {
                        refund.reset();
                        setRefundConfirmation({ sale, option });
                      }}
                    />
                  )}
                  {showingCancel && (
                    <>
                      <DrawerBody className="flow-panel space-y-2">
                        <p>
                          Stok produk akan dikembalikan saat transaksi
                          dibatalkan.
                        </p>
                        {cancel.error && (
                          <p role="alert" className="text-destructive">
                            {cancel.error.message}
                          </p>
                        )}
                      </DrawerBody>
                      <DrawerFooter>
                        <div className="modal-actions">
                          <Button
                            type="button"
                            variant="outline"
                            disabled={cancel.isPending}
                            onClick={() => setView("detail")}
                          >
                            Kembali
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            loading={cancel.isPending}
                            disabled={cancel.isPending || !canCancel}
                            onClick={() => cancel.mutate(sale.id)}
                          >
                            Batalkan transaksi
                          </Button>
                        </div>
                      </DrawerFooter>
                    </>
                  )}
                  {showingDetail && (
                    <DrawerBody className="flow-panel space-y-3">
                      {detailLoading && (
                        <SkeletonGroup label="Memuat detail transaksi">
                          <SkeletonRows media="thumbnail" />
                        </SkeletonGroup>
                      )}
                      {!detailLoading && detail.isError && (
                        <div
                          role="alert"
                          className="space-y-3 py-6 text-center"
                        >
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
                            <SaleStatusBadge status={sale.status} />
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
                                      <SkeletonImage
                                        src={
                                          item.image ||
                                          productImages.get(item.productId)
                                        }
                                        alt=""
                                        loading="lazy"
                                        className="absolute inset-0 size-full"
                                      />
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
                                <span className="text-muted-foreground">
                                  Subtotal produk
                                </span>
                                <span className="shrink-0 tabular-nums">
                                  {formatCurrency(subtotal)}
                                </span>
                              </div>
                            )}
                            {additionalPrices.length > 0 && (
                              <div className="space-y-1 border-t pt-2 text-sm">
                                <h3 className="font-medium">Biaya tambahan</h3>
                                <dl className="space-y-1">
                                  {additionalPrices.map(
                                    ({ title, value }, index) => (
                                      <div
                                        key={`${title}-${index}`}
                                        className="flex justify-between gap-3"
                                      >
                                        <dt className="min-w-0 break-words text-muted-foreground">
                                          {title}
                                        </dt>
                                        <dd className="shrink-0 tabular-nums">
                                          {formatCurrency(value)}
                                        </dd>
                                      </div>
                                    ),
                                  )}
                                </dl>
                              </div>
                            )}
                            {paymentFeeRate > 0 && paymentFeeAmount !== 0 && (
                              <div className="flex justify-between gap-3 text-sm">
                                <span className="text-muted-foreground">
                                  Fee pembayaran{paymentFeeAmount !== undefined && ` (${paymentFeeRate.toLocaleString("id-ID")}%)`}
                                </span>
                                <span className="shrink-0 tabular-nums">
                                  {paymentFeeAmount === undefined
                                    ? `${paymentFeeRate.toLocaleString("id-ID")}%`
                                    : formatCurrency(paymentFeeAmount)}
                                </span>
                              </div>
                            )}
                            {discounts.length > 0 && (
                              <div className="space-y-1 border-t pt-2 text-sm">
                                <h3 className="font-medium">Diskon</h3>
                                <dl className="space-y-1">
                                  {discounts.map(
                                    ({ title, type, value }, index) => (
                                      <div
                                        key={`${title}-${index}`}
                                        className="flex justify-between gap-3"
                                      >
                                        <dt className="min-w-0 break-words text-muted-foreground">
                                          {title}
                                        </dt>
                                        <dd className="shrink-0 tabular-nums">
                                          −
                                          {type === "percent"
                                            ? `${value.toLocaleString("id-ID")}%`
                                            : formatCurrency(value)}
                                        </dd>
                                      </div>
                                    ),
                                  )}
                                </dl>
                              </div>
                            )}
                            <div className="flex items-baseline justify-between gap-3 border-t pt-2 font-semibold">
                              <span>Total pembayaran</span>
                              <span className="shrink-0 text-lg tabular-nums">
                                {formatCurrency(sale.total)}
                              </span>
                            </div>
                            <div className="flex justify-between gap-3 text-sm">
                              <h3 className="text-muted-foreground">
                                Metode pembayaran
                              </h3>
                              <p className="min-w-0 break-words text-right font-medium">
                                {sale.paymentMethod}
                              </p>
                            </div>
                            {sale.status !== "pending" &&
                              ["tunai", "cash"].includes(
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
                          <SaleRefundInformation sale={sale} />
                          <section
                            aria-label="Informasi transaksi"
                            className="border-t pt-3"
                          >
                            <SaleInformation sale={sale} />
                          </section>
                          {sale.note && (
                            <section className="space-y-1 border-t pt-3">
                              <h3 className="font-medium">Catatan pesanan</h3>
                              <p className="whitespace-pre-wrap break-words">
                                {sale.note}
                              </p>
                            </section>
                          )}
                          {sale.paymentMethod.trim().toLowerCase() ===
                            "qris" && (
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
                                    <SkeletonImage
                                      src={sale.paymentProof.url}
                                      alt={`Bukti pembayaran ${sale.id}`}
                                      loading="lazy"
                                      className="rounded-md"
                                      imageClassName="h-auto max-h-96 w-full object-contain"
                                      pendingClassName="h-48"
                                    />
                                  )}
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
                    </DrawerBody>
                  )}
                  {showingDetail && (canEdit || canCancel || canRefund) && (
                    <DrawerFooter>
                      <div className="modal-actions">
                        {canEdit && (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              edit.reset();
                              setView("edit");
                            }}
                          >
                            Edit
                          </Button>
                        )}
                        {canCancel && (
                          <Button
                            type="button"
                            variant="destructive"
                            disabled={busy}
                            onClick={() => {
                              cancel.reset();
                              setView("cancel");
                            }}
                          >
                            Batalkan
                          </Button>
                        )}
                        {canRefund && (
                          <Button
                            type="button"
                            variant="destructive"
                            disabled={busy}
                            onClick={() => setView("refund")}
                          >
                            Refund
                          </Button>
                        )}
                      </div>
                    </DrawerFooter>
                  )}
                  {showingDetail && !canEdit && !canCancel && !canRefund && (
                    <DrawerFooter>
                      <DrawerClose asChild>
                        <Button type="button" variant="outline">
                          Tutup
                        </Button>
                      </DrawerClose>
                    </DrawerFooter>
                  )}
                </DrawerContent>
              </Drawer>
              {renderActions?.(listedSale)}
            </li>
          );
        })}
      </ul>}
      {refundConfirmation && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open && !refund.isPending) setRefundConfirmation(null);
          }}
        >
          <DialogContent
            role="alertdialog"
            closeDisabled={refund.isPending}
            onPointerDownOutside={(event) => event.preventDefault()}
            onEscapeKeyDown={(event) => {
              if (refund.isPending) event.preventDefault();
            }}
          >
            <DialogHeader>
              <DialogTitle>
                {refundConfirmation.option.isPartial
                  ? "Konfirmasi refund parsial?"
                  : "Konfirmasi refund penuh?"}
              </DialogTitle>
              <DialogDescription>
                Refund sebesar{" "}
                {formatCurrency(
                  refundConfirmation.option.isPartial
                    ? refundConfirmation.option.nominal
                    : refundConfirmation.sale.total,
                  2,
                )}{" "}
                untuk transaksi {refundConfirmation.sale.id} akan dikembalikan
                secara tunai. {refundConfirmation.option.isPartial
                  ? "Barang tetap tercatat terjual."
                  : "Stok barang akan dikembalikan."}
              </DialogDescription>
            </DialogHeader>
            <DialogBody className="space-y-3">
              <div className="bento-surface space-y-1 p-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Alasan refund
                </p>
                <p className="whitespace-pre-wrap wrap-anywhere">
                  {refundConfirmation.option.reason}
                </p>
              </div>
              {refund.isError && (
                <p role="alert" className="text-destructive">
                  {refund.error.message}
                </p>
              )}
              {refundDetailChanged && !refund.isError && (
                <p role="alert" className="text-destructive">
                  Detail transaksi berubah. Periksa kembali sebelum
                  melanjutkan.
                </p>
              )}
            </DialogBody>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                disabled={refund.isPending}
                onClick={() => setRefundConfirmation(null)}
              >
                Kembali
              </Button>
              <Button
                type="button"
                variant="destructive"
                loading={refund.isPending}
                disabled={
                  refundDetailChanged ||
                  detail.isFetching ||
                  detail.isError ||
                  refund.isError
                }
                onClick={() => refund.mutate(refundConfirmation)}
              >
                Refund
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
