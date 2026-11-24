import type { ReactNode } from "react";
import { Package } from "lucide-react";
import { cn } from "cn";
import { SkeletonImage } from "@/components/ui/skeleton-image";
import { formatCurrency } from "@/lib/currency";
import { ProductPrice } from "@/features/products/product-price";
import type { Product } from "@/features/products/sample-products";
import type { OrderLine } from "./order-store";
import { OrderQuantityButtons } from "./order-quantity-buttons";

export function OrderItemRow({
  orderId,
  item,
  catalogProduct,
  showDiscount,
  quantityControl,
}: {
  orderId?: string;
  item: OrderLine;
  catalogProduct?: Product;
  showDiscount?: boolean;
  quantityControl?: ReactNode;
}) {
  const image =
    item.product.photo ||
    (item.product.image
      ? `https://images.unsplash.com/${item.product.image}?auto=format&fit=crop&w=120&q=80`
      : "");
  return (
    <li className="flex items-start gap-3 py-3">
      <div className="flex size-18 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
        <SkeletonImage src={image} alt="" loading="lazy" className="size-full"
          fallback={<Package className="size-5 text-muted-foreground" aria-hidden="true" />}
        />
      </div>
      <div
        className={cn(
          "min-w-0 flex-1",
          showDiscount && "flex flex-col flex-wrap items-start justify-between gap-x-3 gap-y-1",
        )}
      >
        <p className="break-words text-sm leading-tight font-medium">
          {item.product.title}
        </p>
        {showDiscount ? (
          <div className="min-w-0">
            <ProductPrice
              product={item.product}
              unitPrice={item.unitPrice}
              inline
              quantity={item.quantity}
            />
            {item.quantity > 1 && (
              <p className="mt-1 text-sm leading-tight font-bold tabular-nums">
                {formatCurrency(item.unitPrice * item.quantity)}
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
              <p className="text-xs text-muted-foreground tabular-nums">
                {!orderId && !quantityControl && <>{item.quantity} × </>}
                {formatCurrency(item.unitPrice)}
              </p>
              {orderId && (
                <OrderQuantityButtons
                  orderId={orderId}
                  item={item}
                  catalogProduct={catalogProduct}
                />
              )}
              {quantityControl}
            </div>
            <p className="mt-0.5 text-sm leading-tight font-bold text-foreground tabular-nums">
              {formatCurrency(item.unitPrice * item.quantity)}
            </p>
          </>
        )}
      </div>
    </li>
  );
}
