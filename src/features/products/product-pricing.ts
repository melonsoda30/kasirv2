import type { Product } from "./sample-products";

export function getProductPricing(
  product: Pick<Product, "price" | "discount" | "discountType">,
) {
  const price = Math.max(0, product.price);
  const discount = Math.max(0, product.discount);
  const percent =
    product.discountType === "Persentase (%)" ? Math.min(100, discount) : null;
  const reduction =
    percent !== null
      ? (price * percent) / 100
      : product.discountType === "Nominal"
        ? discount
        : 0;
  const finalPrice = Math.round(Math.max(0, price - reduction));
  return { finalPrice, percent, hasDiscount: finalPrice < price };
}
