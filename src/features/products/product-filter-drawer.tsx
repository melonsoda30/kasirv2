import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import type { ProductFilters } from "./product-filters";
import type { Branch } from "@/features/auth/auth-store";

const statuses = [
  { value: "all", label: "Semua" },
  { value: "active", label: "Aktif" },
  { value: "inactive", label: "Nonaktif" },
] as const;

export function ProductFilterDrawer({
  filters,
  stores,
  onSave,
}: {
  filters: ProductFilters;
  stores: Branch[];
  onSave: (filters: ProductFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const active = filters.store !== "all" || filters.status !== "all";

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft({ ...filters });
        setOpen(next);
      }}
    >
      <DrawerTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          type="button"
          aria-label={active ? "Filter produk, filter aktif" : "Filter produk"}
          className="relative"
        >
          <SlidersHorizontal aria-hidden="true" />
          {active && (
            <div className="size-2 rounded-full bg-black absolute -top-0.5 -right-0.5" />
          )}
        </Button>
      </DrawerTrigger>
      <DrawerContent className="product-drawer pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <DrawerHeader className="shrink-0">
          <DrawerTitle>Filter produk</DrawerTitle>
          {/* <DrawerDescription>Pilih store dan status, lalu simpan untuk menerapkan.</DrawerDescription> */}
        </DrawerHeader>
        <div className="min-h-0 space-y-6 overflow-y-auto px-4 py-4">
          <fieldset className="min-w-0 space-y-3">
            <legend className="mb-2 text-sm font-medium">Store</legend>
            <div className="flex flex-wrap gap-2">
              {[
                { value: "all", label: "Semua" },
                ...stores.map(({ id, name }) => ({ value: id, label: name })),
              ].map(({ value, label }) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  className="w-fit max-w-full rounded-full px-3 wrap-anywhere whitespace-normal"
                  variant={draft.store === value ? "default" : "outline"}
                  aria-pressed={draft.store === value}
                  onClick={() =>
                    setDraft((current) => ({ ...current, store: value }))
                  }
                >
                  {label}
                </Button>
              ))}
            </div>
          </fieldset>
          <fieldset className="min-w-0 space-y-3">
            <legend className="mb-2 text-sm font-medium">Status</legend>
            <div className="flex flex-wrap gap-2">
              {statuses.map(({ value, label }) => (
                <Button
                  key={value}
                  type="button"
                  size="sm"
                  className="w-fit max-w-full rounded-full px-3 wrap-anywhere whitespace-normal"
                  variant={draft.status === value ? "default" : "outline"}
                  aria-pressed={draft.status === value}
                  onClick={() =>
                    setDraft((current) => ({ ...current, status: value }))
                  }
                >
                  {label}
                </Button>
              ))}
            </div>
          </fieldset>
        </div>
        <DrawerFooter className="shrink-0">
          <Button
            type="button"
            onClick={() => {
              onSave({ ...draft });
              setOpen(false);
            }}
          >
            Simpan
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
