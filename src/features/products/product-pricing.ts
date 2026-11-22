import type { Product } from "./sample-products";

export function getProductPricing(
  product: Pick<Product, "price" | "discount" | "discountType">,
) {
  const price = Math.max(0, product.price);
  const discount = Math.max(0, product.discount);
  const percent =
    product.discountType === "Persentase (%)" ? Math.min(100, discount) : null;
  let reduction = 0;
  if (percent !== null) reduction = (price * percent) / 100;
  if (product.discountType === "Nominal") reduction = discount;
  const finalPrice = Math.round(Math.max(0, price - reduction));
  return { finalPrice, percent, hasDiscount: finalPrice < price };
}
