import { formatCurrency } from "@/lib/currency";
import type { Product } from "./sample-products";

import { getProductPricing } from "./product-pricing";

export function ProductPrice({
  product,
  detail = false,
}: {
  product: Product;
  detail?: boolean;
}) {
  const { finalPrice, percent, hasDiscount } = getProductPricing(product);
  return (
    <span className="flex min-w-0 flex-col gap-1 tabular-nums">
      {hasDiscount && (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          <s
            className="text-muted-foreground"
            aria-label={`Harga asli ${formatCurrency(product.price)}`}
          >
            {formatCurrency(product.price)}
          </s>
          {percent !== null && (
            <span
              className="rounded bg-destructive/10 px-1.5 py-0.5 font-medium text-destructive"
              aria-label={`Diskon ${percent}%`}
            >
              -{percent.toLocaleString("id-ID")}%
            </span>
          )}
        </span>
      )}
      <span
        className={`${detail ? "text-lg" : "text-sm"} font-semibold`}
        aria-label={
          hasDiscount
            ? `Harga setelah diskon ${formatCurrency(finalPrice)}`
            : undefined
        }
      >
        {formatCurrency(finalPrice)}
      </span>
    </span>
  );
}
