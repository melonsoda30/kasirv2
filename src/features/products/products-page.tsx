import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ListOrdered, ListTree, Plus, Search, Settings, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CatalogSkeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { getAccountBranches, getAdminBranch, useAuthStore } from "@/features/auth/auth-store";
import { AdminBranchSwitcher } from "@/features/auth/admin-branch-drawer";
import { useOrderListPreference } from "@/features/orders/order-list-preference";
import { OrderProductReorderDrawer } from "@/features/orders/order-product-reorder-drawer";
import { sortOrderProducts, useOrderProducts } from "@/features/orders/order-products";
import { productKey } from "@/features/orders/order-store";
import { useProductCatalog } from './use-product-catalog';
import { useProductStore } from "./product-store";
import { ProductCard } from "./product-card";
import { ProductFilterDrawer } from "./product-filter-drawer";
import { ProductSortDrawer } from "./product-sort-drawer";
import { productSortOptions, sortProducts, type ProductSort } from "./product-sort";
import { CategorySettingsDrawer } from "./category-settings-drawer";
import { useCanManageCategories, useProductCategories } from "./use-product-categories";
import {
  defaultProductFilters,
  matchesProductFilters,
} from "./product-filters";

const adminProductSortOptions = [
  ...productSortOptions,
  { value: "custom", label: "Urutan Kustom" },
] as const;

type AdminProductSort = ProductSort | "custom";
type ProductSettings = "categories" | "order";

