import { useState } from "react";
import type { Account } from "@/features/auth/auth-store";
import type { Category } from "@/features/products/category-api";
import type { Product } from "@/features/products/sample-products";

export function getOrderCategories(
  products: readonly Product[],
  storeCategories: readonly Category[],
  localOrder: readonly string[],
) {
  const bySlug = new Map<string, Category>();
  for (const product of products) {
    const slug = product.category;
    const existing = bySlug.get(slug);
    if (existing) {
      existing.product_count += 1;
    } else {
      bySlug.set(slug, {
        category_id: slug,
        category_slug: slug,
        category_name: product.categoryName || slug,
        category_sort: bySlug.size + 1,
        category_status: "active",
        product_count: 1,
      });
    }
  }

  const ordered = new Map<string, Category>();
  for (const { category_slug, category_name } of storeCategories) {
    const slug = category_slug.toLowerCase();
    const name = category_name.toLowerCase();
    for (const [value, category] of bySlug) {
      const normalized = value.toLowerCase();
      if (!ordered.has(value) && (normalized === slug || normalized === name)) {
        ordered.set(value, { ...category, category_name });
      }
    }
  }
  for (const slug of localOrder) {
    const category = bySlug.get(slug);
    if (category && !ordered.has(slug)) ordered.set(slug, category);
  }
  for (const [slug, category] of bySlug) {
    if (!ordered.has(slug)) ordered.set(slug, category);
  }
  return [...ordered.values()];
}

function readCategoryOrder(key: string) {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export function useOrderCategoryOrder(account: Account | undefined) {
  const key = `kasirv2.order-category-order:${JSON.stringify([
    account?.account_id ?? account?.account_username,
    account?.store?.id ?? account?.event_id,
    account?.store?.branch_id,
  ])}`;
  const [saved, setSaved] = useState(() => ({ key, order: account ? readCategoryOrder(key) : [] }));
  const order = saved.key === key ? saved.order : readCategoryOrder(key);

  function save(order: string[]) {
    if (!account) return;
    setSaved({ key, order });
    try {
      localStorage.setItem(key, JSON.stringify(order));
    } catch {
      // Keep the preference for the current page if storage is unavailable.
    }
  }

  return { order, save };
}
