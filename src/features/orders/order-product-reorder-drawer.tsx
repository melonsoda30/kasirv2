import { useState } from "react";
import { ArrowUpDown } from "lucide-react";
import { motion, Reorder } from "motion/react";
import { Button } from "@/components/ui/button";
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
import type { Product } from "@/features/products/sample-products";
import { sortOrderProducts } from "./order-products";
import { OrderReorderItem } from "./order-reorder-item";
import { productKey } from "./order-store";

export function OrderProductReorderDrawer({
  products,
  order,
  onSave,
  open: controlledOpen,
  onOpenChange,
  onCloseAutoFocus,
  branchNames,
}: {
  products: readonly Product[];
  order: readonly string[];
  onSave: (order: string[]) => void;
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
  const [draftOrder, setDraftOrder] = useState<string[] | null>(null);
  const orderedProducts = sortOrderProducts(
    products,
    "custom",
    draftOrder ?? order,
  );
  const keys = orderedProducts.map(productKey);
  const canReorder = keys.length > 1;

  function changeOpen(next: boolean) {
    setDraftOrder(null);
    if (onOpenChange) onOpenChange(next);
    else setOpen(next);
  }

  function move(index: number, target: number) {
    const next = [...keys];
    [next[index], next[target]] = [next[target], next[index]];
    setDraftOrder(next);
  }

  return (
    <Drawer
      open={controlledOpen ?? open}
      autoFocus={controlledOpen !== undefined}
      onOpenChange={changeOpen}
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
        <motion.div layoutScroll className="modal-body">
          {!keys.length && (
            <p className="text-muted-foreground">Belum ada produk.</p>
          )}
          {keys.length > 0 && (
            <Reorder.Group
              axis="y"
              values={keys}
              onReorder={setDraftOrder}
              className="divide-y"
              aria-label="Susun produk"
            >
              {orderedProducts.map((product, index) => (
                <OrderReorderItem
                  key={keys[index]}
                  value={keys[index]}
                  label={product.title}
                  description={[
                    product.categoryName || product.category,
                    branchNames && (product.branchName || branchNames.get(product.branchId ?? "") || product.branchId),
                  ].filter(Boolean).join(" · ")}
                  disabled={!canReorder}
                  moveUp={index > 0 ? () => move(index, index - 1) : undefined}
                  moveDown={
                    index < keys.length - 1
                      ? () => move(index, index + 1)
                      : undefined
                  }
                />
              ))}
            </Reorder.Group>
          )}
        </motion.div>
        <DrawerFooter actions>
          <DrawerClose asChild>
            <Button type="button" variant="outline">
              Batal
            </Button>
          </DrawerClose>
          <Button
            type="button"
            disabled={!canReorder || !draftOrder}
            onClick={() => {
              onSave(keys);
              changeOpen(false);
            }}
          >
            Simpan
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
