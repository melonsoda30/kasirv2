import { useId, useRef, useState } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { cn } from "cn";
import {
  Banknote,
  ChevronDown,
  Package,
  ReceiptText,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { formatCurrency, formatNominal } from "@/lib/currency";
import { salesBreakdownStatuses, summarizeSales } from "./sales-summary";
import type { Sale, SalesStatusBreakdown, SalesSummary } from "./sales-summary";

const statusLabels: Record<
  keyof SalesStatusBreakdown,
  { label: string; tone: StatusTone }
> = {
  completed: { label: "Lunas", tone: "success" },
  pending: { label: "Menunggu pembayaran", tone: "warning" },
  cancelled: { label: "Dibatalkan", tone: "danger" },
  refund_partial: { label: "Refund parsial", tone: "warning" },
  refund_full: { label: "Refund penuh", tone: "danger" },
};

type SummaryMetric = {
  label: string;
  value: string;
  icon?: LucideIcon;
  tone?: StatusTone;
  count?: number;
};

export function SalesSummaryCards({
  sales,
  summary: apiSummary,
}: {
  sales: readonly Sale[];
  summary?: SalesSummary;
}) {
  const metricsId = useId();
  const metricsRef = useRef<HTMLDivElement>(null);
  const [visibleStart, setVisibleStart] = useState(0);
  const summary = apiSummary ?? summarizeSales(sales);
  const methods = Object.entries(summary.paymentTotals);
  const metrics: SummaryMetric[] = [
    {
      label: "Total transaksi",
      icon: ReceiptText,
      value: formatNominal(summary.transactions),
    },
    {
      label: "Produk terjual",
      icon: Package,
      value: formatNominal(summary.productsSold),
    },
  ];
  for (const status of salesBreakdownStatuses) {
    const entry = summary.statusBreakdown?.[status];
    if (!entry) continue;
    metrics.push({
      ...statusLabels[status],
      value: formatCurrency(entry.total),
      count: entry.count,
    });
  }
  const lastStart = metrics.length - 2;
  const canSlide = lastStart > 0;
  const activeStart = Math.min(visibleStart, lastStart);

  function scrollToMetrics(index: number) {
    const scroller = metricsRef.current;
    if (!scroller || !canSlide) return;
    scroller.scrollTo({
      left: ((scroller.scrollWidth - scroller.clientWidth) * index) / lastStart,
    });
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:has-[[data-open]]:items-start">
      <Collapsible.Root
        render={<section />}
        aria-labelledby="sales-summary-title"
        className={cn(
          "bento-surface flex flex-col justify-between gap-3 p-4 sm:p-5",
          canSlide && "lg:mb-9 lg:data-open:mb-0",
        )}
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Banknote
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <h2 id="sales-summary-title" className="text-sm font-medium">
              Total penjualan
            </h2>
          </div>
          {methods.length > 0 && (
            <Collapsible.Trigger
              render={
                <Button
                  variant="secondary"
                  size="sm"
                  className="group max-w-[60%] cursor-pointer justify-end whitespace-normal px-2 text-right"
                />
              }
            >
              <span>Rincian pembayaran</span>
              <ChevronDown
                className="size-4 text-muted-foreground motion-safe:transition-transform group-aria-expanded:rotate-180"
                aria-hidden="true"
              />
            </Collapsible.Trigger>
          )}
        </div>
        <p className="text-3xl font-semibold tracking-tight tabular-nums">
          {formatCurrency(summary.total)}
        </p>
        {methods.length > 0 && (
          <Collapsible.Panel>
            <dl className="space-y-3 text-sm">
              {methods.map(([method, total]) => {
                const isCash = ["cash", "tunai"].includes(
                  method.trim().toLowerCase(),
                );
                const cash = isCash ? summary.cash : undefined;
                return (
                  <div
                    key={method}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-2"
                  >
                    <dt className="wrap-anywhere text-muted-foreground">
                      {method}
                    </dt>
                    <dd className="text-right font-medium tabular-nums">
                      {formatCurrency(total)}
                    </dd>
                    {cash && (
                      <dd className="col-span-2">
                        <dl className="space-y-1.5 border-l pl-3 text-xs">
                          {cash.received !== undefined && (
                            <div className="flex justify-between gap-3">
                              <dt className="text-muted-foreground">
                                Dibayarkan pembeli
                              </dt>
                              <dd className="shrink-0 text-right tabular-nums">
                                {formatCurrency(cash.received)}
                              </dd>
                            </div>
                          )}
                          {cash.change !== undefined && (
                            <div className="flex justify-between gap-3">
                              <dt className="text-muted-foreground">
                                Kembalian
                              </dt>
                              <dd className="shrink-0 text-right tabular-nums">
                                {formatCurrency(cash.change)}
                              </dd>
                            </div>
                          )}
                        </dl>
                      </dd>
                    )}
                  </div>
                );
              })}
            </dl>
          </Collapsible.Panel>
        )}
      </Collapsible.Root>
      <div className="flex min-w-0 flex-col">
        <div
          ref={metricsRef}
          id={metricsId}
          role="group"
          aria-label="Ringkasan transaksi"
          tabIndex={canSlide ? 0 : undefined}
          className="grid flex-1 snap-x snap-mandatory auto-cols-[calc((100%_-_0.75rem)/2)] grid-flow-col gap-3 overflow-x-auto rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-safe:scroll-smooth [scrollbar-width:none]"
          onScroll={({ currentTarget }) => {
            const { clientWidth, scrollLeft, scrollWidth } = currentTarget;
            const scrollRange = scrollWidth - clientWidth;
            if (scrollRange > 0) {
              setVisibleStart(
                Math.max(0, Math.round((scrollLeft / scrollRange) * lastStart)),
              );
            }
          }}
        >
          {metrics.map(({ label, icon: Icon, tone, value, count }) => (
            <section
              key={label}
              aria-label={label}
              className="bento-surface flex snap-start flex-col justify-between gap-3 p-4 sm:p-5"
            >
              <h2 className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {Icon && (
                  <Icon
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                )}
                {tone ? <StatusBadge tone={tone}>{label}</StatusBadge> : label}
              </h2>
              <div className="space-y-1">
                <p className="wrap-anywhere text-2xl font-semibold tracking-tight tabular-nums">
                  {value}
                </p>
                {count !== undefined && (
                  <p className="text-xs text-muted-foreground">
                    {formatNominal(count)} transaksi
                  </p>
                )}
              </div>
            </section>
          ))}
        </div>
        {canSlide && (
          <div className="flex justify-center mt-2">
            {metrics.slice(0, -1).map(({ label }, index) => (
              <button
                key={label}
                type="button"
                aria-controls={metricsId}
                aria-label={`Tampilkan ${label} dan ${metrics[index + 1].label}`}
                aria-pressed={activeStart === index}
                className="grid size-4 cursor-pointer place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                onClick={() => scrollToMetrics(index)}
              >
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    activeStart === index
                      ? "bg-ring"
                      : "bg-muted-foreground/30",
                  )}
                />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
