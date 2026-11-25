import { getAccountBranches, getAuthSession, type Branch } from "@/features/auth/auth-store";
import { copyProduct, fetchProducts } from "./product-api";
import { isValidProductStock } from "./product-schema";
import type { Product } from "./sample-products";

function normalizeProductText(value: string) {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase("id-ID");
}

export function getProductCopyDestinations(product: Product, products: Product[], branches: Branch[]) {
  const title = normalizeProductText(product.title);
  const category = normalizeProductText(product.categoryName || product.category);
  const occupiedBranches = new Set([product.branchId || product.storeId]);
  for (const item of products) {
    const sameCategory = item.category === product.category ||
      normalizeProductText(item.categoryName || item.category) === category;
    if (sameCategory && normalizeProductText(item.title) === title) {
      occupiedBranches.add(item.branchId || item.storeId);
    }
  }
  return branches.filter(({ id }) => id && id !== "all" && !occupiedBranches.has(id));
}

export interface CopyProductInput {
  branchId: string;
  useStock: boolean;
  stock: string;
}

export async function copyProductToBranch(product: Product, { branchId, useStock, stock }: CopyProductInput) {
  const account = getAuthSession()?.account;
  if (!account || !getProductCopyDestinations(product, [], getAccountBranches(account.store)).some(({ id }) => id === branchId)) {
    throw new Error("Pilih cabang tujuan yang tersedia.");
  }
  if (useStock && !isValidProductStock(stock)) {
    throw new Error("Isi stok awal dengan bilangan bulat 0 atau lebih.");
  }

  const products = await fetchProducts();
  const currentAccount = getAuthSession()?.account;
  if (!currentAccount || currentAccount.account_username !== account.account_username || currentAccount.store?.id !== account.store?.id) {
    throw new Error("Sesi berubah. Buka kembali detail produk untuk menyalin.");
  }
  const destination = getProductCopyDestinations(product, products, getAccountBranches(currentAccount.store))
    .find(({ id }) => id === branchId);
  if (!destination) {
    throw new Error("Produk sudah tersedia di cabang tujuan atau cabang tersebut tidak dapat dipilih lagi.");
  }

  await copyProduct({
    productSku: product.id,
    branchId: destination.id,
    useStock,
    stockQuantity: useStock ? stock.trim() : undefined,
  });
  return destination.name;
}
