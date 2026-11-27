import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { ArrowUpDown } from "lucide-react";
import { motion, Reorder } from "motion/react";
import { Button } from "@/components/ui/button";
import { SkeletonGroup, SkeletonRows } from "@/components/ui/skeleton";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { saveProductOrder } from "@/features/products/product-api";
import type { Product } from "@/features/products/sample-products";
import { useProductCatalog } from "@/features/products/use-product-catalog";
import type { useOrderProducts } from "./order-products";
import { OrderReorderItem } from "./order-reorder-item";
import { productKey } from "./order-store";

type DraftOrder = { original: string[]; order: string[] };

function sameOrder(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((key, index) => key === b[index]);
}

export function OrderProductReorderDrawer({
  branchId,
  orderCatalog,
  onSave,
  open: controlledOpen,
  onOpenChange,
  onCloseAutoFocus,
  branchNames,
}: {
  branchId?: string;
  orderCatalog?: ReturnType<typeof useOrderProducts>;
  onSave: () => void;
  onCloseAutoFocus?: (event: Event) => void;
  branchNames?: ReadonlyMap<string, string>;
} & ({
  open: boolean;
  onOpenChange: (open: boolean) => void;
} | {
  open?: never;
  onOpenChange?: never;
})) {
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState(new Map<string, DraftOrder>());
  const adminCatalog = useProductCatalog(branchId, !orderCatalog && (controlledOpen ?? open), "manual");
  const catalog = orderCatalog ?? adminCatalog;
  const catalogProducts = orderCatalog ? orderCatalog.data?.products : adminCatalog.data;
  const queryClient = useQueryClient();
  const saveOrder = useMutation({
    mutationFn: saveProductOrder,
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: ["products", "catalog"] }),
      queryClient.invalidateQueries({ queryKey: ["products", "order-catalog"] }),
    ]),
    meta: { toast: { success: "Urutan produk berhasil disimpan.", error: false } },
  });
  const error = isAxiosError<{ msg?: string }>(saveOrder.error)
    ? saveOrder.error.response?.data?.msg || "Gagal menyimpan urutan produk."
    : saveOrder.error?.message;
  const productsByScope = new Map<string, Product[]>();
  const productsByKey = new Map<string, Product>();
  for (const product of catalogProducts ?? []) {
    const scope = JSON.stringify([product.storeId, product.branchId]);
    const products = productsByScope.get(scope) ?? [];
    products.push(product);
    productsByScope.set(scope, products);
    productsByKey.set(productKey(product), product);
  }
  const groups = [...productsByScope].map(([scope, products]) => {
    const original = products.map(productKey);
    const draft = drafts.get(scope);
    const changed = !!draft && !sameOrder(draft.order, draft.original);
    const isCurrent = !draft || sameOrder(draft.original, original);
    return { scope, products, original, keys: isCurrent && draft ? draft.order : original, changed, isCurrent };
  });
  const orderIsCurrent = groups.every(({ isCurrent }) => isCurrent) &&
    [...drafts.keys()].every((scope) => productsByScope.has(scope));
  const orderChanged = groups.some(({ changed }) => changed);
  const disabled = !orderIsCurrent || catalog.isFetching || catalog.isError || saveOrder.isPending;

  function setDrawerOpen(next: boolean) {
    setDrafts(new Map());
    saveOrder.reset();
    if (onOpenChange) onOpenChange(next);
    else setOpen(next);
  }

  function updateDraft(scope: string, original: string[], order: string[]) {
    if (disabled) return;
    setDrafts((current) => new Map(current).set(scope, { original, order }));
  }

  function move(scope: string, original: string[], keys: string[], index: number, target: number) {
    const next = [...keys];
    [next[index], next[target]] = [next[target], next[index]];
    updateDraft(scope, original, next);
  }

  function save() {
    const order = groups.filter(({ changed }) => changed).flatMap(({ keys, products }) => {
      let position = 0;
      return keys.map((key, index) => {
        // The POS catalog omits inactive products, so reuse the visible positions.
        position += 1;
        if (orderCatalog) position = Math.max(position, products[index].sortOrder ?? 0);
        return { id: productsByKey.get(key)!.id, sort_order: position };
      });
    });
    saveOrder.mutate(order, {
      onSuccess: () => {
        onSave();
        setDrawerOpen(false);
      },
    });
  }

  return (
    <Drawer
      open={controlledOpen ?? open}
      autoFocus={controlledOpen !== undefined}
      dismissible={!saveOrder.isPending}
      onOpenChange={(next) => {
        if (!saveOrder.isPending) setDrawerOpen(next);
      }}
    >
      {controlledOpen === undefined && (
        <DrawerTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            aria-label="Atur urutan produk"
            title="Atur urutan produk"
          >
            <ArrowUpDown aria-hidden="true" />
          </Button>
        </DrawerTrigger>
      )}
      <DrawerContent onCloseAutoFocus={onCloseAutoFocus}>
        <DrawerHeader>
          <DrawerTitle>Atur urutan produk</DrawerTitle>
          <DrawerDescription>
            Seret atau gunakan tombol panah untuk memindahkan produk.
          </DrawerDescription>
        </DrawerHeader>
        <motion.div layoutScroll className="modal-body space-y-4">
          {catalog.isPending && (
            <SkeletonGroup label="Memuat produk">
              <SkeletonRows />
            </SkeletonGroup>
          )}
          {catalog.isError && (
            <div className="space-y-2">
              <p role="alert" className="text-destructive">Gagal memuat urutan produk.</p>
              <Button type="button" variant="outline" loading={catalog.isFetching} onClick={() => void catalog.refetch()}>
                Coba lagi
              </Button>
            </div>
          )}
          {catalog.isSuccess && groups.length === 0 && (
            <p className="text-muted-foreground">Belum ada produk.</p>
          )}
          {error && <p role="alert" className="text-destructive">{error}</p>}
          {!orderIsCurrent && !saveOrder.isPending && (
            <p role="alert" className="text-destructive">
              Daftar produk berubah. Buka kembali pengaturan urutan.
            </p>
          )}
          {groups.map(({ scope, products, original, keys }) => {
            const [first] = products;
            const name = first.branchName || branchNames?.get(first.branchId ?? "") || first.branchId || first.store;
            return (
              <div key={scope}>
                {groups.length > 1 && <h3 className="text-sm font-semibold">{name}</h3>}
                <Reorder.Group
                  axis="y"
                  values={keys}
                  onReorder={(next) => updateDraft(scope, original, next)}
                  className="divide-y"
                  aria-label={`Susun produk ${name}`}
                >
                  {keys.map((key, index) => {
                    const product = productsByKey.get(key)!;
                    return (
                      <OrderReorderItem
                        key={key}
                        value={key}
                        label={product.title}
                        description={product.categoryName || product.category}
                        disabled={disabled || keys.length < 2}
                        moveUp={index > 0 ? () => move(scope, original, keys, index, index - 1) : undefined}
                        moveDown={index < keys.length - 1 ? () => move(scope, original, keys, index, index + 1) : undefined}
                      />
                    );
                  })}
                </Reorder.Group>
              </div>
            );
          })}
        </motion.div>
        <DrawerFooter actions>
          <DrawerClose asChild>
            <Button type="button" variant="outline" disabled={saveOrder.isPending}>
              Batal
            </Button>
          </DrawerClose>
          <Button
            type="button"
            disabled={disabled || !orderChanged}
            loading={saveOrder.isPending}
            onClick={save}
          >
            Simpan
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
