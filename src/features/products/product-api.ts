import { API_BASE_URL, isEmptyListResponse, request } from "../../lib/api";
import { getBranchFilterId } from "../auth/auth-store";
import { getProductDiscountError } from "./product-pricing";
import type { Product } from "./sample-products";

interface ProductSalesRecord {
  sold_qty?: string | number | null;
  is_best_seller?: boolean;
}

interface ProductRecord extends ProductSalesRecord {
  status: string;
  product_sku: string;
  store_id: string;
  branch_id: string;
  branch_name?: string | null;
  stock_quantity?: number | string | null;
  stock_qty?: number | string | null;
  use_stock?: boolean | string | number | null;
  product_category: string;
  product_category_name: string;
  product_img: string;
  product_name: string;
  product_price: string | number;
  product_description: string;
  discount_type: string;
  discount: string | number;
}

interface OrderProductRecord extends ProductSalesRecord {
  status: string;
  id: string;
  location: string;
  branch: string;
  category: string;
  category_name: string;
  img: string;
  name: string;
  price: string | number;
  description: string;
  discount_type: string;
  discount: string | number;
  stock?: string | number | null;
  stock_qty?: string | number | null;
  use_stock?: boolean | string | number | null;
}

// Keep this independent of the logged-in account until event selection is added.
export const PRODUCT_EVENT_ID = "all";
export const menuListParams = {
  action: "list_product",
  category: "all",
  search: "",
  status: "all",
  menu_id: "all",
} as const;

const adminProductEndpoint = "/admin/product";
const orderProductEndpoint = "/product/product";
type ProductListEndpoint =
  typeof adminProductEndpoint | typeof orderProductEndpoint;

export function mapProductRecord(
  record: ProductRecord,
  endpoint: ProductListEndpoint = adminProductEndpoint,
): Product {
  const status = record.status.trim().toLowerCase();
  const soldQuantity = Number(record.sold_qty ?? NaN);
  const imagePath = record.product_img?.trim() ?? "";
  const branchName = record.branch_name?.trim();
  const stockQuantity =
    record.stock_qty === undefined ? record.stock_quantity : record.stock_qty;
  const withoutStock =
    stockQuantity === null ||
    (typeof stockQuantity === "string" && !stockQuantity.trim());
  const stockSetting = String(record.use_stock ?? "")
    .trim()
    .toLowerCase();
  let useStock: boolean | undefined = withoutStock ? false : undefined;
  if (stockSetting === "true" || stockSetting === "1") useStock = true;
  if (stockSetting === "false" || stockSetting === "0") useStock = false;
  const discountTypes: Record<string, string> = {
    none: "Tanpa diskon",
    fixed: "Nominal",
    nominal: "Nominal",
    persen: "Persentase (%)",
    percentage: "Persentase (%)",
    percent: "Persentase (%)",
  };
  const number = (value: string | number) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : 0;
  };
  return {
    id: record.product_sku,
    title: record.product_name.trim(),
    price: number(record.product_price),
    category:
      record.product_category || record.product_category_name || "Lainnya",
    categoryName: record.product_category_name || undefined,
    store: record.store_id || "Toko Utama",
    storeId: record.store_id,
    branchId: record.branch_id ?? "",
    ...(branchName && { branchName }),
    photo:
      imagePath && !/^[?#]/.test(imagePath)
        ? new URL(imagePath, `${API_BASE_URL.replace(/\/$/, "")}${endpoint}`)
            .href
        : "",
    image: "",
    description: record.product_description || "",
    discountType: discountTypes[record.discount_type] ?? "Tanpa diskon",
    discount: number(record.discount),
    active: ![
      "no active",
      "noactive",
      "inactive",
      "nonactive",
      "nonaktif",
    ].includes(status),
    ...(useStock !== undefined && { useStock }),
    stock: number(stockQuantity ?? 0),
    ...(Number.isSafeInteger(soldQuantity) && soldQuantity >= 0 && { soldQuantity }),
    ...(typeof record.is_best_seller === "boolean" && { isBestSeller: record.is_best_seller }),
  };
}

function mapOrderProductRecord(record: OrderProductRecord): Product {
  return mapProductRecord(
    {
      status: record.status,
      product_sku: record.id,
      store_id: record.location,
      branch_id: record.branch,
      product_category: record.category,
      product_category_name: record.category_name,
      product_img: record.img,
      product_name: record.name,
      product_price: record.price,
      product_description: record.description,
      discount_type: record.discount_type,
      discount: record.discount,
      stock_quantity: record.stock,
      stock_qty: record.stock_qty,
      use_stock: record.use_stock,
      sold_qty: record.sold_qty,
      is_best_seller: record.is_best_seller,
    },
    orderProductEndpoint,
  );
}

