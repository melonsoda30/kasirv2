import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Minus, Plus, ShoppingBag } from "lucide-react";
import { cn } from "cn";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CatalogSkeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
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
import {
  isAdminAccount,
  getCashierBranch,
  useAuthStore,
  usesCashierMode,
} from "@/features/auth/auth-store";
import { ProductImage } from "@/features/products/product-card";
import { ProductPrice } from "@/features/products/product-price";
import { getProductPricing } from "@/features/products/product-pricing";
import { availableProductStock } from "@/features/products/product-stock";
import type { Product } from "@/features/products/sample-products";
import { useProductCategories } from "@/features/products/use-product-categories";
import { formatCurrency } from "@/lib/currency";
import { fetchTransactionDetail } from "@/features/sales/sales-api";
import { orderOwner, orderTotal, pendingOrderDraft, productKey, useOrderStore, type OrderDraft, type OrderLine } from "./order-store";
import { OrderSummary, PayOrderButton } from "./order-summary";
import { PendingOrderButton } from "./pending-order-button";
import { CashSessionControl } from "@/features/cash-session/cash-session-control";
import { cashSessionAllowsSales, useCashSession } from "@/features/cash-session/cash-session-query";
import { isLowStock, useOrderProducts } from "./order-products";
import { LowStockReminder } from "./low-stock-reminder";
import { OrderQuantityButtons, QuantityButtons } from "./order-quantity-buttons";
import { changePendingQuantity, pendingQuantityLimit, usePendingOrderCancellation, usePendingOrderEdit } from "./pending-order-edit";
import { OrderCategoryReorderDrawer } from "./order-category-reorder-drawer";
import {
  getOrderCategories,
  useOrderCategoryOrder,
} from "./order-category-order";

type PendingProductEdit = {
  line?: OrderLine;
  remaining: number;
  busy: boolean;
  change: (quantity: number) => void;
};

