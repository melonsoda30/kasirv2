import { useEffect, useEffectEvent, useState } from "react";
import { format } from "date-fns";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Product } from "@/features/products/sample-products";
import { isLowStock } from "./order-products";
import { productKey } from "./order-store";

const shownDays = new Map<string, string>();

function markReminderShown(key: string, day: string) {
  if (shownDays.get(key) === day) return false;
  try {
    if (localStorage.getItem(key) === day) return false;
    localStorage.setItem(key, day);
  } catch {
    // Keep the reminder once a day while the app is open if storage is unavailable.
  }
  shownDays.set(key, day);
  return true;
}

export function LowStockReminder({ scope, products, ready }: {
  scope: string;
  products: readonly Product[];
  ready: boolean;
}) {
  const [reminderProducts, setReminderProducts] = useState<Product[]>([]);
  const hasLowStock = products.some((product) => isLowStock(product));
  const showReminder = useEffectEvent(() => {
    setReminderProducts(products.filter((product) => isLowStock(product)).sort((a, b) => a.stock - b.stock));
  });

  useEffect(() => {
    if (!ready || !hasLowStock) return;
    const key = `kasirv2.low-stock-reminder:${scope}`;
    let timer: number;

    function checkReminder() {
      window.clearTimeout(timer);
      const now = new Date();
      const nextDay = new Date(now);
      nextDay.setHours(24, 0, 0, 0);
      timer = window.setTimeout(checkReminder, nextDay.getTime() - now.getTime());
      if (document.visibilityState === "visible" && markReminderShown(key, format(now, "yyyy-MM-dd"))) {
        showReminder();
      }
    }

    timer = window.setTimeout(checkReminder, 0);
    document.addEventListener("visibilitychange", checkReminder);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", checkReminder);
    };
  }, [hasLowStock, ready, scope]);

  return (
    <Dialog open={reminderProducts.length > 0} onOpenChange={(open) => { if (!open) setReminderProducts([]); }}>
      <DialogContent showCloseButton={false} className="max-h-[85dvh] grid-rows-[auto_minmax(0,1fr)_auto]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <TriangleAlert className="size-4 fill-warning-indicator text-status-icon-foreground" aria-hidden="true" />
            Stok hampir habis
          </DialogTitle>
          <DialogDescription>
            Periksa stok produk berikut dan isi ulang bila perlu.
          </DialogDescription>
        </DialogHeader>
        <ul className="min-h-0 divide-y overflow-y-auto rounded-lg border">
          {reminderProducts.map((product) => (
            <li key={productKey(product)} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="min-w-0 wrap-break-word font-medium">{product.title}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">Sisa {product.stock}</span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button">Tutup</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
