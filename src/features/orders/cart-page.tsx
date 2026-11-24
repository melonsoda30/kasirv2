import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { PageLayout } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { SkeletonGroup, SkeletonRows } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  getCashierBranch,
  useAuthStore,
  usesCashierMode,
} from "@/features/auth/auth-store";
import { formatCurrency } from "@/lib/currency";
import {
  fetchTransactionDetail,
  fetchTransactions,
  transactionListParams,
} from "@/features/sales/sales-api";
import type { TransactionFilters } from "@/features/sales/sales-filters";
import { CashSessionControl } from "@/features/cash-session/cash-session-control";
import { fetchCashSessionReport } from "@/features/cash-session/cash-session-api";
import {
  cashSessionScope,
  useCashSession,
} from "@/features/cash-session/cash-session-query";
import { OrderItemRow } from "./order-item-row";
import { useOrderProducts } from "./order-products";
import { QuantityButtons } from "./order-quantity-buttons";
import { orderOwner, pendingOrderDraft, useOrderStore } from "./order-store";
import {
  changePendingQuantity,
  pendingQuantityLimit,
  usePendingOrderCancellation,
  usePendingOrderEdit,
} from "./pending-order-edit";

export function CartPage({ sessionId }: { sessionId?: string }) {
  const account = useAuthStore((state) => state.session?.account);
  const draftOwner = useAuthStore((state) => orderOwner(state.session));
  const cashierBranchId = useAuthStore(
    (state) => getCashierBranch(state.session)?.id,
  );
  const branchId = cashierBranchId ?? account?.store?.branch_id;
  const catalog = useOrderProducts();
  const [detailId, setDetailId] = useState<string | null>(null);
  const editPending = usePendingOrderEdit(draftOwner, !!detailId);
  const detail = useQuery({
    queryKey: ["transactions", "detail", account?.account_username, detailId],
    queryFn: ({ signal }) => fetchTransactionDetail(detailId!, signal),
    enabled: !!account && !!detailId,
    staleTime: 0,
    meta: { toast: false },
  });
  const cashSession = useCashSession(!!sessionId);
  const activeSession = cashSession.data?.session;
  const matchingSession =
    !!sessionId &&
    activeSession?.session_id === sessionId &&
    (!cashierBranchId || activeSession.branch_id === cashierBranchId);
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
    branchId: cashierBranchId,
    status: "pending",
  };
  const queue = useQuery({
    queryKey: [
      "transactions",
      account?.account_username,
      transactionListParams(queueFilters, ""),
      branchId,
    ],
    queryFn: async ({ signal }) => {
      const queue = await fetchTransactions(queueFilters, "", signal);
      const sales = await Promise.all(
        queue.sales.map((sale) => {
          const wrongBranch =
            branchId &&
            branchId !== "all" &&
            sale.branchId &&
            sale.branchId !== branchId;
          if (sale.status !== "pending" || wrongBranch) return sale;
          if (
            sale.items.length > 0 &&
            (sale.branchId || (!cashierBranchId && branchId !== "all"))
          )
            return sale;
          return fetchTransactionDetail(sale.id, signal);
        }),
      );
      return { ...queue, sales };
    },
    enabled: !!account && !!branchId,
  });
  const isCashier = useAuthStore((state) => usesCashierMode(state.session));
  const orderPath = isCashier ? "/" : "/order";
  const title = isCashier ? "Antrean" : "Cart";
  const headerAction = isCashier ? (
    <CashSessionControl presentation="popover" />
  ) : undefined;
  const hasActiveDraft = useOrderStore(
    (state) =>
      state.owner === draftOwner &&
      state.orders.some(
        ({ id, items, note }) =>
          id === state.activeId && (items.length > 0 || !!note?.trim()),
      ),
  );
  const [cancellation, setCancellation] = useState<{
    id: string;
    lastItem: boolean;
  } | null>(null);
  const cancelId = cancellation?.id;
  const cancelAfterDetail = useRef<string | null>(null);
  const cancelPending = usePendingOrderCancellation(
    draftOwner,
    cashierBranchId,
  );
  const pendingIds = new Set(
    sessionReport.data?.session.pending_ids ?? activeSession?.pending_ids ?? [],
  );
  for (const entry of sessionReport.data?.transactions ?? []) {
    if (entry.status === "pending") pendingIds.add(entry.id_trx);
  }
  const visibleQueue = (queue.data?.sales ?? []).filter(
    (sale) =>
      sale.status === "pending" &&
      (!branchId ||
        branchId === "all" ||
        sale.branchId === branchId ||
        (!cashierBranchId && !sale.branchId)) &&
      (!sessionId || pendingIds.has(sale.id)),
  );
  const queueLoading =
    queue.isPending ||
    (!!sessionId &&
      (cashSession.isPending || (matchingSession && sessionReport.isPending)));
  const queueReady = !!branchId && !queueLoading && !queue.isError;
  const sessionUnavailable =
    !!sessionId && (!matchingSession || sessionReport.isError);
  const showQueue = queueReady && !sessionUnavailable;

  function openCancel(id: string, lastItem = false) {
    cancelPending.reset();
    setCancellation({ id, lastItem });
  }

  return (
    <PageLayout title={title} headerAction={headerAction} wide>
      <div className="space-y-4">
        <div className="bento-surface flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
          <h2 className="text-sm font-semibold">
            Antrean pesanan
            {queue.data &&
              (!sessionId || sessionReport.isSuccess) &&
              ` (${visibleQueue.length})`}
          </h2>
          {!sessionId && (
            <Button asChild size="sm">
              <Link to={orderPath}>
                {!hasActiveDraft && <Plus aria-hidden="true" />}
                {hasActiveDraft ? "Lanjutkan pesanan" : "Pesanan baru"}
              </Link>
            </Button>
          )}
        </div>
        {sessionId && (
          <div className="bento-surface flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
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
          <SkeletonGroup label="Memuat antrean pesanan">
            <SkeletonRows className="gap-3" />
          </SkeletonGroup>
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
          <ul className="space-y-3">
            {visibleQueue.map((sale) => {
              const order = pendingOrderDraft(sale);
              const productBranch = sale.branchId ?? branchId;
              const modifying =
                editPending.isPending || cancelPending.isPending;
              const itemCount =
                sale.totalItems ??
                order.items.reduce((sum, item) => sum + item.quantity, 0);
              const total = formatCurrency(sale.total);
              const selected =
                detail.data?.id === sale.id ? detail.data : undefined;
              const editable =
                selected?.status === "pending" &&
                (!cashierBranchId || selected.branchId === cashierBranchId) &&
                !detail.isError;
              const drawerOrder = selected
                ? pendingOrderDraft(selected)
                : order;
              return (
                <li key={sale.id} className="bento-surface overflow-hidden">
                  <Drawer
                    open={detailId === sale.id}
                    dismissible={!modifying}
                    onOpenChange={(open) => setDetailId(open ? sale.id : null)}
                  >
                    <DrawerTrigger asChild>
                      <button
                        type="button"
                        aria-label={`Detail pesanan ${order.name}, ${itemCount} item, ${total}`}
                        className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold">
                            {order.name}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {itemCount} item
                          </span>
                        </span>
                        <span className="shrink-0 text-sm font-semibold tabular-nums">
                          {total}
                        </span>
                      </button>
                    </DrawerTrigger>
                    <DrawerContent
                      onCloseAutoFocus={(event) => {
                        if (cancelAfterDetail.current === sale.id) {
                          event.preventDefault();
                          cancelAfterDetail.current = null;
                          openCancel(sale.id, true);
                        }
                      }}
                    >
                      <DrawerHeader>
                        <DrawerTitle>Detail pesanan</DrawerTitle>
                        <DrawerDescription>{order.name}</DrawerDescription>
                      </DrawerHeader>
                      <DrawerBody>
                        {detail.isPending && (
                          <SkeletonGroup label="Memuat detail pesanan">
                            <SkeletonRows rows={2} media="thumbnail" />
                          </SkeletonGroup>
                        )}
                        {detail.isError && (
                          <div className="space-y-2 py-3">
                            <p role="alert">{detail.error.message}</p>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => void detail.refetch()}
                            >
                              Coba lagi
                            </Button>
                          </div>
                        )}
                        {selected && !editable && !detail.isError && (
                          <p
                            role="status"
                            className="py-3 text-muted-foreground"
                          >
                            Pesanan ini sudah tidak bisa diedit.
                          </p>
                        )}
                        <ul className="divide-y">
                          {drawerOrder.items.map((item) => {
                            const id = item.product.id;
                            const product = catalog.data?.products.find(
                              (entry) =>
                                entry.id === id &&
                                entry.branchId === productBranch,
                            );
                            return (
                              <OrderItemRow
                                key={item.key}
                                item={item}
                                quantityControl={
                                  <QuantityButtons
                                    title={item.product.title}
                                    quantity={item.quantity}
                                    canIncrease={
                                      item.quantity <
                                      pendingQuantityLimit(
                                        drawerOrder,
                                        id,
                                        product,
                                      )
                                    }
                                    disabled={modifying || !editable}
                                    onChange={(delta) => {
                                      if (!selected || !editable) return;
                                      const updated = changePendingQuantity(
                                        drawerOrder,
                                        drawerOrder,
                                        id,
                                        item.quantity + delta,
                                        product,
                                      );
                                      if (!updated.items.length) {
                                        cancelAfterDetail.current = sale.id;
                                        setDetailId(null);
                                        return;
                                      }
                                      if (updated !== drawerOrder)
                                        editPending.mutate(
                                          {
                                            order: updated,
                                            transaction: selected,
                                          },
                                          {
                                            onError: (error) =>
                                              toast.error(error.message),
                                          },
                                        );
                                    }}
                                  />
                                }
                              />
                            );
                          })}
                        </ul>
                      </DrawerBody>
                      <DrawerFooter>
                        <div className="grid grid-cols-2 gap-2">
                          <DrawerClose asChild>
                            <Button
                              type="button"
                              variant="outline"
                              disabled={modifying}
                            >
                              Tutup
                            </Button>
                          </DrawerClose>
                          {(modifying || !editable) && (
                            <Button type="button" disabled>
                              Tambah produk
                            </Button>
                          )}
                          {!modifying && editable && (
                            <Button asChild>
                              <Link
                                to={orderPath}
                                search={{ edit: sale.id, session: sessionId }}
                              >
                                <Plus aria-hidden="true" /> Tambah produk
                              </Link>
                            </Button>
                          )}
                        </div>
                      </DrawerFooter>
                    </DrawerContent>
                  </Drawer>
                  {order.note && (
                    <p className="px-4 pb-3 text-sm break-words whitespace-pre-wrap">
                      {order.note}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2 border-t p-3">
                    <Button
                      type="button"
                      variant="outline"
                      className="whitespace-normal"
                      disabled={modifying}
                      onClick={() => openCancel(sale.id)}
                    >
                      <Trash2 aria-hidden="true" /> Batalkan pesanan
                    </Button>
                    <Button asChild={!modifying} disabled={modifying}>
                      {modifying ? (
                        "Bayar"
                      ) : (
                        <Link
                          to="/payment/$orderId"
                          params={{ orderId: sale.id }}
                          search={{ pending: true, session: sessionId }}
                        >
                          Bayar
                        </Link>
                      )}
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {showQueue && visibleQueue.length === 0 && (
          <p className="py-5 text-center text-sm text-muted-foreground">
            Belum ada antrean pesanan.
          </p>
        )}
      </div>
      <Dialog
        open={!!cancelId}
        onOpenChange={(open) => {
          if (!open && !cancelPending.isPending) setCancellation(null);
        }}
      >
        <DialogContent showCloseButton={!cancellation?.lastItem}>
          <DialogHeader>
            <DialogTitle>
              {cancellation?.lastItem
                ? "Hapus produk terakhir?"
                : "Batalkan pesanan?"}
            </DialogTitle>
            <DialogDescription>
              {cancellation?.lastItem
                ? "Menghapus produk terakhir akan menghapus pesanan ini dari antrean."
                : `Pesanan ${cancelId} akan dibatalkan dan stok produknya dikembalikan.`}
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
              onClick={() => setCancellation(null)}
            >
              Kembali
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={cancelPending.isPending}
              disabled={cancelPending.isPending}
              onClick={() => {
                if (cancelId)
                  cancelPending.mutate(cancelId, {
                    onSuccess: () => setCancellation(null),
                  });
              }}
            >
              Batalkan pesanan
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
