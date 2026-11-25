import { useId, useState, type ReactNode } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { isAxiosError } from "axios";
import { parseISO } from "date-fns";
import { Store } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { cn } from "cn";
import { DatePickerRange } from "@/components/date-picker-range";
import { PageLayout } from "@/components/page-layout";
import { SelectCombobox } from "@/components/select-combobox";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { isAdminAccount, useAuthStore, type Account } from "@/features/auth/auth-store";
import { formatCurrency, formatNominal } from "@/lib/currency";
import { formatDateRange } from "@/lib/date";
import { DashboardChart } from "./dashboard-chart";
import { BestSales, TrendingProducts } from "./dashboard-sales";
import { useDashboardQuery, type DashboardData, type DashboardReportAction } from "./dashboard-api";
import { dashboardFilterScope, dashboardPeriodFilter, readDashboardFilter, saveDashboardFilter } from "./dashboard-filters";

const periods = [
  { value: "today", label: "Hari ini" },
  { value: "week", label: "Minggu ini" },
  { value: "month", label: "Bulan ini" },
  { value: "year", label: "Tahun ini" },
  { value: "range", label: "Rentang tanggal" },
] as const;

const summaryDate = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Asia/Jakarta",
});

function DashboardSection<T>({ title, query, children, className, skeleton, filterControl }: {
  title: string;
  query: UseQueryResult<T | null>;
  children: (data: T) => ReactNode;
  className?: string;
  skeleton?: ReactNode;
  filterControl?: ReactNode;
}) {
  const { data, isPending } = query;
  const validationMessage = isAxiosError<{ msg?: unknown }>(query.error) && query.error.response?.status === 400
    ? query.error.response.data?.msg
    : undefined;
  const errorMessage = typeof validationMessage === "string" && validationMessage ? validationMessage : "Gagal memuat data.";
  return (
    <section aria-label={title} className={cn("bento-surface space-y-4 p-4 sm:p-5", className)}>
      <h2 className="text-sm font-semibold">{title}</h2>
      {filterControl}
      {data != null && children(data)}
      {data === null && <p className="text-sm text-muted-foreground">Belum ada data.</p>}
      {data === undefined && isPending && query.isEnabled && (
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
          <p role="alert" className="text-sm text-destructive">{errorMessage}</p>
          <Button type="button" variant="outline" size="sm" loading={query.isFetching} onClick={() => void query.refetch()}>
            Coba lagi
          </Button>
        </div>
      )}
    </section>
  );
}

type ReportPeriod = (typeof periods)[number]["value"];

function DashboardReport<A extends DashboardReportAction>({ account, action, title, children, ...section }: {
  account: Account;
  action: A;
  title: string;
  children: (data: DashboardData<A>) => ReactNode;
  className?: string;
  skeleton?: ReactNode;
}) {
  const periodId = useId();
  const [{ period, dateRange }, setSelection] = useState(() => readDashboardFilter(account, action));
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeError, setRangeError] = useState(false);
  const filter = dashboardPeriodFilter(period, dateRange);
  const query = useDashboardQuery(action, account, filter);
  const rangeLabel = period === "range" && dateRange ? formatDateRange(dateRange) : undefined;

  function selectPeriod(nextPeriod: ReportPeriod, nextRange: DateRange | undefined) {
    const nextFilter = dashboardPeriodFilter(nextPeriod, nextRange);
    setRangeError(!nextFilter);
    if (!nextFilter) return;
    setSelection({ period: nextPeriod, dateRange: nextRange });
    saveDashboardFilter(account, action, nextFilter);
  }

  return (
    <DashboardSection title={title} query={query} {...section} filterControl={
      <div className="flex flex-wrap items-center gap-2">
        <SelectCombobox id={periodId} aria-label={rangeLabel ? `Periode ${title}, ${rangeLabel}` : `Periode ${title}`}
          value={period} options={periods} searchable={false} triggerLabel={rangeLabel}
          className={cn("max-w-full", rangeLabel ? "w-64" : "w-40")} onChange={(value) => {
            const selected = periods.find((option) => option.value === value);
            if (selected?.value === "range") {
              setRangeError(false);
              setRangeOpen(true);
            } else if (selected) {
              selectPeriod(selected.value, undefined);
            }
          }} />
        <DatePickerRange id={periodId} type="modal" value={dateRange}
          dialog={{ open: rangeOpen, onOpenChange: setRangeOpen }}
          onChange={(range) => selectPeriod(range ? "range" : "today", range)} />
        {rangeError && (
          <p role="alert" className="w-full text-sm text-destructive">Rentang tanggal maksimal 10 tahun</p>
        )}
      </div>
    }>
      {children}
    </DashboardSection>
  );
}

function AdminDashboard({ account }: { account: Account }) {
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <DashboardReport title="Pendapatan" action="total_earning" account={account} className="min-h-40" skeleton={
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
                  <dt className="text-xs text-muted-foreground">
                    {data.period === "today" ? "Hari ini" : "Total periode terpilih"}
                  </dt>
                  <dd className="mt-1 text-3xl font-semibold tracking-tight tabular-nums sm:text-4xl">
                    {formatCurrency(data.current_earning)}
                  </dd>
                  <dd className="mt-1 text-xs text-muted-foreground">
                    {formatDateRange({ from: parseISO(data.start_date), to: parseISO(data.end_date) })}
                  </dd>
                </div>
                <div className="grid grid-cols-2 gap-3 rounded-xl bg-muted/60 px-3 py-2.5">
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      {data.period === "today" ? "Kemarin" : "Periode pembanding"}
                    </dt>
                    <dd className="mt-1 text-sm font-medium tabular-nums">{formatCurrency(data.previous_earning)}</dd>
                    <dd className="mt-1 text-xs text-muted-foreground">
                      {formatDateRange({ from: parseISO(data.previous_start_date), to: parseISO(data.previous_end_date) })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Perubahan pendapatan</dt>
                    <dd className="mt-1 text-sm font-medium tabular-nums">{data.grow}</dd>
                  </div>
                </div>
              </dl>
              <DashboardChart chart={data} variant="line" description="Grafik garis pendapatan dalam rupiah" />
            </>
          )}
        </DashboardReport>
        <DashboardReport title="Profit" action="profit_statistic" account={account} className="flex min-h-32 flex-col"
          skeleton={<Skeleton className="h-48 w-full sm:h-56" />}>
          {(data) => <DashboardChart chart={data} description="Grafik batang profit dalam rupiah" stretch />}
        </DashboardReport>
      </div>
      <DailyShiftSummary account={account} />
      <div className="grid items-start gap-4 md:grid-cols-2">
        <DashboardReport title="Produk terlaris" action="trending_product" account={account}>
          {(data) => <TrendingProducts trending={data} />}
        </DashboardReport>
        <DashboardReport title="Kasir dengan penjualan tertinggi" action="best_sales" account={account}>
          {(data) => <BestSales sales={data} />}
        </DashboardReport>
      </div>
    </div>
  );
}

function DailyShiftSummary({ account }: { account: Account }) {
  const query = useDashboardQuery("session_summary", account);
  if (query.data && (!query.data.use_session || query.data.mode !== "shift")) return null;

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
        <AdminDashboard key={dashboardFilterScope(account)} account={account} />
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
