import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Plus, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getAccountBranches, useAuthStore } from "@/features/auth/auth-store";
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
  const catalog = useProductCatalog();
  const store = useAuthStore((state) => state.session?.account.store);
  const items = useProductStore((state) => state.products);
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
  const statusLabel = filters.status === "active" ? "Aktif" : "Nonaktif";
  const filterChips = [
    ...(filters.store !== "all"
      ? [{
          key: "store" as const,
          label: availableStores.find(({ id }) => id === filters.store)?.name ?? filters.store,
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
      matchesProductFilters(product, filters) &&
      (category === null || product.category === category) &&
      product.title
        .toLocaleLowerCase("id-ID")
        .includes(search.trim().toLocaleLowerCase("id-ID")),
  );

  return (
    <>
      <header className="products-toolbar sticky top-0 z-20 w-full border-b bg-background pt-[calc(env(safe-area-inset-top)+12px)]">
        <div className="page-gutter flex h-9 gap-2">
          <div className="min-w-0 flex-1">
            <Input
              type="search"
              aria-label="Cari produk"
              placeholder="Cari produk..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <ProductFilterDrawer
            filters={filters}
            stores={availableStores}
            onSave={setFilters}
          />
          <Button asChild size="icon">
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
          {canManageCategories && (
            <CategorySettingsDrawer categories={categories} />
          )}
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
        {catalog.isPending && (
          <div role="status" aria-label="Memuat produk" aria-busy="true">
            <span className="sr-only">Memuat produk...</span>
            <ul aria-hidden="true" className="bento-catalog">
              {Array.from({ length: 6 }, (_, index) => (
                <li key={index} className="bento-surface overflow-hidden motion-safe:animate-pulse">
                  <div className="aspect-square bg-muted" />
                  <div className="space-y-2 p-3">
                    <div className="h-4 w-4/5 rounded bg-muted" />
                    <div className="h-4 w-1/2 rounded bg-muted" />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
        {!catalog.isPending && catalog.isError && (
          <div role="alert" className="space-y-3 py-16 text-center">
            <p className="text-sm">Gagal memuat produk. Silakan coba lagi.</p>
            <Button type="button" variant="outline" onClick={() => void catalog.refetch()} loading={catalog.isFetching}>Coba lagi</Button>
          </div>
        )}
        {catalog.isSuccess && products.length > 0 && (
          <ul className="bento-catalog">
            {products.map((product) => (
              <li key={product.id} className="bento-surface">
                <ProductCard product={product} onUpdate={updateProduct} />
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