export function ProductsPage() {
  const branchId = useAuthStore((state) => getAdminBranch(state.session)?.id);
  const catalog = useProductCatalog(branchId);
  const account = useAuthStore((state) => state.session?.account);
  const store = account?.store;
  const productOrderKey = account
    ? `kasirv2.admin-product-order:${JSON.stringify([
        account.account_id ?? account.account_username,
        store?.id ?? account.event_id,
        branchId ?? "all",
      ])}`
    : undefined;
  const productOrder = useOrderListPreference(productOrderKey);
  const items = catalog.data ?? [];
  const customOrder = productOrder.order.length ? productOrder.order : items.map(productKey);
  const updateProduct = useProductStore((state) => state.updateProduct);
  const categories = useProductCategories();
  const canManageCategories = useCanManageCategories();
  const availableCategories = new Map(categories.data?.map((item) => [
    item.category_slug, item.category_name,
  ]));
  for (const item of items) {
    if (!availableCategories.has(item.category)) {
      availableCategories.set(item.category, item.category);
    }
  }
  const [search, setSearch] = useState("");
  const [selectedCategory, setCategory] = useState<string | null>(null);
  const category = selectedCategory !== null && availableCategories.has(selectedCategory)
    ? selectedCategory
    : null;
  const [filters, setFilters] = useState(defaultProductFilters);
  const [selectedSort, setSelectedSort] = useState<{ key: typeof productOrderKey; value: AdminProductSort }>();
  const defaultSort = productOrder.order.length ? "custom" : "default";
  const sort = selectedSort && selectedSort.key === productOrderKey ? selectedSort.value : defaultSort;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsPanel, setSettingsPanel] = useState<ProductSettings | null>(null);
  const settingsButton = useRef<HTMLButtonElement>(null);
  const availableStores = getAccountBranches(store);
  const branchNames = new Map(availableStores.map(({ id, name }) => [id, name]));
  const statusLabel = filters.status === "active" ? "Aktif" : "Nonaktif";
  const filterChips = [
    ...(!branchId && filters.store !== "all"
      ? [{
          key: "store" as const,
          label: branchNames.get(filters.store) ?? filters.store,
        }]
      : []),
    ...(filters.status !== "all"
      ? [
          {
            key: "status" as const,
            label: statusLabel,
          },
        ]
      : []),
  ];
  const matchingProducts = items.filter(
    (product) =>
      matchesProductFilters(product, { ...filters, store: branchId ?? filters.store }) &&
      (category === null || product.category === category) &&
      product.title
        .toLocaleLowerCase("id-ID")
        .includes(search.trim().toLocaleLowerCase("id-ID")),
  );
  const needsSales = sort === "best_seller" && matchingProducts.some(
    ({ soldQuantity }) => soldQuantity === undefined,
  );
  const salesCatalog = useOrderProducts(needsSales);
  const salesByKey = needsSales ? salesCatalog.data?.byKey : undefined;
  const productsWithSales = salesByKey
    ? matchingProducts.map((product) => {
        if (product.soldQuantity !== undefined) return product;
        const soldQuantity = salesByKey.get(productKey(product))?.soldQuantity;
        return soldQuantity === undefined ? product : { ...product, soldQuantity };
      })
    : matchingProducts;
  const products = sort === "custom"
    ? sortOrderProducts(productsWithSales, sort, customOrder)
    : sortProducts(productsWithSales, sort);
  const salesUnavailable = needsSales && salesCatalog.isSuccess &&
    !products.some(({ soldQuantity }) => soldQuantity !== undefined);

  function setSort(value: AdminProductSort) {
    setSelectedSort({ key: productOrderKey, value });
  }

  function openSettings(panel: ProductSettings) {
    setSettingsOpen(false);
    setSettingsPanel(panel);
  }

  function restoreSettingsFocus(event: Event) {
    event.preventDefault();
    settingsButton.current?.focus();
  }

  return (
    <>
      <header className="products-toolbar sticky top-0 z-20 w-full border-b bg-background pt-[env(safe-area-inset-top)]">
        <div className="page-gutter flex h-12 items-center justify-between gap-2">
          <h1 className="min-w-0 text-lg font-semibold tracking-tight">Produk</h1>
          <div className="min-w-0 max-w-[45%] empty:hidden"><AdminBranchSwitcher /></div>
        </div>
        <div className="page-gutter flex h-12 gap-2">
          <div className="min-w-0 flex-1">
            <Input
              type="search"
              aria-label="Cari produk"
              placeholder="Cari produk..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Popover open={settingsOpen} onOpenChange={setSettingsOpen}>
            <PopoverTrigger asChild>
              <Button
                ref={settingsButton}
                type="button"
                variant="outline"
                size="icon"
                className="size-12 shrink-0"
                aria-label="Pengaturan produk"
              >
                <Settings aria-hidden="true" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              aria-label="Pengaturan produk"
              className="w-56 gap-1 p-1"
              onCloseAutoFocus={(event) => {
                if (settingsPanel) event.preventDefault();
              }}
            >
              {canManageCategories && (
                <Button type="button" variant="ghost" className="justify-start" onClick={() => openSettings("categories")}>
                  <ListTree aria-hidden="true" /> Pengaturan kategori
                </Button>
              )}
              <Button type="button" variant="ghost" className="justify-start" onClick={() => openSettings("order")}>
                <ListOrdered aria-hidden="true" /> Pengaturan urutan
              </Button>
            </PopoverContent>
          </Popover>
          <Button asChild size="icon" className="size-12">
            <Link to="/produk/tambah" aria-label="Tambah produk">
              <Plus size={18} aria-hidden="true" />
            </Link>
          </Button>
        </div>
        <div className="page-gutter flex h-14 items-center gap-2">
          <div role="group" aria-label="Kategori produk" className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto">
            <Button
              type="button"
              size="sm"
              className="w-fit rounded-full px-3"
              aria-pressed={category === null}
              onClick={() => setCategory(null)}
              variant={category === null ? "default" : "outline"}
            >
              Semua {category === null && `(${products.length})`}
            </Button>
            {[...availableCategories].map(([slug, name]) => (
              <Button
                key={slug}
                type="button"
                size="sm"
                className="w-fit rounded-full px-3"
                aria-pressed={category === slug}
                onClick={() => setCategory(slug)}
                variant={category === slug ? "default" : "outline"}
              >
                {name} {category === slug && `(${products.length})`}
              </Button>
            ))}
          </div>
          <ProductFilterDrawer
            filters={filters}
            stores={availableStores}
            hideStore={!!branchId}
            onSave={setFilters}
          />
          <ProductSortDrawer options={adminProductSortOptions} sort={sort} defaultSort="default" onSave={setSort} />
        </div>
        {filterChips.length > 0 && (
          <div
            role="group"
            aria-label="Filter aktif"
            className="page-gutter flex h-11 items-start gap-2 overflow-x-auto overflow-y-hidden [scrollbar-width:thin]"
          >
            {filterChips.map(({ key, label }) => (
              <Button
                key={key}
                type="button"
                variant="secondary"
                size="sm"
                className="rounded-full"
                aria-label={`Hapus filter ${key === "store" ? "store" : "status"} ${label}`}
                onClick={() =>
                  setFilters((current) => ({ ...current, [key]: "all" }))
                }
              >
                {label}
                <X aria-hidden="true" />
              </Button>
            ))}
          </div>
        )}
      </header>
      <main
        id="main-content"
        className="page-gutter min-w-0 flex-1 py-4 sm:py-6"
      >
        {catalog.isPending && <CatalogSkeleton />}
        {!catalog.isPending && catalog.isError && (
          <div role="alert" className="space-y-3 py-16 text-center">
            <p className="text-sm">Gagal memuat produk. Silakan coba lagi.</p>
            <Button type="button" variant="outline" onClick={() => void catalog.refetch()} loading={catalog.isFetching}>Coba lagi</Button>
          </div>
        )}
        {needsSales && salesCatalog.isPending && (
          <p role="status" className="mb-3 text-sm text-muted-foreground">Memuat jumlah terjual...</p>
        )}
        {salesUnavailable && (
          <p role="status" className="mb-3 text-sm text-muted-foreground">Data penjualan produk belum tersedia.</p>
        )}
        {needsSales && salesCatalog.isError && !salesCatalog.data && (
          <div className="mb-3 flex items-center justify-between gap-3 text-sm">
            <p role="alert">Gagal memuat jumlah terjual.</p>
            <Button type="button" variant="outline" size="sm" loading={salesCatalog.isFetching} onClick={() => void salesCatalog.refetch()}>
              Coba lagi
            </Button>
          </div>
        )}
        {catalog.isSuccess && products.length > 0 && (
          <ul className="bento-catalog">
            {products.map((product) => (
              <li key={JSON.stringify([product.id, product.branchId])} className="bento-surface">
                <ProductCard
                  product={product}
                  branchName={
                    branchId === "all"
                      ? product.branchName || branchNames.get(product.branchId ?? "") || product.branchId
                      : undefined
                  }
                  onUpdate={updateProduct}
                />
              </li>
            ))}
          </ul>
        )}
        {!catalog.isPending && !catalog.isError && !products.length && (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Search size={32} className="text-zinc-300" aria-hidden="true" />
            <div>
              <h2 className="font-medium">Produk tidak ditemukan</h2>
              <p className="text-sm text-zinc-500">
                Coba kata kunci, kategori, atau filter lainnya.
              </p>
            </div>
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setSearch("");
                setCategory(null);
                setFilters(defaultProductFilters);
              }}
            >
              <X size={16} aria-hidden="true" /> Reset pencarian
            </Button>
          </div>
        )}
      </main>
      {canManageCategories && (
        <CategorySettingsDrawer
          categories={categories}
          open={settingsPanel === "categories"}
          onOpenChange={(open) => setSettingsPanel(open ? "categories" : null)}
          onCloseAutoFocus={restoreSettingsFocus}
        />
      )}
      <OrderProductReorderDrawer
        key={productOrderKey}
        products={items}
        order={customOrder}
        branchNames={branchId === "all" ? branchNames : undefined}
        open={settingsPanel === "order"}
        onOpenChange={(open) => setSettingsPanel(open ? "order" : null)}
        onCloseAutoFocus={restoreSettingsFocus}
        onSave={(order) => {
          productOrder.save(order);
          setSort("custom");
        }}
      />
    </>
  );
}
