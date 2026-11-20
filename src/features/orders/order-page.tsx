import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, Minus, Plus, ShoppingBag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { isAdminAccount, isCashierEventLevel, useAuthStore } from "@/features/auth/auth-store";
import { ProductImage } from "@/features/products/product-card";
import { ProductPrice } from "@/features/products/product-price";
import { getProductPricing } from "@/features/products/product-pricing";
import type { Product } from "@/features/products/sample-products";
import { useProductCategories } from "@/features/products/use-product-categories";
import { formatCurrency } from "@/lib/currency";
import { orderTotal, productKey, useOrderStore } from "./order-store";
import { OrderSummary, PayOrderButton } from "./order-summary";
import { useOrderProducts } from "./order-products";
import { OrderQuantityButtons } from "./order-quantity-buttons";
import { OrderCategoryReorderDrawer } from "./order-category-reorder-drawer";
import { getOrderCategories, useOrderCategoryOrder } from "./order-category-order";

function OrderProductCard({ product }: { product: Product }) {
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
  const remaining = Math.max(0, product.stock - reserved);
  const unavailable = !product.active || product.stock <= 0;
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
          aria-label={`Detail ${product.title}`}
          className="w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
        >
          <ProductImage product={product} />
          <div className="space-y-1 pt-2">
            <h2 className="text-sm font-medium leading-5">{product.title}</h2>
            <ProductPrice product={product} />
          </div>
        </button>
      </DrawerTrigger>
      {active && line && (
        <div className="mt-2">
          <OrderQuantityButtons orderId={active.id} item={line} catalogProduct={product} />
        </div>
      )}
      <DrawerContent className="product-drawer pb-[env(safe-area-inset-bottom)]">
        <div className="min-h-0 overflow-y-auto">
          <div className="mt-4">
            <ProductImage product={product} detail />
          </div>
          <DrawerHeader className="text-left">
            <DrawerTitle>{product.title}</DrawerTitle>
            <div className="my-2 flex items-start justify-between gap-3">
              <ProductPrice product={product} detail />
              <span className="text-xs text-muted-foreground">
                {remaining} tersedia
              </span>
            </div>
            <DrawerDescription>
              {product.description || "Belum ada deskripsi."}
            </DrawerDescription>
          </DrawerHeader>
        </div>
        <DrawerFooter className="border-t">
          {/* <p className="truncate text-xs text-muted-foreground">Tambahkan ke {active?.name || 'pesanan'}</p> */}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={quantity <= 1}
                onClick={() => setQuantity((value) => value - 1)}
                aria-label="Kurangi jumlah"
              >
                <Minus />
              </Button>
              <Input
                type="number"
                inputMode="numeric"
                min={1}
                max={remaining}
                step={1}
                aria-label="Jumlah produk"
                value={quantity || ""}
                onChange={(event) => setQuantity(Number(event.target.value))}
                className="w-16 text-center"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                disabled={quantity >= remaining}
                onClick={() => setQuantity((value) => value + 1)}
                aria-label="Tambah jumlah"
              >
                <Plus />
              </Button>
            </div>
            <p className="font-semibold tabular-nums">
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
            Add to cart
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

export function OrderPage({ home = false }: { home?: boolean }) {
  const account = useAuthStore((state) => state.session?.account);
  const accountId = account?.account_id;
  const catalog = useOrderProducts();
  const products = catalog.data?.products ?? [];
  const canManageCategories = !isCashierEventLevel(account?.event_level) && isAdminAccount(account);
  const storeCategories = useProductCategories(canManageCategories);
  const categoryOrder = useOrderCategoryOrder(canManageCategories ? undefined : account);
  const { owner, orders, activeId, initialize, createOrder } = useOrderStore();
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  useEffect(() => {
    if (accountId) initialize(accountId);
  }, [accountId, initialize]);
  const categories = getOrderCategories(
    products,
    canManageCategories ? storeCategories.data ?? [] : [],
    categoryOrder.order,
  );
  const selectedCategory = categories.some(({ category_slug }) => category_slug === category) ? category : null;
  const keyword = search.trim().toLocaleLowerCase("id-ID");
  const visible = products.filter(
    (product) =>
      (selectedCategory === null || product.category === selectedCategory) &&
      product.title
        .toLocaleLowerCase("id-ID")
        .includes(keyword),
  );
  const active = orders.find((order) => order.id === activeId);
  if (!accountId || owner !== accountId)
    return (
      <main id="main-content" className="p-4">
        <p role="status" className="text-sm text-muted-foreground">
          Menyiapkan pesanan...
        </p>
      </main>
    );
  return (
    <>
      <header className="products-toolbar sticky top-0 z-20 w-full border-b bg-background pt-[env(safe-area-inset-top)]">
        <div className="flex h-12 items-center gap-2 px-4">
          {!home && (
            <Button asChild type="button" variant="ghost" size="icon">
              <Link to="/profil" aria-label="Kembali ke profil">
                <ArrowLeft />
              </Link>
            </Button>
          )}
          <h1 className="flex-1 text-lg font-semibold">Order</h1>
          <Button asChild type="button" variant="outline" size="sm">
            <Link to="/cart">
              <ShoppingBag aria-hidden="true" />
              {home ? "Antrean" : "Cart"} (
              {orders
                .find((order) => order.id === activeId)
                ?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0}
              )
            </Link>
          </Button>
        </div>
        <div className="px-4">
          <Input
            type="search"
            aria-label="Cari produk untuk pesanan"
            placeholder="Cari produk..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-9"
          />
        </div>
        <div className="flex h-14 items-center gap-2 px-4">
          <div role="group" aria-label="Kategori produk" className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
            <Button
              type="button"
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
                variant={selectedCategory === value ? "default" : "outline"}
                aria-pressed={selectedCategory === value}
                onClick={() => setCategory(value)}
              >
                {name}
              </Button>
            ))}
          </div>
          {canManageCategories ? (
            <OrderCategoryReorderDrawer source="store" query={storeCategories} />
          ) : catalog.data && (
            <OrderCategoryReorderDrawer source="local" categories={categories} onSave={categoryOrder.save} />
          )}
        </div>
      </header>
      <main id="main-content" className="min-w-0 flex-1 px-4 pt-4 pb-28">
        {catalog.isPending ? (
          <p role="status" className="py-12 text-center text-sm text-muted-foreground">Memuat produk...</p>
        ) : catalog.isError && !catalog.data ? (
          <div className="space-y-3 py-12 text-center">
            <p role="alert" className="text-sm text-destructive">Gagal memuat produk.</p>
            <Button type="button" variant="outline" loading={catalog.isFetching} onClick={() => void catalog.refetch()}>
              Coba lagi
            </Button>
          </div>
        ) : visible.length ? (
          <ul className="grid grid-cols-2 gap-x-3 gap-y-6">
            {visible.map((product) => (
              <li key={productKey(product)} className="min-w-0">
                <OrderProductCard product={product} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-16 text-center text-sm text-muted-foreground">
            Produk tidak ditemukan.
          </p>
        )}
      </main>
      {active && (
        <Drawer open={summaryOpen} onOpenChange={setSummaryOpen}>
          <div className="order-cart-bar fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 p-3">
            <DrawerTrigger asChild>
              <Button
                type="button"
                className="h-12 w-full justify-between rounded-xl shadow-lg"
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
          <DrawerContent className="product-drawer pb-[env(safe-area-inset-bottom)]">
            <DrawerHeader>
              <DrawerTitle>Ringkasan pesanan</DrawerTitle>
              <DrawerDescription>{active.name}</DrawerDescription>
            </DrawerHeader>
            <div className="min-h-0 overflow-y-auto px-4 pb-4">
              <OrderSummary order={active} productsByKey={catalog.data?.byKey} />
              {/* <Button asChild variant="ghost" className="mt-3 w-full">
                <Link to="/cart">Lihat semua pesanan</Link>
              </Button> */}
            </div>
            <DrawerFooter className="border-t">
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto min-h-8 whitespace-normal py-2"
                  onClick={() => {
                    createOrder();
                    setSummaryOpen(false);
                  }}
                >
                  Buat pesanan baru
                </Button>
                <PayOrderButton order={active} />
              </div>
            </DrawerFooter>
          </DrawerContent>
        </Drawer>
      )}
    </>
  );
}
