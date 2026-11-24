import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { SelectCombobox } from "@/components/select-combobox";
import { DatePickerRange } from "@/components/date-picker-range";
import {
  Drawer,
  DrawerTrigger,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import type { usePaymentMethods } from "@/features/orders/payment-methods";
import { defaultSalesFilters } from "./sales-filters";
import type { SalesFilters } from "./sales-filters";

export function SalesFilterDrawer({
  filters,
  stores,
  cashiers,
  cashiersLoading,
  paymentOptions,
  paymentMethods,
  onSave,
  hideCashier = false,
  hideStore = false,
}: {
  filters: SalesFilters;
  stores: { value: string; label: string }[];
  cashiers: { value: string; label: string }[];
  cashiersLoading: boolean;
  paymentOptions: { value: string; label: string }[];
  paymentMethods: Pick<ReturnType<typeof usePaymentMethods>, "isPending" | "isError" | "isFetching" | "isSuccess" | "refetch">;
  onSave: (filters: SalesFilters) => void;
  hideCashier?: boolean;
  hideStore?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const hasDraftFilters =
    !!(draft.dateRange?.from || draft.dateRange?.to) ||
    [draft.paymentMethod, hideStore ? 'all' : draft.store, hideCashier ? 'all' : draft.cashier, draft.product].some(
      (value) => !!value && value !== "all",
    );
  const active =
    !!filters.dateRange?.from ||
    [
      filters.paymentMethod,
      hideStore ? 'all' : filters.store,
      hideCashier ? 'all' : filters.cashier,
      filters.product,
    ].some((value) => value !== "all");
  const fields = [
    {
      key: "paymentMethod",
      label: "Metode pembayaran",
      options: paymentOptions,
    },
    {
      key: "store",
      label: "Store",
      options: stores,
    },
    {
      key: "cashier",
      label: "Kasir",
      options: cashiers,
    },
  ] as const;

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
          type="button"
          variant="outline"
          size="icon"
          className="relative"
          aria-label={
            active ? "Filter penjualan, filter aktif" : "Filter penjualan"
          }
        >
          <SlidersHorizontal aria-hidden="true" />
          {active && (
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-ring" />
          )}
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Filter penjualan</DrawerTitle>
          {/* <DrawerDescription>
            Pilih filter lalu simpan untuk menerapkan.
          </DrawerDescription> */}
        </DrawerHeader>
        <DrawerBody className="space-y-5 p-4">
          <div className="space-y-2">
            <label htmlFor="sales-date-range" className="text-sm font-medium">
              Rentang tanggal
            </label>
            <DatePickerRange
              type="modal"
              id="sales-date-range"
              value={draft.dateRange}
              onChange={(dateRange) =>
                setDraft((current) => ({ ...current, dateRange }))
              }
            />
          </div>
          {fields.filter((field) => (!hideCashier || field.key !== 'cashier') && (!hideStore || field.key !== 'store')).map(({ key, label, options }) => (
            <div key={key} className="space-y-2">
              {key === 'store' && (
                <fieldset className="min-w-0 space-y-3">
                  <legend className="text-sm font-medium">Store</legend>
                  <div className="flex flex-wrap gap-2">
                    {[{ value: 'all', label: 'Semua' }, ...options].map((option) => (
                      <Button key={option.value} type="button" size="sm"
                        className="w-fit max-w-full rounded-full px-3 wrap-anywhere whitespace-normal"
                        variant={draft.store === option.value ? 'default' : 'outline'}
                        aria-pressed={draft.store === option.value} onClick={() => setDraft((current) => ({ ...current, store: option.value }))}>
                        {option.label}
                      </Button>
                    ))}
                  </div>
                </fieldset>
              )}
              {key !== 'store' && (
                <>
                  <label
                    htmlFor={`sales-filter-${key}`}
                    className="text-sm font-medium"
                  >
                    {label}
                  </label>
                  {((key === "paymentMethod" && paymentMethods.isPending) || (key === "cashier" && cashiersLoading)) ? (
                    <SkeletonGroup label={`Memuat ${label.toLowerCase()}`}>
                      <Skeleton className="h-10 w-full" />
                    </SkeletonGroup>
                  ) : (
                    <SelectCombobox
                      searchable={false}
                      id={`sales-filter-${key}`}
                      aria-label={label}
                      options={[{ value: "all", label: "Semua" }, ...options]}
                      value={draft[key]}
                      onChange={(value) =>
                        setDraft((current) => ({ ...current, [key]: value || "all" }))
                      }
                    />
                  )}
                  {key === "paymentMethod" && paymentMethods.isError && (
                    <div className="flex items-center justify-between gap-2">
                      <p role="alert" className="text-sm">Metode pembayaran gagal dimuat.</p>
                      <Button type="button" size="sm" variant="outline" loading={paymentMethods.isFetching}
                        onClick={() => void paymentMethods.refetch()}>Coba lagi</Button>
                    </div>
                  )}
                  {key === "paymentMethod" && paymentMethods.isSuccess && !paymentOptions.length && (
                    <p className="text-sm text-muted-foreground">Belum ada metode pembayaran.</p>
                  )}
                </>
              )}
            </div>
          ))}
        </DrawerBody>
        <DrawerFooter>
          <div className={cn("grid gap-2", hasDraftFilters ? "grid-cols-2" : "grid-cols-1")}>
            {hasDraftFilters && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setDraft({ ...defaultSalesFilters })}
              >
                Reset filter
              </Button>
            )}
            <Button
              type="button"
              onClick={() => {
                onSave({ ...draft });
                setOpen(false);
              }}
            >
              Simpan
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
