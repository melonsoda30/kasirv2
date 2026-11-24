import { useId, useRef, useState } from "react";
import { Collapsible } from "@base-ui/react/collapsible";
import { cn } from "cn";
import {
  Banknote,
  ChevronDown,
  HandCoins,
  Package,
  ReceiptText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatNominal } from "@/lib/currency";
import { paymentMethods } from "./sales-filters";
import { summarizeSales } from "./sales-summary";
import type { Sale, SalesSummary } from "./sales-summary";

export function SalesSummaryCards({
  sales,
  summary: apiSummary,
}: {
  sales: readonly Sale[];
  summary?: SalesSummary;
}) {
  const metricsId = useId();
  const metricsRef = useRef<HTMLDivElement>(null);
  const [showLastCard, setShowLastCard] = useState(false);
  const summary = apiSummary ?? summarizeSales(sales);
  const methods = [
    ...new Set([...paymentMethods, ...Object.keys(summary.paymentTotals)]),
  ];
  const metrics = [
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
    {
      label: "Kembalian",
      icon: HandCoins,
      value: formatCurrency(summary.change),
    },
  ];

  function scrollToMetrics(last: boolean) {
    const scroller = metricsRef.current;
    if (scroller) {
      scroller.scrollTo({
        left: last ? scroller.scrollWidth - scroller.clientWidth : 0,
      });
    }
  }

  return (
    <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:has-[[data-open]]:items-start">
      <Collapsible.Root
        render={<section />}
        aria-labelledby="sales-summary-title"
        className="bento-surface flex flex-col justify-between gap-3 p-4 sm:p-5 lg:mb-9 lg:data-open:mb-0"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <Banknote
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <h2 id="sales-summary-title" className="text-sm font-medium">
              Total omzet
            </h2>
          </div>
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
        </div>
        <p className="text-3xl font-semibold tracking-tight tabular-nums">
          {formatCurrency(summary.total)}
        </p>
        <Collapsible.Panel className="">
          <dl className="space-y-3 text-sm">
            {methods.map((method) => (
              <div
                key={method}
                className="flex items-baseline justify-between gap-3"
              >
                <dt className="min-w-0 wrap-anywhere text-muted-foreground">
                  {method}
                </dt>
                <dd className="shrink-0 text-right font-medium tabular-nums">
                  {formatCurrency(summary.paymentTotals[method] ?? 0)}
                </dd>
              </div>
            ))}
          </dl>
        </Collapsible.Panel>
      </Collapsible.Root>
      <div className="flex min-w-0 flex-col">
        <div
          ref={metricsRef}
          id={metricsId}
          role="group"
          aria-label="Ringkasan transaksi"
          tabIndex={0}
          className="grid flex-1 snap-x snap-mandatory auto-cols-[calc((100%_-_0.75rem)/2)] grid-flow-col gap-3 overflow-x-auto rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-safe:scroll-smooth [scrollbar-width:none]"
          onScroll={({ currentTarget }) => {
            const { clientWidth, scrollLeft, scrollWidth } = currentTarget;
            setShowLastCard(scrollLeft > (scrollWidth - clientWidth) / 2);
          }}
        >
          {metrics.map(({ label, icon: Icon, value }) => (
            <section
              key={label}
              aria-label={label}
              className="bento-surface flex snap-start flex-col justify-between gap-3 p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-center gap-2">
                <Icon
                  className="size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                <h2 className="text-sm font-medium">{label}</h2>
              </div>
              <p className="wrap-anywhere text-2xl font-semibold tracking-tight tabular-nums">
                {value}
              </p>
            </section>
          ))}
        </div>
        <div className="flex justify-center">
          {[false, true].map((last) => (
            <button
              key={String(last)}
              type="button"
              aria-controls={metricsId}
              aria-label={
                last
                  ? "Tampilkan Produk terjual dan Kembalian"
                  : "Tampilkan Total transaksi dan Produk terjual"
              }
              aria-pressed={showLastCard === last}
              className="grid size-9 cursor-pointer place-items-center rounded-full focus-visible:outline-2 focus-visible:outline-ring"
              onClick={() => scrollToMetrics(last)}
            >
              <span
                className={cn(
                  "h-1 w-6 rounded-full",
                  showLastCard === last ? "bg-ring" : "bg-muted-foreground/30",
                )}
              />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
