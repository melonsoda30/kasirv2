import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { PageLayout } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SkeletonGroup, SkeletonRows } from "@/components/ui/skeleton";
import { SkeletonImage } from "@/components/ui/skeleton-image";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAccountBranches, getAdminBranch, useAuthStore } from "@/features/auth/auth-store";
import { fetchProductStock } from "./stock-api";
import { StockDrawer } from "./stock-drawer";
import { isLowStockQuantity } from "./product-stock";
import { useProductCatalog } from "./use-product-catalog";

function StockImage({ src }: { src: string }) {
  return (
    <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
      <SkeletonImage src={src} alt="" loading="lazy" className="size-full"
        fallback={<Package className="size-6 text-muted-foreground" aria-hidden="true" />}
      />
    </span>
  );
}

function StockQuantity({ quantity }: { quantity: number }) {
  if (quantity <= 0) return <StatusBadge tone="danger">Habis · Stok: {quantity}</StatusBadge>;
  if (isLowStockQuantity(quantity)) return <StatusBadge tone="warning">Hampir habis · Stok: {quantity}</StatusBadge>;
  return <span className="block text-sm text-muted-foreground">Stok: {quantity}</span>;
}

export function StockPage() {
  const [search, setSearch] = useState("");
  const accountId = useAuthStore((state) => state.session?.account.account_id);
  const branchId = useAuthStore((state) => getAdminBranch(state.session)?.id);
  const store = useAuthStore((state) => state.session?.account.store);
  const stock = useQuery({
    queryKey: ["products", "stock", accountId, branchId],
    queryFn: ({ signal }) => fetchProductStock(signal, branchId),
    meta: { toast: false },
  });
  const catalog = useProductCatalog(branchId);
  const productsBySku = new Map(catalog.data?.map((product) => [product.id, product]));
  const branchNames = new Map(getAccountBranches(store).map(({ id, name }) => [id, name]));
  const keyword = search.trim().toLocaleLowerCase("id-ID");
  const visibleStock = (stock.data ?? []).filter(({ product_name, product_sku }) =>
    product_name.toLocaleLowerCase("id-ID").includes(keyword) ||
    product_sku.toLocaleLowerCase("id-ID").includes(keyword),
  );

  return (
    <PageLayout
      title="Stok"
      wide
      headerToolbar={
        <Input
          type="search"
          aria-label="Cari produk berdasarkan nama atau SKU"
          placeholder="Cari nama produk atau SKU..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      }
    >
      {stock.isPending && (
        <SkeletonGroup label="Memuat stok produk">
          <SkeletonRows rows={6} media="thumbnail" className="gap-3 sm:grid-cols-2 lg:grid-cols-3" />
        </SkeletonGroup>
      )}
      {stock.isError && (
        <div className="space-y-2">
          <p role="alert">Gagal memuat stok produk.</p>
          <Button
            type="button"
            variant="outline"
            loading={stock.isFetching}
            onClick={() => void stock.refetch()}
          >
            Coba lagi
          </Button>
        </div>
      )}
      {stock.isSuccess && stock.data.length === 0 && (
        <p>Belum ada data stok produk.</p>
      )}
      {stock.isSuccess && stock.data.length > 0 && visibleStock.length === 0 && (
        <p role="status" className="py-12 text-center text-sm text-muted-foreground">Produk tidak ditemukan.</p>
      )}
      {visibleStock.length > 0 && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleStock.map((item) => {
            const product = productsBySku.get(item.product_sku);
            const branchName = branchId === "all"
              ? item.branch_name?.trim() || product?.branchName || branchNames.get(item.branch_id) || item.branch_id
              : undefined;
            return (
              <li
                key={JSON.stringify([
                  item.store_id,
                  item.branch_id,
                  item.product_sku,
                ])}
              >
                <StockDrawer item={item} branchName={branchName}>
                  <StockImage src={product?.photo ?? ""} />
                  <span className="min-w-0">
                    <span className="block font-medium break-words">
                      {item.product_name}
                    </span>
                    {branchName && <span className="block wrap-anywhere text-xs text-muted-foreground">{branchName}</span>}
                    <StockQuantity quantity={item.quantity} />
                  </span>
                </StockDrawer>
              </li>
            );
          })}
        </ul>
      )}
    </PageLayout>
  );
}