function OrderProductCard({ product, edit }: { product: Product; edit?: PendingProductEdit }) {
  const [open, setOpen] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const orders = useOrderStore((state) => state.orders);
  const activeId = useOrderStore((state) => state.activeId);
  const active = orders.find((order) => order.id === activeId);
  const key = productKey(product);
  const line = active?.items.find((item) => item.key === key);
  const reserved = orders.reduce(
    (sum, order) =>
      sum +
      order.items.reduce(
        (count, item) => count + (item.key === key ? item.quantity : 0),
        0,
      ),
    0,
  );
  const usesStock = product.useStock !== false;
  const remaining = edit?.remaining ?? availableProductStock(product, reserved);
  const unavailable = edit ? edit.busy || remaining <= 0 : !product.active || availableProductStock(product) <= 0;
  const lowStock = isLowStock(product, remaining);
  const outOfStock = usesStock && remaining <= 0;
  let stockLabel = "Tanpa stok";
  if (usesStock) stockLabel = outOfStock ? "Stok habis" : `Stok tersedia ${remaining}`;
  const stockWarning = lowStock && (
    <StatusBadge tone="warning">Hampir habis</StatusBadge>
  );
  const stock = outOfStock && product.stock > 0 ? (
    <StatusBadge tone="danger">{stockLabel}</StatusBadge>
  ) : (
    <span className={cn("text-xs", outOfStock ? "text-destructive" : "text-muted-foreground")}>{stockLabel}</span>
  );
  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (next) setQuantity(1);
        setOpen(next);
      }}
    >
      <DrawerTrigger asChild>
        <button
          type="button"
          disabled={unavailable}
          aria-label={`Detail ${product.title}, ${stockLabel}${lowStock ? ", hampir habis" : ""}`}
          className="flex w-full flex-1 flex-col rounded-2xl text-left outline-none transition-colors enabled:hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
        >
          <div className="relative w-full">
            <ProductImage product={product} showActiveStatus={false} />
            {stockWarning && (
              <div className="pointer-events-none absolute bottom-2 left-2">{stockWarning}</div>
            )}
          </div>
          <div className="w-full flex-1 space-y-1 p-3">
            <h2 className="text-sm font-medium leading-5">{product.title}</h2>
            <ProductPrice product={product} />
            {stock}
          </div>
        </button>
      </DrawerTrigger>
      {!edit && active && line && (
        <div className="border-t p-3">
          <OrderQuantityButtons
            orderId={active.id}
            item={line}
            catalogProduct={product}
          />
        </div>
      )}
      {edit?.line && (
        <div className="border-t p-3">
          <QuantityButtons title={product.title} quantity={edit.line.quantity} disabled={edit.busy}
            canIncrease={edit.remaining > 0} onChange={(delta) => edit.change((edit.line?.quantity ?? 0) + delta)} />
        </div>
      )}
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="break-words">{product.title}</DrawerTitle>
        </DrawerHeader>
        <DrawerBody className="space-y-3">
          <div className="relative">
            <ProductImage product={product} detail />
            {stockWarning && (
              <div className="pointer-events-none absolute bottom-6 left-6">{stockWarning}</div>
            )}
          </div>
          <div className="flex items-start justify-between gap-3">
            <ProductPrice product={product} detail />
            {stock}
          </div>
          <DrawerDescription>
            {product.description || "Belum ada deskripsi."}
          </DrawerDescription>
        </DrawerBody>
        <DrawerFooter>
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div className="flex shrink-0 items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-12"
                disabled={quantity <= 1}
                onClick={() => setQuantity((value) => value - 1)}
                aria-label="Kurangi jumlah"
              >
                <Minus aria-hidden="true" />
              </Button>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={usesStock ? remaining : undefined}
                step={1}
                aria-label="Jumlah produk"
                value={quantity || ""}
                onChange={(event) => setQuantity(Number(event.target.value))}
                className="w-16 text-center tabular-nums [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [appearance:textfield]"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-12"
                disabled={quantity >= remaining}
                onClick={() => setQuantity((value) => value + 1)}
                aria-label="Tambah jumlah"
              >
                <Plus aria-hidden="true" />
              </Button>
            </div>
            <p className="ml-auto min-w-0 wrap-anywhere text-right text-base leading-tight font-semibold tabular-nums">
              {formatCurrency(getProductPricing(product).finalPrice * quantity)}
            </p>
          </div>
          <Button
            type="button"
            disabled={
              unavailable ||
              !Number.isSafeInteger(quantity) ||
              quantity < 1 ||
              quantity > remaining
            }
            onClick={() => {
              if (edit) {
                edit.change((edit.line?.quantity ?? 0) + quantity);
                setOpen(false);
                return;
              }
              const error = useOrderStore.getState().addItem(product, quantity);
              if (error) {
                toast.error(error);
                return;
              }
              const state = useOrderStore.getState();
              const order = state.orders.find(
                (order) => order.id === state.activeId,
              );
              toast.success(`Ditambahkan ke ${order?.name ?? "pesanan"}`);
              setOpen(false);
            }}
          >
            {edit ? "Tambah produk" : "Add to cart"}
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

