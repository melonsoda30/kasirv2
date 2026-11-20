import { ImageOff } from "lucide-react";
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/features/auth/auth-store';
import { fetchTransactionDetail } from './sales-api';
import { useProductStore } from "@/features/products/product-store";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { formatCurrency } from "@/lib/currency";
import type { Sale, SaleStatus } from "./sales-summary";

const statusClasses: Record<SaleStatus, string> = {
  complete: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  delete: "bg-destructive/10 text-destructive",
  unknown: "bg-muted text-muted-foreground",
};

const dateTime = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: 'Asia/Jakarta',
});

function SaleInformation({ sale }: { sale: Sale }) {
  const date = new Date(sale.occurredAt);
  const details = [
    [
      "Tanggal & jam",
      Number.isNaN(date.getTime())
        ? "Tanggal tidak tersedia"
        : dateTime.format(date),
    ],
    ["Kasir", sale.cashier],
    ...(sale.salesperson ? [["Sales", sale.salesperson.name]] : []),
  ];
  return (
    <dl className="space-y-2 text-sm">
      {details.map(([label, value]) => (
        <div key={label} className="flex justify-between gap-4">
          <dt className="shrink-0 text-muted-foreground">{label}</dt>
          <dd className="min-w-0 break-words text-right">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function SaleCardContent({ sale }: { sale: Sale }) {
  const date = new Date(sale.occurredAt);
  const cash = ["tunai", "cash"].includes(
    sale.paymentMethod.trim().toLowerCase(),
  );
  return (
    <span className="flex flex-col gap-3">
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">
            {sale.store}
          </span>
          <span className="mt-1 block text-xs text-muted-foreground">
            {Number.isNaN(date.getTime())
              ? "Tanggal tidak tersedia"
              : dateTime.format(date)}
          </span>
        </span>
        <span
          className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${statusClasses[sale.status]}`}
        >
          {sale.status === 'unknown' ? 'Status belum tersedia' : sale.status}
        </span>
      </span>
      <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          className="text-lg font-semibold tabular-nums"
          aria-label={`Total ${formatCurrency(sale.total)}`}
        >
          {formatCurrency(sale.total)}
        </span>
        <span className="text-xs text-muted-foreground">
          {sale.paymentMethod}
        </span>
      </span>
      {cash && (
        <span className="flex items-center justify-between gap-3 rounded-md bg-muted/60 px-3 py-2 text-sm">
          <span className="text-foreground">Kembali</span>
          <span className="font-medium text-foreground tabular-nums">
            {formatCurrency(sale.change ?? Math.max(0, sale.paid - sale.total))}
          </span>
        </span>
      )}
      <span className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t pt-2 text-xs text-muted-foreground">
        <span
          className="min-w-0 break-all font-mono"
          aria-label={`ID penjualan ${sale.id}`}
        >
          {sale.id}
        </span>
        <span aria-label={`Kasir ${sale.cashier}`}>{sale.cashier}</span>
      </span>
    </span>
  );
}

export function SalesTransactionList({ sales }: { sales: readonly Sale[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const username = useAuthStore((state) => state.session?.account.account_username);
  const detail = useQuery({
    queryKey: ['transactions', 'detail', username, selectedId],
    queryFn: ({ signal }) => fetchTransactionDetail(selectedId!, signal),
    enabled: !!selectedId && !!username,
    staleTime: 0,
  });
  const products = useProductStore((state) => state.products);
  const productImages = new Map(
    products.map((product) => [
      product.id,
      product.photo ||
        (product.image
          ? `https://images.unsplash.com/${product.image}?auto=format&fit=crop&w=120&q=80`
          : ""),
    ]),
  );
  if (!sales.length) return null;
  return (
    <section
      className="mt-6 space-y-3"
      aria-labelledby="sales-transactions-title"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="sales-transactions-title" className="font-semibold">
          Daftar transaksi
        </h2>
        <span className="text-sm text-muted-foreground">
          {sales.length} transaksi
        </span>
      </div>
      <ul className="grid min-w-0 grid-cols-1 gap-2">
        {sales.map((listedSale) => {
          const sale = selectedId === listedSale.id && detail.data
            ? { ...detail.data, salesperson: detail.data.salesperson ?? listedSale.salesperson }
            : listedSale;
          return (
          <li key={sale.id} className="min-w-0">
            <Drawer onOpenChange={(open) => setSelectedId(open ? listedSale.id : null)}>
              <DrawerTrigger asChild>
                <button
                  type="button"
                  aria-label={`Detail penjualan ${sale.id}, ${sale.store}`}
                  className="w-full rounded-lg border bg-background p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <SaleCardContent sale={listedSale} />
                </button>
              </DrawerTrigger>
              <DrawerContent className="product-drawer pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
                <DrawerHeader className="shrink-0 border-b text-left">
                  <DrawerTitle>Detail transaksi</DrawerTitle>
                  <DrawerDescription className="break-all font-mono text-xs">
                    {sale.id}
                  </DrawerDescription>
                </DrawerHeader>
                <div className="min-h-0 space-y-3 overflow-y-auto p-4">
                  {detail.isPending || selectedId !== listedSale.id ? (
                    <div role="status" aria-label="Memuat detail transaksi" className="space-y-3">
                      <span className="sr-only">Memuat detail transaksi</span>
                      {[0, 1, 2].map((item) => <div key={item} aria-hidden="true" className="h-16 rounded-md bg-muted motion-safe:animate-pulse" />)}
                    </div>
                  ) : detail.isError ? (
                    <div role="alert" className="space-y-3 py-6 text-center">
                      <p className="text-sm">Gagal memuat detail transaksi.</p>
                      <Button type="button" variant="outline" loading={detail.isFetching} onClick={() => void detail.refetch()}>Coba lagi</Button>
                    </div>
                  ) : (
                  <>
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 break-words text-base font-semibold">
                      {sale.store}
                    </p>
                    <span
                      className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${statusClasses[sale.status]}`}
                    >
                      {sale.status === 'unknown' ? 'Status belum tersedia' : sale.status}
                    </span>
                  </div>
                  <section aria-label="Produk terjual">
                    {sale.items.length ? (
                      <ul className="divide-y">
                        {sale.items.map((item, index) => (
                          <li
                            key={`${item.productId}-${index}`}
                            className="flex items-center gap-3 py-2.5"
                          >
                            <div className="relative flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted">
                              <ImageOff
                                className="size-4 text-muted-foreground"
                                aria-hidden="true"
                              />
                              {(item.image || productImages.get(item.productId)) && (
                                <img
                                  src={item.image || productImages.get(item.productId)}
                                  alt=""
                                  loading="lazy"
                                  className="absolute inset-0 size-full object-cover"
                                  onError={(event) => {
                                    event.currentTarget.style.display = "none";
                                  }}
                                />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="break-words font-medium">
                                {item.title}
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                {item.quantity} ×{" "}
                                {item.unitPrice == null
                                  ? "Harga belum tersedia"
                                  : formatCurrency(item.unitPrice)}
                              </p>
                            </div>
                            {item.unitPrice != null && (
                              <p className="shrink-0 text-sm font-medium tabular-nums">
                                {formatCurrency(item.lineTotal ?? item.quantity * item.unitPrice)}
                              </p>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        Rincian item belum tersedia.
                      </p>
                    )}
                  </section>
                  <section
                    aria-label="Total dan metode pembayaran"
                    className="space-y-2 border-t pt-3"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-xs text-muted-foreground">
                          Metode pembayaran
                        </h3>
                        <p className="mt-1 text-sm font-medium">
                          {sale.paymentMethod}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="mt-1 text-lg font-semibold tabular-nums">
                          {formatCurrency(sale.total)}
                        </p>
                      </div>
                    </div>
                    {["tunai", "cash"].includes(
                      sale.paymentMethod.trim().toLowerCase(),
                    ) && (
                      <div className="flex items-center justify-end gap-3 text-sm">
                        <span className="text-muted-foreground">Kembali</span>
                        <span className="font-medium tabular-nums">
                          {formatCurrency(sale.change ?? Math.max(0, sale.paid - sale.total))}
                        </span>
                      </div>
                    )}
                  </section>
                  <section
                    aria-label="Informasi transaksi"
                    className="border-t pt-3"
                  >
                    <SaleInformation sale={sale} />
                  </section>
                  {sale.paymentMethod.trim().toLowerCase() === "qris" && (
                    <section
                      aria-label="Bukti pembayaran"
                      className="space-y-2 border-t pt-3"
                    >
                      <h3 className="text-sm font-semibold">
                        Bukti pembayaran
                      </h3>
                      {sale.paymentProof ? (
                        <a href={sale.paymentProof.url} target="_blank" rel="noopener noreferrer" className="block space-y-2 rounded-lg border p-3 text-sm">
                          {sale.paymentProof.type === 'image' && <img src={sale.paymentProof.url} alt={`Bukti pembayaran ${sale.id}`} loading="lazy" className="max-h-96 w-full rounded-md object-contain" onError={(event) => { event.currentTarget.style.display = 'none' }} />}
                          <span className="underline underline-offset-4">Buka bukti pembayaran</span>
                        </a>
                      ) : <div className="rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground">
                        Bukti pembayaran belum tersedia.
                      </div>}
                    </section>
                  )}
                  </>
                  )}
                </div>
                <DrawerFooter className="shrink-0 border-t">
                  <div className="grid grid-cols-2 gap-2">
                    <Button type="button" variant="outline">
                      Edit
                    </Button>
                    <Button type="button" variant="outline">
                      Delete
                    </Button>
                  </div>
                </DrawerFooter>
              </DrawerContent>
            </Drawer>
          </li>
        )})}
      </ul>
    </section>
  );
}
