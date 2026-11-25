import { Link } from "@tanstack/react-router";
import { Package, UserRound, type LucideIcon } from "lucide-react";
import { SkeletonImage } from "@/components/ui/skeleton-image";
import { API_BASE_URL } from "@/lib/api";
import { formatCurrency, formatNominal } from "@/lib/currency";
import type { BestSalesData, TrendingProductsData } from "./dashboard-api";

function imageUrl(path?: string | null) {
  const source = path?.trim();
  if (!source || source.startsWith("?") || source.startsWith("#")) return "";
  try {
    const url = new URL(source, `${API_BASE_URL.replace(/\/$/, "")}/`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function Thumbnail({ path, icon: Icon }: { path?: string | null; icon: LucideIcon }) {
  const src = imageUrl(path);
  return (
    <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
      <SkeletonImage src={src} alt="" loading="lazy" className="size-full"
        fallback={<Icon className="size-4 text-muted-foreground" aria-hidden="true" />}
      />
    </div>
  );
}

export function BestSales({ sales }: { sales: BestSalesData }) {
  if (!sales.length) return <p className="text-sm text-muted-foreground">Belum ada penjualan kasir.</p>;
  const ranked = [...sales].sort((first, second) => second.sales_earning - first.sales_earning).slice(0, 25);

  return (
    <ol className="divide-y">
      {ranked.map((sale, index) => (
        <li key={sale.sales_nip}>
          <Link
            to="/users/$userId"
            params={{ userId: sale.sales_nip }}
            className="flex min-h-14 items-center gap-3 rounded-lg py-2 text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{index + 1}</span>
            <Thumbnail path={sale.sales_foto} icon={UserRound} />
            <span className="min-w-0 flex-1 font-medium">{sale.sales_name}</span>
            <span className="max-w-[45%] text-right font-semibold tabular-nums">{formatCurrency(sale.sales_earning)}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export function TrendingProducts({ trending }: { trending: TrendingProductsData }) {
  const products = trending.data
    .map(({ product_name: name, product_img: photo, qty }, index) => ({ index, name, photo, qty }))
    .filter(({ qty }) => qty > 0)
    .sort((first, second) => second.qty - first.qty);

  if (!products.length) return <p className="text-sm text-muted-foreground">Belum ada produk terjual pada periode yang dipilih.</p>;

  return (
    <ol className="divide-y" aria-label="Peringkat produk terlaris">
      {products.map(({ index, name, photo, qty }, rank) => (
        <li key={index} className="flex min-h-14 items-center gap-3 py-2 text-sm">
          <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{rank + 1}</span>
          <Thumbnail path={photo} icon={Package} />
          <span className="min-w-0 flex-1 wrap-anywhere font-medium">{name}</span>
          <span className="shrink-0 text-right font-semibold tabular-nums">{formatNominal(qty)} unit</span>
        </li>
      ))}
    </ol>
  );
}