export function OrderPage({ home = false, editTrxId, returnSession }: {
  home?: boolean; editTrxId?: string; returnSession?: string;
}) {
  const account = useAuthStore((state) => state.session?.account);
  const cashierMode = useAuthStore((state) => usesCashierMode(state.session));
  const draftOwner = useAuthStore((state) => orderOwner(state.session));
  const branchId = useAuthStore((state) => getCashierBranch(state.session)?.id);
  const navigate = useNavigate();
  const pendingEdit = usePendingOrderEdit(draftOwner, !!editTrxId);
  const detail = useQuery({
    queryKey: ["transactions", "detail", account?.account_username, editTrxId],
    queryFn: ({ signal }) => fetchTransactionDetail(editTrxId!, signal),
    enabled: !!account && !!editTrxId,
    staleTime: 0,
  });
  const [edits, setEdits] = useState<{ owner: string; original: OrderDraft; order: OrderDraft }>();
  const wrongBranch = !!branchId && !!detail.data && detail.data.branchId !== branchId;
  const serverOrder = detail.data?.status === "pending" && !wrongBranch ? detail.data : undefined;
  const currentEdits = edits?.owner === draftOwner ? edits : undefined;
  const pendingOriginal = currentEdits?.original ?? (serverOrder && pendingOrderDraft(serverOrder));
  const pendingOrder = currentEdits?.order ?? pendingOriginal;
  const transactionBranch = serverOrder?.branchId ?? branchId ?? account?.store?.branch_id;
  const requiresShift = !isAdminAccount(account);
  const cashSession = useCashSession(requiresShift);
  const canTransact = !requiresShift || (cashSessionAllowsSales(cashSession.data, branchId) && !cashSession.isError);
  const catalog = useOrderProducts();
  const reminderScope = JSON.stringify([
    draftOwner,
    account?.store?.id ?? account?.event_id,
    branchId ?? account?.store?.branch_id,
  ]);
  const catalogUnavailable = catalog.isError && !catalog.data;
  const showProducts = !catalog.isPending && !catalogUnavailable && (!editTrxId || !!serverOrder);
  const products = (catalog.data?.products ?? []).filter((product) => !editTrxId || (
    !!transactionBranch && transactionBranch !== "all" && product.branchId === transactionBranch
  ));
  const canManageCategories = !cashierMode && isAdminAccount(account);
  const storeCategories = useProductCategories(canManageCategories);
  const categoryOrder = useOrderCategoryOrder(
    canManageCategories ? undefined : account,
  );
  const { owner, orders, activeId, initialize } = useOrderStore();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const cancelPending = usePendingOrderCancellation(draftOwner, branchId);
  const sessionControl = useRef<{ openMenu: () => void }>(null);
  const openShiftAfterSummary = useRef(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  useEffect(() => {
    if (draftOwner) initialize(draftOwner);
  }, [draftOwner, initialize]);
  const categories = getOrderCategories(
    products,
    canManageCategories ? (storeCategories.data ?? []) : [],
    categoryOrder.order,
  );
  const selectedCategory = categories.some(
    ({ category_slug }) => category_slug === category,
  )
    ? category
    : null;
  const keyword = search.trim().toLocaleLowerCase("id-ID");
  const visible = products.filter(
    (product) =>
      (selectedCategory === null || product.category === selectedCategory) &&
      product.title.toLocaleLowerCase("id-ID").includes(keyword),
  );
  const active = editTrxId ? pendingOrder : orders.find((order) => order.id === activeId);
  const hasItems = !!active?.items.length;
  if (summaryOpen && !hasItems) setSummaryOpen(false);

  function changeEditedQuantity(id: string, quantity: number, product?: Product) {
    if (!draftOwner || !pendingOriginal || !serverOrder || pendingEdit.isPending || cancelId) return;
    if (quantity === 0 && pendingOrder?.items.length === 1 && pendingOrder.items[0].product.id === id) {
      cancelPending.reset();
      setCancelId(serverOrder.id);
      return;
    }
    setEdits((previous) => {
      const order = previous?.owner === draftOwner ? previous.order : pendingOriginal;
      return { owner: draftOwner, original: pendingOriginal, order: changePendingQuantity(order, pendingOriginal, id, quantity, product) };
    });
  }

  function saveEditedOrder() {
    if (!pendingOrder?.items.length || !serverOrder || !currentEdits || pendingEdit.isPending || cancelId) return;
    pendingEdit.mutate({ order: pendingOrder, transaction: serverOrder }, {
      onSuccess: () => {
        toast.success("Perubahan pesanan tersimpan.");
        void navigate({ to: "/cart", search: { session: returnSession }, replace: true });
      },
    });
  }
  if (!draftOwner || owner !== draftOwner)
    return (
      <main id="main-content" className="page-gutter py-4">
        <p role="status" className="text-sm text-muted-foreground">
          Menyiapkan pesanan...
        </p>
      </main>
    );
  return (
    <>
      {!editTrxId && (
        <LowStockReminder
          key={reminderScope}
          scope={reminderScope}
          products={products}
          ready={catalog.isSuccess && !catalog.isFetching}
        />
      )}
      <header className="products-toolbar sticky top-0 z-20 w-full border-b bg-background pt-[env(safe-area-inset-top)]">
        <div className="page-gutter flex h-12 items-center gap-2">
          {editTrxId && (
            <Button asChild variant="ghost" size="icon">
              <Link to="/cart" search={{ session: returnSession }} aria-label="Kembali ke antrean"><ArrowLeft /></Link>
            </Button>
          )}
          {!home && !editTrxId && (
            <Button asChild type="button" variant="ghost" size="icon">
              <Link to="/profil" aria-label="Kembali ke profil">
                <ArrowLeft />
              </Link>
            </Button>
          )}
          <h1 className="flex-1 text-lg font-semibold">{editTrxId ? "Edit pesanan" : "Order"}</h1>
          {requiresShift && <CashSessionControl presentation="popover" ref={sessionControl} />}
        </div>
        <div className="page-gutter">
          <Input
            type="search"
            aria-label="Cari produk untuk pesanan"
            placeholder="Cari produk..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="page-gutter flex h-14 items-center gap-2">
          <div
            role="group"
            aria-label="Kategori produk"
            className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto"
          >
            <Button
              type="button"
              size="sm"
              className="w-fit rounded-full px-3"
              variant={selectedCategory === null ? "default" : "outline"}
              aria-pressed={selectedCategory === null}
              onClick={() => setCategory(null)}
            >
              Semua
            </Button>
            {categories.map(({ category_slug: value, category_name: name }) => (
              <Button
                key={value}
                type="button"
                size="sm"
                className="w-fit rounded-full px-3"
                variant={selectedCategory === value ? "default" : "outline"}
                aria-pressed={selectedCategory === value}
                onClick={() => setCategory(value)}
              >
                {name}
              </Button>
            ))}
          </div>
          {canManageCategories ? (
            <OrderCategoryReorderDrawer
              source="store"
              query={storeCategories}
            />
          ) : (
            catalog.data && (
              <OrderCategoryReorderDrawer
                source="local"
                categories={categories}
                onSave={categoryOrder.save}
              />
            )
          )}
        </div>
      </header>
      <main id="main-content" className="page-gutter min-w-0 flex-1 pt-4 pb-28 sm:pt-6">
        {editTrxId && detail.isPending && <CatalogSkeleton label="Memuat pesanan" />}
        {editTrxId && detail.isError && <div className="space-y-3">
          <p role="alert">{detail.error.message}</p>
          <Button type="button" variant="outline" loading={detail.isFetching} onClick={() => void detail.refetch()}>Coba lagi</Button>
        </div>}
        {editTrxId && detail.isSuccess && !serverOrder && <p role="status">
          {wrongBranch ? "Cabang pesanan tidak sesuai dengan cabang kasir." : "Pesanan sudah tidak menunggu pembayaran."}
        </p>}
        {catalog.isPending && (!editTrxId || serverOrder) && <CatalogSkeleton />}
        {catalogUnavailable && (
          <div className="space-y-3 py-12 text-center">
            <p role="alert" className="text-sm text-destructive">
              Gagal memuat produk.
            </p>
            <Button
              type="button"
              variant="outline"
              loading={catalog.isFetching}
              onClick={() => void catalog.refetch()}
            >
              Coba lagi
            </Button>
          </div>
        )}
        {showProducts && visible.length > 0 && (
          <ul className="bento-catalog">
            {visible.map((product) => {
              const line = pendingOrder?.items.find((item) => item.product.id === product.id);
              return <li key={productKey(product)} className="bento-surface flex flex-col">
                <OrderProductCard product={product} edit={pendingOriginal && {
                  line, busy: pendingEdit.isPending,
                  remaining: Math.max(0, pendingQuantityLimit(pendingOriginal, product.id, product) - (line?.quantity ?? 0)),
                  change: (quantity) => changeEditedQuantity(product.id, quantity, product),
                }} />
              </li>;
            })}
          </ul>
        )}
        {showProducts && visible.length === 0 && (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Produk tidak ditemukan.
          </p>
        )}
      </main>
      {active && hasItems && account && (!editTrxId || serverOrder) && (
        <Drawer open={summaryOpen} dismissible={!pendingEdit.isPending} onOpenChange={setSummaryOpen}>
          <div className="order-cart-bar fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 py-3 pl-[calc(1rem+env(safe-area-inset-left))] pr-[calc(1rem+env(safe-area-inset-right))] sm:pl-[calc(1.5rem+env(safe-area-inset-left))] sm:pr-[calc(1.5rem+env(safe-area-inset-right))]">
            <DrawerTrigger asChild>
              <Button
                type="button"
                className="ml-auto flex h-12 w-full justify-between rounded-xl shadow-lg sm:max-w-sm"
              >
                <span className="flex items-center gap-2">
                  <ShoppingBag aria-hidden="true" />
                  {active.items.reduce(
                    (sum, item) => sum + item.quantity,
                    0,
                  )}{" "}
                  item
                </span>
                <span className="tabular-nums">
                  {formatCurrency(orderTotal(active))}
                </span>
              </Button>
            </DrawerTrigger>
          </div>
          <DrawerContent
            onCloseAutoFocus={(event) => {
              if (!openShiftAfterSummary.current) return;
              event.preventDefault();
              openShiftAfterSummary.current = false;
              sessionControl.current?.openMenu();
            }}
          >
            <DrawerHeader>
              <DrawerTitle>Ringkasan pesanan</DrawerTitle>
              <DrawerDescription>{active.name}</DrawerDescription>
            </DrawerHeader>
            <DrawerBody>
              <OrderSummary
                order={active}
                productsByKey={catalog.data?.byKey}
                renderQuantity={pendingOriginal && ((item) => {
                  const product = products.find((entry) => entry.id === item.product.id);
                  return <QuantityButtons title={item.product.title} quantity={item.quantity} disabled={pendingEdit.isPending}
                    canIncrease={item.quantity < pendingQuantityLimit(pendingOriginal, item.product.id, product)}
                    onChange={(delta) => changeEditedQuantity(item.product.id, item.quantity + delta, product)} />;
                })}
              />
              {/* <Button asChild variant="ghost" className="mt-3 w-full">
                <Link to="/cart">Lihat semua pesanan</Link>
              </Button> */}
            </DrawerBody>
            <DrawerFooter>
              {editTrxId && <>
                {pendingEdit.isError && <p role="alert" className="text-sm text-destructive">{pendingEdit.error.message}</p>}
                <Button type="button" disabled={!currentEdits || pendingEdit.isPending}
                  loading={pendingEdit.isPending} onClick={saveEditedOrder}>Simpan</Button>
              </>}
              {!editTrxId && canTransact && (
                <div className="modal-actions">
                  <PendingOrderButton key={active.id} account={account} order={active}
                    onQueued={() => setSummaryOpen(false)} onShiftRequired={() => {
                      openShiftAfterSummary.current = true;
                      setSummaryOpen(false);
                    }} />
                  <PayOrderButton order={active} />
                </div>
              )}
              {!editTrxId && !canTransact && (
                <DrawerClose asChild>
                  <Button type="button" className="w-full" disabled={cashSession.isPending}
                    loading={cashSession.isPending} onClick={() => { openShiftAfterSummary.current = true; }}>
                    {cashSession.isError ? "Periksa shift" : "Buka shift"}
                  </Button>
                </DrawerClose>
              )}
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      )}
      <Dialog open={!!cancelId} onOpenChange={(open) => {
        if (!open && !cancelPending.isPending) setCancelId(null);
      }}>
        <DialogContent role="alertdialog" closeDisabled={cancelPending.isPending}>
          <DialogHeader>
            <DialogTitle>Hapus produk terakhir?</DialogTitle>
            <DialogDescription>
              Menghapus produk terakhir akan menghapus pesanan ini dari antrean.
            </DialogDescription>
          </DialogHeader>
          {cancelPending.isError && (
            <DialogBody>
              <p role="alert" className="text-destructive">{cancelPending.error.message}</p>
            </DialogBody>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={cancelPending.isPending} onClick={() => setCancelId(null)}>
              Batal
            </Button>
            <Button type="button" variant="destructive" loading={cancelPending.isPending}
              disabled={cancelPending.isPending || cancelId !== serverOrder?.id}
              onClick={() => {
                if (!cancelId || cancelId !== serverOrder?.id) return;
                cancelPending.mutate(cancelId, {
                  onSuccess: () => {
                    setCancelId(null);
                    setSummaryOpen(false);
                    void navigate({ to: "/cart", search: { session: returnSession }, replace: true });
                  },
                });
              }}>
              Hapus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
