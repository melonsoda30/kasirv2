import { request } from "../../lib/api";

export interface Category {
  category_id: number | string | null;
  category_slug: string;
  category_name: string;
  category_sort: number;
  category_status: "active" | "noactive";
  product_count: number;
}

type CategoryRecord = string | (Partial<Category> & { category_name: string });
const categoryUrl = "/admin/category.php";

export async function fetchCategories(signal?: AbortSignal): Promise<Category[]> {
  const response = await request<
    | CategoryRecord[]
    | { status?: string; msg?: string; data?: CategoryRecord[] }
    | null
  >({
    url: categoryUrl,
    method: "GET",
    params: { action: "list_category" },
    signal,
  });

  if (
    !Array.isArray(response) &&
    response?.status &&
    response.status !== "success"
  ) {
    throw new Error(response.msg || "Gagal memuat daftar kategori.");
  }

  const data = Array.isArray(response) ? response : response?.data;
  if (!Array.isArray(data)) {
    throw new Error("Format daftar kategori dari server tidak valid.");
  }

  const categories = new Map<string, Category>();
  for (const entry of data) {
    const record = typeof entry === "string" ? { category_name: entry } : entry;
    if (typeof record?.category_name !== "string") {
      throw new Error("Format daftar kategori dari server tidak valid.");
    }
    const name = record.category_name.trim();
    const slug = record.category_slug ?? name;
    if (name && !categories.has(slug)) {
      categories.set(slug, {
        category_id: record.category_id ?? null,
        category_slug: slug,
        category_name: name,
        category_sort: Number(record.category_sort ?? 0),
        category_status: record.category_status ?? "active",
        product_count: Number(record.product_count ?? 0),
      });
    }
  }
  return [...categories.values()].sort((a, b) => a.category_sort - b.category_sort);
}

export interface CategoryInput {
  name: string;
  slug?: string;
  sort_order?: number;
  status?: "active" | "noactive";
}

type CategoryId = number | string;

function categoryFormData(input: Partial<CategoryInput>): FormData {
  const data = new FormData();
  if (input.name !== undefined) data.set("name", input.name);
  if (input.slug !== undefined) data.set("slug", input.slug);
  if (input.sort_order !== undefined)
    data.set("sort_order", String(input.sort_order));
  if (input.status !== undefined) data.set("status", input.status);
  return data;
}

async function postCategory(
  action: "add_category" | "edit_category" | "delete_category",
  data: FormData,
  errorMessage: string,
) {
  data.set("action", action);
  const response = await request<{ status: string; msg?: string; data?: Pick<Category, "category_slug"> } | null>({
    url: categoryUrl,
    method: "POST",
    data,
  });
  if (response?.status !== "success") {
    throw new Error(response?.msg || errorMessage);
  }
  return response.data;
}

export function addCategory(input: CategoryInput) {
  return postCategory("add_category", categoryFormData(input), "Gagal menambah kategori.");
}

export function editCategory(categoryId: CategoryId, input: CategoryInput) {
  const data = categoryFormData(input);
  data.set("category_id", String(categoryId));
  return postCategory("edit_category", data, "Gagal mengubah kategori.");
}

export function deleteCategory(categoryId: CategoryId) {
  const data = new FormData();
  data.set("category_id", String(categoryId));
  return postCategory("delete_category", data, "Gagal menghapus kategori.");
}
