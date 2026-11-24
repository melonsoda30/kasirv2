import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Store } from "lucide-react";
import { cn } from "cn";
import { PageLayout } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { isAdminAccount, useAuthStore, type Account } from "@/features/auth/auth-store";
import { formatCurrency, formatNominal } from "@/lib/currency";
import { DashboardBarChart } from "./dashboard-bar-chart";
import { BestSales, TrendingProducts } from "./dashboard-sales";
import { useDashboardQuery } from "./dashboard-api";

const summaryDate = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

function DashboardSection<T>({ title, query, children, className, skeleton }: {
  title: string;
  query: UseQueryResult<T | null>;
  children: (data: T) => ReactNode;
  className?: string;
  skeleton?: ReactNode;
}) {
  const { data, isPending } = query;
  return (
    <section aria-label={title} className={cn("bento-surface space-y-4 p-4 sm:p-5", className)}>
      <h2 className="text-sm font-semibold">{title}</h2>
      {data != null && children(data)}
      {data === null && <p className="text-sm text-muted-foreground">Belum ada data.</p>}
      {data === undefined && isPending && (
        <SkeletonGroup label={`Memuat ${title}`} className="space-y-3">
          {skeleton ?? (
            <>
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-5 w-1/2" />
              <Skeleton className="h-5 w-3/5" />
            </>
          )}
        </SkeletonGroup>
      )}
      {data === undefined && query.isError && (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">Gagal memuat data.</p>
          <Button type="button" variant="outline" size="sm" loading={query.isFetching} onClick={() => void query.refetch()}>
            Coba lagi
          </Button>
        </div>
      )}
    </section>
  );
}

function AdminDashboard({ account }: { account: Account }) {
  const earnings = useDashboardQuery("total_earning", account);
  const profit = useDashboardQuery("profit_statistic", account);
  const sales = useDashboardQuery("best_sales", account);
  const trending = useDashboardQuery("trending_product", account);

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <DashboardSection title="Pendapatan" query={earnings} className="min-h-40" skeleton={
          <>
            <Skeleton className="h-9 w-1/2" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-48 w-full sm:h-56" />
          </>
        }>
          {(data) => (
            <>
              <dl className="space-y-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Hari ini</dt>
                  <dd className="mt-1 text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">{formatCurrency(data.today_earning)}</dd>
                </div>
                <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/60 px-3 py-2.5">
                  <div>
                    <dt className="text-xs text-muted-foreground">Kemarin</dt>
                    <dd className="mt-1 text-sm font-medium tabular-nums">{formatCurrency(data.yesterday_earning)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Perubahan dari kemarin</dt>
                    <dd className="mt-1 text-sm font-medium tabular-nums">{data.grow}</dd>
                  </div>
                </div>
              </dl>
              <DashboardBarChart chart={data} description="Grafik batang pendapatan harian dalam rupiah" />
            </>
          )}
        </DashboardSection>
        <DashboardSection title="Profit harian" query={profit} className="flex min-h-32 flex-col"
          skeleton={<Skeleton className="h-48 w-full sm:h-56" />}>
          {(data) => (
            <DashboardBarChart chart={data} description="Grafik batang profit harian dalam rupiah" stretch />
          )}
        </DashboardSection>
      </div>
      <DailyShiftSummary account={account} />
      <div className="grid items-start gap-4 md:grid-cols-2">
        <DashboardSection title="Produk terlaris per hari" query={trending}>
          {(data) => <TrendingProducts trending={data} />}
        </DashboardSection>
        <DashboardSection title="Kasir dengan penjualan tertinggi" query={sales}>
          {(data) => <BestSales sales={data} />}
        </DashboardSection>
      </div>
    </div>
  );
}

function DailyShiftSummary({ account }: { account: Account }) {
  const query = useDashboardQuery("session_summary", account);
  if (query.data?.use_session === false) return null;

  return (
    <DashboardSection title="Ringkasan tutup buku" query={query}>
      {(summary) => {
        if (!summary.use_session) return null;
        const date = new Date(`${summary.date}T00:00:00+07:00`);
        const rows = [
          ["Jumlah shift", formatNominal(summary.count)],
          ["Shift aktif", formatNominal(summary.open_count)],
          ["Total omzet", formatCurrency(summary.total_omzet)],
          ["Uang tunai masuk", formatCurrency(summary.total_cash_in)],
          ["Total selisih", formatCurrency(summary.total_difference), summary.total_difference < 0],
          ["Shift dengan selisih di luar batas", formatNominal(summary.exceeded_count)],
        ] as const;

        return (
          <>
            <p className="text-sm text-muted-foreground">
              {Number.isNaN(date.getTime()) ? summary.date : summaryDate.format(date)}
            </p>
            <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
              {rows.map(([label, value, isNegative]) => (
                <div key={label} className="flex min-w-0 flex-col justify-between gap-2 rounded-xl bg-muted/60 p-3">
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className={cn("font-medium tabular-nums", isNegative && "text-destructive")}>
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <p className="border-t pt-3 text-xs text-muted-foreground">
              Batas selisih per shift {formatCurrency(summary.cash_tolerance)}
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to="/sesi-kas">Riwayat shift</Link>
            </Button>
          </>
        );
      }}
    </DashboardSection>
  );
}

export function DashboardPage() {
  const account = useAuthStore((state) => state.session?.account);
  return (
    <PageLayout title="Home" wide>
      {account && (isAdminAccount(account) ? (
        <AdminDashboard account={account} />
      ) : (
        <section aria-label="Kasir" className="bento-surface flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">{account.store?.name || account.event_location || "Kasir"}</h2>
            {account.account_fullname && <p className="text-sm text-muted-foreground">{account.account_fullname}</p>}
          </div>
          <Button asChild><Link to="/order"><Store aria-hidden="true" /> Buka Kasir</Link></Button>
        </section>
      ))}
    </PageLayout>
  );
}
