import { useState } from "react";

function readOrder(key: string | undefined) {
  if (!key) return [];
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(stored) ? stored.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

export function useOrderListPreference(key: string | undefined) {
  const [saved, setSaved] = useState(() => ({ key, order: readOrder(key) }));
  const order = saved.key === key ? saved.order : readOrder(key);

  function save(order: string[]) {
    if (!key) return;
    setSaved({ key, order });
    try {
      localStorage.setItem(key, JSON.stringify(order));
    } catch {
      // Keep the preference for the current page if storage is unavailable.
    }
  }

  return { order, save };
}
