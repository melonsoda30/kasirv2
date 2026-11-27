import { useId, useState, type ReactNode } from "react";
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
import { StatusBadge } from "@/components/ui/status-badge";
import {
  getAccountBranches,
  getAdminBranch,
  isAdminAccount,
  useAuthStore,
  type Account,
} from "@/features/auth/auth-store";
import { formatCurrency, formatNominal } from "@/lib/currency";
import { formatDateRange } from "@/lib/date";
import { DashboardChart } from "./dashboard-chart";
import {
  BestSales,
  BranchRevenue,
  CategoryMix,
  PaymentMix,
  TrendingProducts,
} from "./dashboard-sales";
import {
  useDashboardQuery,
  type DashboardSummaryData,
  type SessionSummaryData,
} from "./dashboard-api";
import {
  dashboardFilterScope,
  dashboardPeriodFilter,
  readDashboardFilter,
  saveDashboardFilter,
} from "./dashboard-filters";

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

const kpiMetrics = [
  { key: "revenue", label: "Pendapatan", format: formatCurrency },
  { key: "trx_count", label: "Transaksi", format: formatNominal },
  { key: "items_sold", label: "Item terjual", format: formatNominal },
  { key: "aov", label: "Rata-rata per transaksi", format: formatCurrency },
] as const;

const panelGrid =
  "grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(min(100%,21rem),1fr))]";

function dateRangeLabel(start: string, end: string) {
  return formatDateRange({ from: parseISO(start), to: parseISO(end) });
}

function DashboardSection({
  title,
  detail,
  children,
}: {
  title: string;
  detail?: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={title} className="bento-surface space-y-3 p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-sm font-semibold">{title}</h2>
        {detail && (
          <p className="text-xs text-muted-foreground tabular-nums">{detail}</p>
        )}
      </div>
      {children}
    </section>
  );
}

type ReportPeriod = (typeof periods)[number]["value"];

const kpiComparisonLabels: Record<ReportPeriod, string | null> = {
  today: "vs kemarin",
  week: "vs minggu kemarin",
  month: "vs bulan kemarin",
  year: "vs tahun kemarin",
  range: null,
};

function AdminDashboard({
  account,
  branchId,
}: {
  account: Account;
  branchId?: string;
}) {
  const periodId = useId();
  const [{ period, dateRange }, setSelection] = useState(() =>
    readDashboardFilter(account, "summary"),
  );
  const [rangeOpen, setRangeOpen] = useState(false);
  const [rangeError, setRangeError] = useState(false);
  const filter = dashboardPeriodFilter(period, dateRange);
  const query = useDashboardQuery("summary", account, filter, branchId);
  const report = query.data;
  const comparisonLabel = kpiComparisonLabels[period];
  const productBranchNames =
    branchId === "all"
      ? new Map(
          getAccountBranches(account.store).map(({ id, name }) => [id, name]),
        )
      : undefined;
  const rangeLabel =
    period === "range" && dateRange ? formatDateRange(dateRange) : undefined;
  const validationMessage =
    isAxiosError<{ msg?: unknown }>(query.error) &&
    query.error.response?.status === 400
      ? query.error.response.data?.msg
      : undefined;
  const errorMessage =
    typeof validationMessage === "string" && validationMessage
      ? validationMessage
      : "Gagal memuat dashboard.";

  function selectPeriod(
    nextPeriod: ReportPeriod,
    nextRange: DateRange | undefined,
  ) {
    const nextFilter = dashboardPeriodFilter(nextPeriod, nextRange);
    setRangeError(!nextFilter);
    if (!nextFilter) return;
    setSelection({ period: nextPeriod, dateRange: nextRange });
    saveDashboardFilter(account, "summary", nextFilter);
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">Ringkasan penjualan</h2>
          {report && (
            <p className="text-xs text-muted-foreground tabular-nums">
              {dateRangeLabel(report.period.start_date, report.period.end_date)}
            </p>
          )}
        </div>
        <SelectCombobox
          id={periodId}
          aria-label={
            rangeLabel
              ? `Periode dashboard, ${rangeLabel}`
              : "Periode dashboard"
          }
          value={period}
          options={periods}
          searchable={false}
          triggerLabel={rangeLabel}
          className={cn("max-w-full", rangeLabel ? "w-64" : "w-40")}
          onChange={(value) => {
            const selected = periods.find((option) => option.value === value);
            if (selected?.value === "range") {
              setRangeError(false);
              setRangeOpen(true);
            } else if (selected) {
              selectPeriod(selected.value, undefined);
            }
          }}
        />
        <DatePickerRange
          id={periodId}
          type="modal"
          value={dateRange}
          dialog={{ open: rangeOpen, onOpenChange: setRangeOpen }}
          onChange={(range) => selectPeriod(range ? "range" : "today", range)}
        />
        {rangeError && (
          <p role="alert" className="w-full text-sm text-destructive">
            Rentang tanggal maksimal 10 tahun
          </p>
        )}
      </div>
      {query.isPending && query.isEnabled && (
        <SkeletonGroup label="Memuat dashboard" className="grid gap-4">
          {comparisonLabel && (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {kpiMetrics.map(({ key }) => (
                <div key={key} className="bento-surface space-y-3 p-4">
                  <Skeleton className="h-4 w-2/3" />
                  <Skeleton className="h-7 w-full" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              ))}
            </div>
          )}
          <Skeleton className="h-60 w-full rounded-2xl" />
        </SkeletonGroup>
      )}
      {!report && query.isError && (
        <div className="bento-surface space-y-3 p-4 text-sm">
          <p role="alert" className="text-destructive">
            {errorMessage}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={query.isFetching}
            onClick={() => void query.refetch()}
          >
            Coba lagi
          </Button>
        </div>
      )}
      {report === null && (
        <p className="text-sm text-muted-foreground">
          Belum ada data untuk periode ini.
        </p>
      )}
      {report && (
        <DashboardPanels
          report={report}
          comparisonLabel={comparisonLabel}
          productBranchNames={productBranchNames}
        />
      )}
    </div>
  );
}

