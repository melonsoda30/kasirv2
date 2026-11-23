import { Banknote, Package, ReceiptText } from "lucide-react";
import { formatCurrency, formatNominal } from "@/lib/currency";
import { paymentMethods } from "./sales-filters";
import { summarizeSales } from "./sales-summary";
import type { Sale, SalesSummary } from "./sales-summary";

export function SalesSummaryCards({ sales, summary: apiSummary }: { sales: readonly Sale[]; summary?: SalesSummary }) {
  const summary = apiSummary ?? summarizeSales(sales);
  const methods = [
    ...new Set([...paymentMethods, ...Object.keys(summary.paymentTotals)]),
  ];
  const salesPromotions = summary.salesPromotions ?? [];
  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-[minmax(0,2fr)_repeat(2,minmax(0,1fr))]">
        <section
          aria-labelledby="sales-summary-title"
          className="bento-surface col-span-2 flex flex-col justify-between gap-3 p-4 sm:col-span-1 sm:p-5"
        >
          <div className="flex items-center gap-2">
            <Banknote className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <h2 id="sales-summary-title" className="text-sm font-medium">
              Total omzet
            </h2>
          </div>
          <p className="text-3xl font-semibold tracking-tight tabular-nums">
            {formatCurrency(summary.total)}
          </p>
        </section>
        <section
          aria-labelledby="transaction-summary-title"
          className="bento-surface flex flex-col justify-between gap-3 p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <ReceiptText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <h2 id="transaction-summary-title" className="text-sm font-medium">
              Total transaksi
            </h2>
          </div>
          <p className="text-2xl font-semibold tracking-tight tabular-nums">
            {formatNominal(summary.transactions)}
          </p>
        </section>
        <section
          aria-labelledby="products-sold-title"
          className="bento-surface flex flex-col justify-between gap-3 p-4 sm:p-5"
        >
          <div className="flex flex-wrap items-center gap-2">
            <Package className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <h2 id="products-sold-title" className="text-sm font-medium">
              Produk terjual
            </h2>
          </div>
          <p className="text-2xl font-semibold tracking-tight tabular-nums">
            {formatNominal(summary.productsSold)}
          </p>
        </section>
      </div>
      <div className="grid gap-4 md:grid-cols-[repeat(auto-fit,minmax(min(100%,22rem),1fr))]">
        <section aria-labelledby="sales-payments-title" className="bento-surface space-y-3 p-4 sm:p-5">
          <h2 id="sales-payments-title" className="text-sm font-medium">
            Rincian pembayaran
          </h2>
          <dl className="space-y-3 text-sm">
            {methods.map((method) => (
              <div key={method} className="flex items-baseline justify-between gap-4">
                <dt className="min-w-0 text-muted-foreground">{method}</dt>
                <dd className="text-right font-medium tabular-nums">
                  {formatCurrency(summary.paymentTotals[method] ?? 0)}
                </dd>
              </div>
            ))}
            <div className="flex items-baseline justify-between gap-4 border-t pt-3">
              <dt className="text-muted-foreground">Kembalian</dt>
              <dd className="text-right font-medium tabular-nums">
                {formatCurrency(summary.change)}
              </dd>
            </div>
          </dl>
        </section>
        {salesPromotions.length > 0 && (
          <section aria-labelledby="sales-promotions-title" className="bento-surface space-y-3 p-4 sm:p-5">
            <h2 id="sales-promotions-title" className="text-sm font-medium">Omzet per sales</h2>
            <dl className="space-y-2 text-sm">
              {salesPromotions.map(({ name, total }, index) => (
                <div key={`${name}-${index}`} className="flex items-baseline justify-between gap-4">
                  <dt className="min-w-0 break-words text-muted-foreground">{name}</dt>
                  <dd className="text-right font-medium tabular-nums">{formatCurrency(total)}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>
    </div>
  );
}
