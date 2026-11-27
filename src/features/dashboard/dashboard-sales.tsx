import { Link } from "@tanstack/react-router";
import { Package, UserRound, type LucideIcon } from "lucide-react";
import { cn } from "cn";
import { SkeletonImage } from "@/components/ui/skeleton-image";
import { API_BASE_URL } from "@/lib/api";
import { formatCurrency, formatNominal } from "@/lib/currency";
import type { DashboardSummaryData } from "./dashboard-api";

const percentage = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 });

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

export function BestSales({ sales }: { sales: NonNullable<DashboardSummaryData["top_kasir"]>["data"] }) {
  if (!sales.length) return <p className="text-sm text-muted-foreground">Belum ada penjualan kasir.</p>;

  return (
    <ol className="divide-y">
      {sales.map((sale, index) => (
        <li key={sale.user_id}>
          <Link
            to="/users/$userId"
            params={{ userId: sale.user_id }}
            className="flex min-h-14 items-center gap-3 rounded-lg py-2 text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{index + 1}</span>
            <Thumbnail path={sale.foto} icon={UserRound} />
            <span className="min-w-0 flex-1 wrap-anywhere font-medium">{sale.name}</span>
            <span className="max-w-[45%] wrap-anywhere text-right font-semibold tabular-nums">{formatCurrency(sale.revenue)}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export function TrendingProducts({ products, branchNames }: {
  products: NonNullable<DashboardSummaryData["top_product"]>["data"];
  branchNames?: ReadonlyMap<string, string>;
}) {
  if (!products.length) return <p className="text-sm text-muted-foreground">Belum ada produk terjual pada periode yang dipilih.</p>;

  return (
    <ol className="divide-y" aria-label="Peringkat produk terlaris">
      {products.map(({ product_id: id, product_name: name, product_img: photo, branch_id, branch_name, qty, revenue }, rank) => {
        const branchName = branchNames && (branch_name || branchNames.get(branch_id ?? ""));
        return (
          <li key={id || name} className="flex min-h-14 items-center gap-3 py-2 text-sm">
            <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{rank + 1}</span>
            <Thumbnail path={photo} icon={Package} />
            <span className="min-w-0 flex-1 space-y-0.5 wrap-anywhere">
              <span className="block font-medium">{name}</span>
              {branchName && <span className="block text-xs text-muted-foreground">{branchName}</span>}
            </span>
            <span className="max-w-[45%] space-y-0.5 text-right tabular-nums">
              <span className="block wrap-anywhere font-semibold">{formatCurrency(revenue)}</span>
              <span className="block text-xs text-muted-foreground">{formatNominal(qty)} unit</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function RevenueBar({ label, revenue, percent, detail, secondary }: {
  label: string;
  revenue: number;
  percent: number;
  detail: string;
  secondary?: boolean;
}) {
  return (
    <li className="space-y-1.5 py-2 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <span className="min-w-0 wrap-anywhere font-medium">{label}</span>
        <span className="wrap-anywhere font-semibold tabular-nums">{formatCurrency(revenue)}</span>
      </div>
      <div aria-hidden="true" className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div className={cn("h-full rounded-full", secondary ? "bg-chart-2" : "bg-chart-1")}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }} />
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">{detail}</p>
    </li>
  );
}

export function BranchRevenue({ branches }: { branches: NonNullable<DashboardSummaryData["top_branch"]>["data"] }) {
  if (!branches.length) return <p className="text-sm text-muted-foreground">Belum ada pendapatan cabang.</p>;
  return (
    <ol className="divide-y">
      {branches.map(({ branch_id, branch_name, revenue, share }) => (
        <RevenueBar key={branch_id} label={branch_name || branch_id} revenue={revenue}
          percent={share} detail={`${percentage.format(share)}% dari pendapatan`} />
      ))}
    </ol>
  );
}

export function PaymentMix({ payments }: { payments: NonNullable<DashboardSummaryData["payment_mix"]>["data"] }) {
  if (!payments.length) return <p className="text-sm text-muted-foreground">Belum ada data pembayaran.</p>;
  const maximum = Math.max(1, ...payments.map(({ revenue }) => revenue));
  return (
    <ol className="divide-y">
      {payments.map(({ method, trx_count, revenue, fee_total }) => (
        <RevenueBar key={method} label={method.toLowerCase() === "cash" ? "Tunai" : method.replaceAll("_", " ").toUpperCase()}
          revenue={revenue} percent={revenue / maximum * 100} secondary
          detail={[`${formatNominal(trx_count)} transaksi`, fee_total ? `Biaya ${formatCurrency(fee_total)}` : ""].filter(Boolean).join(" · ")} />
      ))}
    </ol>
  );
}

export function CategoryMix({ categories }: { categories: NonNullable<DashboardSummaryData["category_mix"]>["data"] }) {
  if (!categories.length) return <p className="text-sm text-muted-foreground">Belum ada penjualan per kategori.</p>;
  return (
    <dl className="divide-y text-sm">
      {categories.map(({ category, qty, revenue }) => (
        <div key={category} className="flex min-w-0 items-center justify-between gap-3 py-2.5">
          <dt className="min-w-0 wrap-anywhere font-medium capitalize">{category}</dt>
          <dd className="max-w-[55%] space-y-0.5 text-right tabular-nums">
            <span className="block wrap-anywhere font-semibold">{formatCurrency(revenue)}</span>
            <span className="block text-xs text-muted-foreground">{formatNominal(qty)} unit</span>
          </dd>
        </div>
      ))}
    </dl>
  );
}
