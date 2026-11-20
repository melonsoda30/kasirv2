import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, Plus, Trash2 } from "lucide-react";
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
import { orderTotal, useOrderStore } from "./order-store";
import { OrderItemRow } from "./order-item-row";
import { useOrderProducts } from "./order-products";
import { PayOrderButton } from "./order-summary";

export function CartPage() {
  const account = useAuthStore((state) => state.session?.account);
  const accountId = account?.account_id;
  const isCashier = isCashierEventLevel(account?.event_level);
  const orderPath = isCashier ? "/" : "/order";
  const title = isCashier ? "Antrean" : "Cart";
  const { owner, orders, initialize, selectOrder, createOrder, removeOrder } =
    useOrderStore();
  const catalog = useOrderProducts();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [removeId, setRemoveId] = useState<string | null>(null);
  const navigate = useNavigate();
  useEffect(() => {
    if (accountId) initialize(accountId);
  }, [accountId, initialize]);
  const removedOrder = orders.find((order) => order.id === removeId);
  if (!accountId || owner !== accountId)
    return (
      <PageLayout title={title} prevLink={orderPath}>
        <p role="status">Memuat pesanan...</p>
      </PageLayout>
    );
  return (
    <PageLayout title={title} prevLink={orderPath}>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">
            Antrean pesanan ({orders.length})
          </h2>
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
        </div>
        {!orders.length && (
          <p className="py-5 text-center text-sm text-muted-foreground">
            Belum ada antrean pesanan.
          </p>
        )}
        {catalog.isError && !catalog.data && orders.some(({ items }) => items.length > 0) && (
          <div className="flex items-center justify-between gap-3 text-sm">
            <p role="alert" className="text-destructive">Gagal memuat stok produk.</p>
            <Button type="button" variant="outline" size="sm" loading={catalog.isFetching} onClick={() => void catalog.refetch()}>
              Coba lagi
            </Button>
          </div>
        )}
        <ul className="space-y-3">
          {orders.map((order) => {
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
                          className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
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
                            catalogProduct={catalog.data?.byKey.get(item.key)}
                          />
                        ))}
                      </ul>
                    ) : (
                      <p className="py-5 text-center text-sm text-muted-foreground">
                        Pesanan belum memiliki produk.
                      </p>
                    )}
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
      </div>
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
