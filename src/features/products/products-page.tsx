import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CatalogSkeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { getAccountBranches, getAdminBranch, useAuthStore } from "@/features/auth/auth-store";
import { AdminBranchSwitcher } from "@/features/auth/admin-branch-drawer";
import { useProductCatalog } from './use-product-catalog';
import { useProductStore } from "./product-store";
import { ProductCard } from "./product-card";
import { ProductFilterDrawer } from "./product-filter-drawer";
import { CategorySettingsDrawer } from "./category-settings-drawer";
import { useCanManageCategories, useProductCategories } from "./use-product-categories";
import {
  defaultProductFilters,
  matchesProductFilters,
} from "./product-filters";

export function ProductsPage() {
  const branchId = useAuthStore((state) => getAdminBranch(state.session)?.id);
  const catalog = useProductCatalog(branchId);
  const store = useAuthStore((state) => state.session?.account.store);
  const items = catalog.data ?? [];
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
  const products = items.filter(
    (product) =>
      matchesProductFilters(product, { ...filters, store: branchId ?? filters.store }) &&
      (category === null || product.category === category) &&
      product.title
        .toLocaleLowerCase("id-ID")
        .includes(search.trim().toLocaleLowerCase("id-ID")),
  );

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
          {canManageCategories && (
            <CategorySettingsDrawer categories={categories} />
          )}
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
    </>
  );
}
