import type { Product } from "./sample-products";

export function getProductDiscountError({ price, discount, discountType }: {
  price: string;
  discount: string;
  discountType: string;
}) {
  const amount = Number(discount);
  if (!Number.isFinite(amount) || amount < 0) return "Diskon harus berupa angka 0 atau lebih.";
  if (discountType === "Persentase (%)" && amount > 100) return "Diskon persentase maksimal 100%.";
  if (discountType === "Nominal" && amount > Number(price)) return "Diskon tidak boleh melebihi harga produk.";
}

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
