import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
import { cn } from "cn";
import { PageLayout } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { isCashierEventLevel, useAuthStore } from "@/features/auth/auth-store";
import { formatCurrency } from "@/lib/currency";
import {
  fetchTransactions,
  transactionListParams,
} from "@/features/sales/sales-api";
import {
  defaultSalesFilters,
  type TransactionFilters,
} from "@/features/sales/sales-filters";
import { SalesTransactionList } from "@/features/sales/sales-transaction-list";
import { CashSessionControl } from "@/features/cash-session/cash-session-control";
import { fetchCashSessionReport } from "@/features/cash-session/cash-session-api";
import {
  cashSessionScope,
  refreshCashSessionData,
  useCashSession,
} from "@/features/cash-session/cash-session-query";
import { orderTotal, useOrderStore } from "./order-store";
import { OrderItemRow } from "./order-item-row";
import { OrderNoteField } from "./order-note-field";
import { useOrderProducts } from "./order-products";
import { PayOrderButton } from "./order-summary";
import { resolvePendingTransaction } from "./payment-details";

export function CartPage({ sessionId }: { sessionId?: string }) {
  const account = useAuthStore((state) => state.session?.account);
  const accountId = account?.account_id;
  const branchId = account?.store?.branch_id;
  const queryClient = useQueryClient();
  const cashSession = useCashSession(!!sessionId);
  const activeSession = cashSession.data?.session;
  const matchingSession =
    !!sessionId && activeSession?.session_id === sessionId;
  const sessionReport = useQuery({
    queryKey: [
      "cash-session",
      "report",
      ...cashSessionScope(account),
      sessionId,
    ],
    queryFn: ({ signal }) => fetchCashSessionReport(sessionId!, signal),
    enabled: matchingSession,
    meta: { toast: false },
  });
  const queueFilters: TransactionFilters = {
    ...defaultSalesFilters,
    store: branchId ?? "",
    status: "pending",
  };
  const queue = useQuery({
    queryKey: [
      "transactions",
      account?.account_username,
      transactionListParams(queueFilters, ""),
    ],
    queryFn: ({ signal }) => fetchTransactions(queueFilters, "", signal),
    enabled: !!account && !!branchId,
  });
  const isCashier = isCashierEventLevel(account?.event_level);
  const orderPath = isCashier ? "/" : "/order";
  const title = isCashier ? "Antrean" : "Cart";
  const headerAction = isCashier ? (
    <CashSessionControl presentation="popover" />
  ) : undefined;
  const { owner, orders, initialize, selectOrder, createOrder, removeOrder } =
    useOrderStore();
  const catalog = useOrderProducts();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [removeId, setRemoveId] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const cancelPending = useMutation({
    mutationFn: (id: string) => resolvePendingTransaction(id),
    onSuccess: () => {
      setCancelId(null);
      toast.success("Pesanan dibatalkan.");
    },
    onSettled: () => {
      refreshCashSessionData(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    meta: { toast: false },
  });
  const navigate = useNavigate();
  useEffect(() => {
    if (accountId) initialize(accountId);
  }, [accountId, initialize]);
  const removedOrder = orders.find((order) => order.id === removeId);
  const pendingIds = new Set(
    sessionReport.data?.session.pending_ids ?? activeSession?.pending_ids ?? [],
  );
  for (const entry of sessionReport.data?.transactions ?? []) {
    if (entry.status === "pending") pendingIds.add(entry.id_trx);
  }
  const visibleQueue = (queue.data?.sales ?? []).filter(
    (sale) =>
      sale.status === "pending" && (!sessionId || pendingIds.has(sale.id)),
  );
  const queueLoading =
    queue.isPending ||
    (!!sessionId &&
      (cashSession.isPending || (matchingSession && sessionReport.isPending)));
  const queueReady = !!branchId && !queueLoading && !queue.isError;
  const sessionUnavailable =
    !!sessionId && (!matchingSession || sessionReport.isError);
  const showQueue = queueReady && !sessionUnavailable;
  if (!accountId || owner !== accountId)
    return (
      <PageLayout title={title} headerAction={headerAction}>
        <p role="status">Memuat pesanan...</p>
      </PageLayout>
    );
  return (
    <PageLayout title={title} headerAction={headerAction}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">
            Antrean pesanan
            {queue.data &&
              (!sessionId || sessionReport.isSuccess) &&
              ` (${visibleQueue.length})`}
          </h2>
          {!sessionId && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                createOrder();
                void navigate({ to: orderPath });
              }}
            >
              <Plus aria-hidden="true" />
              Pesanan baru
            </Button>
          )}
        </div>
        {sessionId && (
          <div className="space-y-2 rounded-lg border p-3 text-sm">
            <p>Pesanan yang belum dibayar untuk tutup buku.</p>
            <Button asChild variant="outline">
              <Link to="/sesi-kas" search={{ close: true, session: sessionId }}>
                Kembali ke tutup buku
              </Link>
            </Button>
          </div>
        )}
        {!branchId && (
          <p role="status" className="text-sm text-muted-foreground">
            Cabang akun belum tersedia.
          </p>
        )}
        {branchId && queueLoading && (
          <p role="status" className="text-sm text-muted-foreground">
            Memuat antrean pesanan...
          </p>
        )}
        {branchId && !queueLoading && queue.isError && (
          <div className="flex items-center justify-between gap-3 text-sm">
            <p role="alert">Gagal memuat antrean pesanan.</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              loading={queue.isFetching}
              onClick={() => void queue.refetch()}
            >
              Coba lagi
            </Button>
          </div>
        )}
        {queueReady && sessionUnavailable && (
          <div className="space-y-2 text-sm">
            <p role="alert">
              {sessionReport.isError
                ? "Pesanan untuk shift ini belum bisa diperiksa."
                : "Shift ini sudah tidak aktif."}
            </p>
            {sessionReport.isError && (
              <Button
                type="button"
                variant="outline"
                onClick={() => void sessionReport.refetch()}
              >
                Coba lagi
              </Button>
            )}
          </div>
        )}
        {showQueue && visibleQueue.length > 0 && (
          <SalesTransactionList
            sales={visibleQueue}
            queue
            renderActions={(sale) => (
              <div className="mt-2 mb-3 grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-9 whitespace-normal py-2"
                  onClick={() => {
                    cancelPending.reset();
                    setCancelId(sale.id);
                  }}
                >
                  Batalkan pesanan
                </Button>
                <Button asChild>
                  <Link
                    to="/payment/$orderId"
                    params={{ orderId: sale.id }}
                    search={{ pending: true, session: sessionId }}
                  >
                    Bayar
                  </Link>
                </Button>
              </div>
            )}
          />
        )}
        {showQueue && visibleQueue.length === 0 && (
          <p className="py-5 text-center text-sm text-muted-foreground">
            Belum ada antrean pesanan.
          </p>
        )}
        {!sessionId &&
          orders.some(
            ({ items, note }) => items.length > 0 || note?.trim(),
          ) && <h2 className="text-sm font-semibold">Draft pesanan</h2>}
        {!sessionId &&
          catalog.isError &&
          !catalog.data &&
          orders.some(({ items }) => items.length > 0) && (
            <div className="flex items-center justify-between gap-3 text-sm">
              <p role="alert" className="text-destructive">
                Gagal memuat stok produk.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={catalog.isFetching}
                onClick={() => void catalog.refetch()}
              >
                Coba lagi
              </Button>
            </div>
          )}
        {!sessionId && (
          <ul className="space-y-3">
            {orders
              .filter(({ items, note }) => items.length > 0 || note?.trim())
              .map((order) => {
                const open = expanded[order.id] ?? true;
                const count = order.items.reduce(
                  (sum, item) => sum + item.quantity,
                  0,
                );
                return (
                  <li key={order.id}>
                    <section
                      className="overflow-hidden rounded-xl border bg-background"
                      aria-label={order.name.trim() || "Pesanan"}
                    >
                      <div className="flex items-center pr-2">
                        <h3 className="min-w-0 flex-1">
                          <button
                            type="button"
                            aria-expanded={open}
                            aria-controls={`order-${order.id}`}
                            className="flex w-full items-center justify-between gap-3 p-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                            onClick={() =>
                              setExpanded((state) => ({
                                ...state,
                                [order.id]: !open,
                              }))
                            }
                          >
                            <ChevronDown
                              className={cn(
                                "size-4 shrink-0 text-muted-foreground transition-transform",
                                open ? "rotate-180" : "",
                              )}
                              aria-hidden="true"
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold">
                                {order.name.trim() || "Pesanan"}
                              </span>
                              <span className="mt-1 block text-xs text-muted-foreground">
                                {count} item
                              </span>
                            </span>
                            <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums">
                              {formatCurrency(orderTotal(order))}
                            </span>
                          </button>
                        </h3>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="shrink-0 text-destructive"
                          aria-label={`Hapus ${order.name}`}
                          title="Hapus antrean"
                          onClick={() => setRemoveId(order.id)}
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </div>
                      <div
                        id={`order-${order.id}`}
                        hidden={!open}
                        className="space-y-3 border-t px-4 py-3"
                      >
                        {order.items.length ? (
                          <ul className="divide-y">
                            {order.items.map((item) => (
                              <OrderItemRow
                                key={item.key}
                                orderId={order.id}
                                item={item}
                                catalogProduct={catalog.data?.byKey.get(
                                  item.key,
                                )}
                              />
                            ))}
                          </ul>
                        ) : (
                          <p className="py-5 text-center text-sm text-muted-foreground">
                            Pesanan belum memiliki produk.
                          </p>
                        )}
                      </div>
                      <div className="border-t px-4 py-3">
                        <OrderNoteField order={order} />
                      </div>
                      <div className="grid grid-cols-2 gap-2 border-t p-3">
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => {
                            selectOrder(order.id);
                            void navigate({ to: orderPath });
                          }}
                        >
                          Tambah
                        </Button>
                        <PayOrderButton order={order} label="proses" />
                      </div>
                    </section>
                  </li>
                );
              })}
          </ul>
        )}
      </div>
      <Dialog
        open={!!cancelId}
        onOpenChange={(open) => {
          if (!open && !cancelPending.isPending) setCancelId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Batalkan pesanan?</DialogTitle>
            <DialogDescription>
              Pesanan {cancelId} akan dibatalkan dan stok produknya
              dikembalikan.
            </DialogDescription>
          </DialogHeader>
          {cancelPending.isError && (
            <p role="alert" className="text-sm text-destructive">
              {cancelPending.error.message}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={cancelPending.isPending}
              onClick={() => setCancelId(null)}
            >
              Kembali
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={cancelPending.isPending}
              disabled={cancelPending.isPending}
              onClick={() => {
                if (cancelId) cancelPending.mutate(cancelId);
              }}
            >
              Batalkan pesanan
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!removedOrder}
        onOpenChange={(open) => {
          if (!open) setRemoveId(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus pesanan?</DialogTitle>
            <DialogDescription>
              {removedOrder?.name} beserta isinya akan dihapus dari antrean.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setRemoveId(null)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => {
                if (removeId) removeOrder(removeId);
                setRemoveId(null);
              }}
            >
              Hapus pesanan
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
