import { formatCurrency, formatNominal } from "@/lib/currency";
import { paymentMethods } from "./sales-filters";
import { summarizeSales } from "./sales-summary";
import type { Sale, SalesSummary } from "./sales-summary";

export function SalesSummaryCards({ sales, summary: apiSummary }: { sales: readonly Sale[]; summary?: SalesSummary }) {
  const summary = apiSummary ?? summarizeSales(sales);
  const methods = [
    ...new Set([...paymentMethods, ...Object.keys(summary.paymentTotals)]),
  ];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <section
          aria-labelledby="transaction-summary-title"
          className="min-w-0 rounded-lg border bg-background p-4"
        >
          <h2 id="transaction-summary-title" className="text-sm font-medium">
            Total transaksi
          </h2>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
            {formatNominal(summary.transactions)}
          </p>
        </section>
        <section
          aria-labelledby="products-sold-title"
          className="min-w-0 rounded-lg border bg-background p-4"
        >
          <h2 id="products-sold-title" className="text-sm font-medium">
            Produk terjual
          </h2>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">
            {formatNominal(summary.productsSold)}
          </p>
        </section>
      </div>
      <section
        aria-labelledby="sales-summary-title"
        className="rounded-lg border bg-background p-4"
      >
        <h2 id="sales-summary-title" className="text-sm font-medium">
          Ringkasan penjualan
        </h2>
        <p className="mt-2 mb-5 text-2xl font-semibold tracking-tight tabular-nums">
          {formatCurrency(summary.total)}
        </p>
        <dl className="space-y-3 text-sm">
          {methods.map((method) => (
            <div
              key={method}
              className="flex items-baseline justify-between gap-4"
            >
              <dt className="text-muted-foreground">{method}</dt>
              <dd className="font-medium tabular-nums">
                {formatCurrency(summary.paymentTotals[method] ?? 0)}
              </dd>
            </div>
          ))}
          <div className="flex items-baseline justify-between gap-4 border-t pt-3">
            <dt className="text-muted-foreground">Kembalian</dt>
            <dd className="font-medium tabular-nums">
              {formatCurrency(summary.change)}
            </dd>
          </div>
        </dl>
        {!!summary.salesPromotions?.length && (
          <section aria-label="Omzet per sales" className="mt-4 space-y-3 border-t pt-3">
            <h3 className="text-sm font-medium">Omzet per sales</h3>
            <dl className="space-y-2 text-sm">
              {summary.salesPromotions.map(({ name, total }, index) => (
                <div key={`${name}-${index}`} className="flex items-baseline justify-between gap-4">
                  <dt className="min-w-0 break-words text-muted-foreground">{name}</dt>
                  <dd className="shrink-0 font-medium tabular-nums">{formatCurrency(total)}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </section>
    </div>
  );
}
