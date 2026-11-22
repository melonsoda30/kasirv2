import { cn } from "cn";
import { formatCurrency } from "@/lib/currency";
import type { Product } from "./sample-products";

import { getProductPricing } from "./product-pricing";

export function ProductPrice({
  product,
  detail = false,
  unitPrice,
  inline = false,
  quantity = 1,
}: {
  product: Product;
  detail?: boolean;
  unitPrice?: number;
  inline?: boolean;
  quantity?: number;
}) {
  const pricing = getProductPricing(product);
  const finalPrice = unitPrice ?? pricing.finalPrice;
  const { percent } = pricing;
  const hasDiscount = pricing.hasDiscount && finalPrice < product.price;
  const quantityLabel = quantity > 1 ? `${quantity} × ` : "";
  return (
    <span
      className={cn(
        "flex min-w-0 tabular-nums",
        inline && "flex-wrap items-center gap-x-2 gap-y-1",
        !inline && "flex-col gap-1",
      )}
    >
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
        className={cn(
          "font-semibold",
          inline && "order-first text-xs",
          !inline && detail && "text-lg",
          !inline && !detail && "text-sm",
        )}
        aria-label={
          hasDiscount
            ? `${quantityLabel}Harga setelah diskon ${formatCurrency(finalPrice)}`
            : undefined
        }
      >
        {quantityLabel}{formatCurrency(finalPrice)}
      </span>
    </span>
  );
}
