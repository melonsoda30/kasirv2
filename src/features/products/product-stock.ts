import type { Product } from "./sample-products";

export function availableProductStock(product: Product, reserved = 0) {
  return product.useStock === false ? Number.MAX_SAFE_INTEGER : Math.max(0, product.stock - reserved);
}

export function isLowStockQuantity(quantity: number) {
  return quantity > 0 && quantity <= 5;
}
