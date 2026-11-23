import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Package } from "lucide-react";
import { PageLayout } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/features/auth/auth-store";
import { fetchProductStock } from "./stock-api";
import { StockDrawer } from "./stock-drawer";
import { useProductCatalog } from "./use-product-catalog";

function StockImage({ src }: { src: string }) {
  const [failedSource, setFailedSource] = useState("");
  return (
    <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
      {src && failedSource !== src ? (
        <img
          src={src}
          alt=""
          loading="lazy"
          className="size-full object-cover"
          onError={() => setFailedSource(src)}
        />
      ) : (
        <Package className="size-6 text-muted-foreground" aria-hidden="true" />
      )}
    </span>
  );
}

export function StockPage() {
  const accountId = useAuthStore((state) => state.session?.account.account_id);
  const stock = useQuery({
    queryKey: ["products", "stock", accountId],
    queryFn: ({ signal }) => fetchProductStock(signal),
    meta: { toast: false },
  });
  const catalog = useProductCatalog();
  const imagesBySku = new Map(
    catalog.data
      ?.filter((product) => product.photo)
      .map((product) => [product.id, product.photo]),
  );

  return (
    <PageLayout title="Stok" wide>
      {stock.isPending && <p role="status">Memuat stok produk...</p>}
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
      {!!stock.data?.length && (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stock.data.map((item) => (
            <li
              key={JSON.stringify([
                item.store_id,
                item.branch_id,
                item.product_sku,
              ])}
            >
              <StockDrawer item={item}>
                <StockImage src={imagesBySku.get(item.product_sku) ?? ""} />
                <span className="min-w-0">
                  <span className="block font-medium break-words">
                    {item.product_name}
                  </span>
                  <span className="block text-sm text-muted-foreground">
                    Stok: {item.quantity}
                  </span>
                </span>
              </StockDrawer>
            </li>
          ))}
        </ul>
      )}
    </PageLayout>
  );
}