async function fetchProductList<TRecord>(
  endpoint: ProductListEndpoint,
  params: Record<string, string>,
  mapRecord: (record: TRecord) => Product,
  signal?: AbortSignal,
): Promise<Product[]> {
  const response = await request<
    TRecord[] | { status?: string; msg?: string; data?: TRecord[] } | null
  >({
    url: endpoint,
    method: "GET",
    params,
    signal,
  });
  if (isEmptyListResponse(response)) return [];
  if (
    !Array.isArray(response) &&
    response?.status &&
    response.status !== "success"
  ) {
    throw new Error(response.msg || "Gagal memuat daftar produk.");
  }
  let data: TRecord[] | undefined;
  if (Array.isArray(response)) data = response;
  else if (response?.status === "success") data = response.data;
  if (!Array.isArray(data))
    throw new Error("Format daftar produk dari server tidak valid.");
  return data.map((record) => mapRecord(record));
}

export async function fetchProducts(signal?: AbortSignal, branchId = PRODUCT_EVENT_ID) {
  const filterId = getBranchFilterId(branchId);
  const products = await fetchProductList(
    adminProductEndpoint,
    { ...menuListParams, ...(filterId && { branch_id: filterId }) },
    mapProductRecord,
    signal,
  );
  return filterId ? products.filter((product) => product.branchId === filterId) : products;
}

export function fetchOrderProducts(signal?: AbortSignal) {
  return fetchProductList(
    orderProductEndpoint,
    { action: "list_product", sort: "best_seller" },
    mapOrderProductRecord,
    signal,
  );
}

export async function updateProductStatus(
  menuId: string,
  active: boolean,
): Promise<string> {
  const data = new FormData();
  data.set("action", "status_product");
  data.set("product_sku", menuId);
  data.set("status", active ? "active" : "noactive");
  const response = await request<{ status: string; msg?: string } | null>({
    url: "/admin/product",
    method: "POST",
    data,
  });
  if (response?.status !== "success") {
    throw new Error(response?.msg || "Gagal mengubah status produk.");
  }
  return (
    response.msg || (active ? "Produk diaktifkan." : "Produk dinonaktifkan.")
  );
}

export async function deleteProduct(menuId: string): Promise<string> {
  const data = new FormData();
  data.set("action", "delete_product");
  data.set("product_sku", menuId);
  const response = await request<{ status: string; msg?: string } | null>({
    url: "/admin/product",
    method: "POST",
    data,
  });
  if (response?.status !== "success")
    throw new Error(response?.msg || "Gagal menghapus produk.");
  return response.msg || "Produk dihapus.";
}

export async function copyProduct({ productSku, branchId, useStock, stockQuantity }: {
  productSku: string;
  branchId: string;
  useStock: boolean;
  stockQuantity?: string;
}) {
  const data = new FormData();
  data.set("action", "copy_product");
  data.set("product_sku", productSku);
  data.set("branch_id", branchId);
  data.set("use_stock", String(useStock));
  if (stockQuantity !== undefined) data.set("stock_qty", stockQuantity);
  const response = await request<{ status: string; msg?: string } | null>({
    url: "/admin/product",
    method: "POST",
    data,
  });
  if (response?.status !== "success") {
    throw new Error(response?.msg || "Gagal menyalin produk.");
  }
}

export interface SaveProductInput {
  menuId?: string;
  eventId: string;
  category: string;
  image: File | null;
  name: string;
  price: string;
  description: string;
  discount: string;
  discountType: string;
  useStock: boolean;
  stockQuantity?: string;
}

export async function saveProduct(input: SaveProductInput): Promise<string> {
  let discountType = "none";
  if (input.discountType === "Persentase (%)") discountType = "percent";
  if (input.discountType === "Nominal") discountType = "fixed";
  if (discountType !== "none") {
    const discountError = getProductDiscountError(input);
    if (discountError) throw new Error(discountError);
  }
  const data = new FormData();
  data.set("action", input.menuId ? "edit_product" : "add_product");
  if (input.menuId) data.set("product_sku", input.menuId);
  data.set("branch_id", input.eventId);
  data.set("category", input.category);
  // An unchanged edit image is explicitly represented as an empty string.
  if (input.image) data.set("img", input.image, input.image.name);
  else data.set("img", "");
  data.set("name", input.name);
  data.set("price", input.price);
  data.set("description", input.description);
  data.set("discount", discountType === "none" ? "0" : input.discount || "0");
  data.set("discount_type", discountType);
  data.set("use_stock", String(input.useStock));
  if (input.stockQuantity !== undefined)
    data.set("stock_qty", input.stockQuantity);
  const response = await request<{ status: string; msg?: string } | null>({
    url: "/admin/product",
    method: "POST",
    data,
  });
  if (response?.status !== "success")
    throw new Error(response?.msg || "Gagal menyimpan produk.");
  return (
    response.msg ||
    (input.menuId ? "Produk diperbarui." : "Produk ditambahkan.")
  );
}
