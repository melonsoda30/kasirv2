import type { ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Store } from "lucide-react";
import { PageLayout } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { isAdminAccount, useAuthStore, type Account } from "@/features/auth/auth-store";
import { formatCurrency } from "@/lib/currency";
import { DashboardLineChart } from "./dashboard-line-chart";
import { BestSales, TrendingProducts } from "./dashboard-sales";
import { useDashboardQuery } from "./dashboard-api";

function DashboardSection<T>({ title, query, children }: {
  title: string;
  query: UseQueryResult<T>;
  children: (data: T) => ReactNode;
}) {
  const { data, isPending } = query;
  return (
    <section aria-label={title} className="space-y-4 rounded-xl border bg-background p-4">
      <h2 className="text-sm font-semibold">{title}</h2>
      {data !== undefined && children(data)}
      {data === undefined && isPending && (
        <p role="status" className="text-sm text-muted-foreground">Memuat data...</p>
      )}
      {data === undefined && !isPending && (
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
    <div className="space-y-4">
      <DashboardSection title="Pendapatan" query={earnings}>
        {(data) => (
          <>
            <dl className="space-y-3">
              <div>
                <dt className="text-xs text-muted-foreground">Hari ini</dt>
                <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{formatCurrency(data.today_earning)}</dd>
              </div>
              <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/50 px-3 py-2.5">
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
            <DashboardLineChart chart={data} description="Grafik garis pendapatan harian dalam rupiah" />
          </>
        )}
      </DashboardSection>
      <DashboardSection title="Profit harian" query={profit}>
        {(data) => <DashboardLineChart chart={data} description="Grafik garis profit harian dalam rupiah" />}
      </DashboardSection>
      <DashboardSection title="Produk terlaris per hari" query={trending}>
        {(data) => <TrendingProducts trending={data} />}
      </DashboardSection>
      <DashboardSection title="Kasir dengan penjualan tertinggi" query={sales}>
        {(data) => <BestSales sales={data} />}
      </DashboardSection>
    </div>
  );
}

export function DashboardPage() {
  const account = useAuthStore((state) => state.session?.account);
  return (
    <PageLayout title="Home">
      {account && (isAdminAccount(account) ? (
        <AdminDashboard account={account} />
      ) : (
        <section aria-label="Kasir" className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-background p-4">
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