function DashboardKpis({
  metrics,
  comparisonLabel,
  comparisonDates,
}: {
  metrics: NonNullable<DashboardSummaryData["kpi"]>;
  comparisonLabel: string;
  comparisonDates: string;
}) {
  return (
    <dl
      aria-label="Metrik penjualan"
      className="grid grid-cols-2 gap-3 md:grid-cols-4"
    >
      {kpiMetrics.map(({ key, label, format }) => {
        const { value, previous, grow } = metrics[key];
        const change = Number.parseFloat(grow.trim().replace(",", "."));
        return (
          <div key={key} className="bento-surface space-y-2 p-3 sm:p-4">
            <dt className="text-xs font-medium text-muted-foreground sm:text-sm">
              {label}
            </dt>
            <dd className="wrap-anywhere text-xl font-semibold tracking-tight tabular-nums sm:text-2xl">
              {format(value)}
            </dd>
            <dd
              title={`${comparisonDates} · ${format(previous)}`}
              className="text-xs text-muted-foreground"
            >
              <span
                className={cn(
                  "font-medium tabular-nums",
                  change > 0 && "text-success-foreground",
                  change < 0 && "text-destructive",
                )}
              >
                {grow}
              </span>{" "}
              {comparisonLabel}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function DashboardPanels({
  report,
  comparisonLabel,
  productBranchNames,
}: {
  report: DashboardSummaryData;
  comparisonLabel: string | null;
  productBranchNames?: ReadonlyMap<string, string>;
}) {
  const {
    kpi,
    period,
    revenue,
    top_product,
    top_kasir,
    top_branch,
    payment_mix,
    peak_hour,
    category_mix,
    session_summary,
  } = report;
  const chartDates =
    revenue && dateRangeLabel(revenue.chart_start_date, revenue.chart_end_date);
  const shiftSummary =
    session_summary?.use_session && session_summary.mode === "shift"
      ? session_summary
      : undefined;

  return (
    <>
      {kpi && comparisonLabel && (
        <DashboardKpis
          metrics={kpi}
          comparisonLabel={comparisonLabel}
          comparisonDates={dateRangeLabel(
            period.previous_start_date,
            period.previous_end_date,
          )}
        />
      )}
      {revenue && (
        <DashboardSection title="Grafik pendapatan" detail={chartDates}>
          <DashboardChart
            chart={revenue}
            description={`Grafik pendapatan ${chartDates}`}
          />
        </DashboardSection>
      )}
      {(top_product || top_kasir) && (
        <div className={panelGrid}>
          {top_product && (
            <DashboardSection title="Produk terlaris">
              <TrendingProducts
                products={top_product.data}
                branchNames={productBranchNames}
              />
            </DashboardSection>
          )}
          {top_kasir && (
            <DashboardSection title="Kasir terbaik">
              <BestSales sales={top_kasir.data} />
            </DashboardSection>
          )}
        </div>
      )}
      {(top_branch || payment_mix) && (
        <div className={panelGrid}>
          {top_branch && (
            <DashboardSection title="Pendapatan per cabang">
              <BranchRevenue branches={top_branch.data} />
            </DashboardSection>
          )}
          {payment_mix && (
            <DashboardSection title="Metode bayar">
              <PaymentMix payments={payment_mix.data} />
            </DashboardSection>
          )}
        </div>
      )}
      {peak_hour && (
        <DashboardSection title="Jam sibuk" detail="Pendapatan per jam">
          <PeakHoursChart hours={peak_hour.data} />
        </DashboardSection>
      )}
      {(category_mix || shiftSummary) && (
        <div className={panelGrid}>
          {category_mix && (
            <DashboardSection title="Kategori">
              <CategoryMix categories={category_mix.data} />
            </DashboardSection>
          )}
          {shiftSummary && <DailyShiftSummary summary={shiftSummary} />}
        </div>
      )}
    </>
  );
}

function PeakHoursChart({
  hours,
}: {
  hours: NonNullable<DashboardSummaryData["peak_hour"]>["data"];
}) {
  const revenueByHour = new Map(
    hours.map(({ hour, revenue }) => [hour, revenue]),
  );
  const labels = Array.from(
    { length: 24 },
    (_, hour) => `${String(hour).padStart(2, "0")}:00`,
  );
  const data = labels.map((_, hour) => revenueByHour.get(hour) ?? 0);
  return (
    <DashboardChart
      compact
      chart={{ labels, datasets: [{ label: "Pendapatan", data }] }}
      description="Grafik pendapatan berdasarkan jam transaksi"
    />
  );
}

function DailyShiftSummary({
  summary,
}: {
  summary: Extract<SessionSummaryData, { date: string }>;
}) {
  const date = new Date(`${summary.date}T00:00:00+07:00`);
  const rows = [
    ["Total pendapatan sesi", formatCurrency(summary.total_omzet)],
    ["Uang tunai masuk", formatCurrency(summary.total_cash_in)],
    ["Toleransi selisih", formatCurrency(summary.cash_tolerance)],
    ["Shift di luar toleransi", formatNominal(summary.exceeded_count)],
  ] as const;

  return (
    <DashboardSection
      title="Tutup buku"
      detail={
        Number.isNaN(date.getTime()) ? summary.date : summaryDate.format(date)
      }
    >
      <div className="flex flex-wrap gap-2 tabular-nums">
        <StatusBadge tone="neutral">
          {formatNominal(summary.count)} shift
        </StatusBadge>
        <StatusBadge tone={summary.open_count > 0 ? "ready" : "neutral"}>
          {formatNominal(summary.open_count)} aktif
        </StatusBadge>
        <StatusBadge
          tone={summary.total_difference !== 0 ? "warning" : "neutral"}
        >
          Selisih {formatCurrency(summary.total_difference)}
        </StatusBadge>
      </div>
      <dl className="divide-y text-sm">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2"
          >
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="wrap-anywhere font-medium tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <Button asChild variant="outline" size="sm">
        <Link to="/sesi-kas">Riwayat shift</Link>
      </Button>
    </DashboardSection>
  );
}

export function DashboardPage() {
  const session = useAuthStore((state) => state.session);
  const branchId = getAdminBranch(session)?.id;
  const originalAccount = session?.account;
  const account =
    branchId && originalAccount?.store
      ? {
          ...originalAccount,
          store: { ...originalAccount.store, branch_id: branchId },
        }
      : originalAccount;
  return (
    <PageLayout title="Home" wide>
      {account &&
        (isAdminAccount(account) ? (
          <AdminDashboard
            key={dashboardFilterScope(account)}
            account={account}
            branchId={branchId}
          />
        ) : (
          <section
            aria-label="Kasir"
            className="bento-surface flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5"
          >
            <div className="space-y-1">
              <h2 className="text-sm font-semibold">
                {account.store?.name || account.event_location || "Kasir"}
              </h2>
              {account.account_fullname && (
                <p className="text-sm text-muted-foreground">
                  {account.account_fullname}
                </p>
              )}
            </div>
            <Button asChild>
              <Link to="/order">
                <Store aria-hidden="true" /> Buka Kasir
              </Link>
            </Button>
          </section>
        ))}
    </PageLayout>
  );
}
