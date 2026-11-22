import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { ArrowDown, ArrowUp, GripVertical, ListOrdered } from "lucide-react";
import { motion, Reorder, useDragControls } from "motion/react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { editCategory, type Category } from "@/features/products/category-api";
import type { useProductCategories } from "@/features/products/use-product-categories";

type DrawerProps =
  | { source: "store"; query: ReturnType<typeof useProductCategories> }
  | {
      source: "local";
      categories: Category[];
      onSave: (order: string[]) => void;
    };

function ReorderCategory({
  category,
  disabled,
  moveUp,
  moveDown,
}: {
  category: Category;
  disabled: boolean;
  moveUp?: () => void;
  moveDown?: () => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={category.category_id ?? category.category_slug}
      dragListener={false}
      dragControls={controls}
      aria-label={category.category_name}
      aria-disabled={disabled || undefined}
      className="relative flex items-center gap-2 bg-popover py-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      <div className="min-w-0 flex-1">
        <p className="break-words font-medium">{category.category_name}</p>
        <p className="text-xs text-muted-foreground">
          {category.product_count} produk
        </p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={disabled || !moveUp}
        aria-label={`Naikkan ${category.category_name}`}
        onClick={moveUp}
      >
        <ArrowUp aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={disabled || !moveDown}
        aria-label={`Turunkan ${category.category_name}`}
        onClick={moveDown}
      >
        <ArrowDown aria-hidden="true" />
      </Button>
      <span
        aria-hidden="true"
        className={buttonVariants({
          variant: "outline",
          size: "icon",
          className: "touch-none cursor-grab active:cursor-grabbing",
        })}
        data-vaul-no-drag=""
        onPointerDown={(event) => {
          if (!disabled) controls.start(event);
        }}
      >
        <GripVertical />
      </span>
    </Reorder.Item>
  );
}

export function OrderCategoryReorderDrawer(props: DrawerProps) {
  const [open, setOpen] = useState(false);
  const [draftOrder, setDraftOrder] = useState<
    Category["category_id"][] | null
  >(null);
  const query = props.source === "store" ? props.query : undefined;
  const currentOrder =
    props.source === "local" ? props.categories : (props.query.data ?? []);
  const categoriesById = new Map(
    currentOrder.map((category) => [category.category_id, category]),
  );
  const orderedCategories = draftOrder
    ? draftOrder
        .map((id) => categoriesById.get(id))
        .filter((category) => category !== undefined)
    : currentOrder;
  const canReorder =
    currentOrder.length > 1 &&
    currentOrder.every((category) => category.category_id !== null);
  const orderIsCurrent = orderedCategories.length === currentOrder.length;
  const orderChanged = orderedCategories.some(
    (category, index) => category !== currentOrder[index],
  );
  const queryClient = useQueryClient();
  const saveOrder = useMutation({
    mutationFn: async (order: Category[]) => {
      if (props.source === "local") {
        props.onSave(order.map(({ category_slug }) => category_slug));
        return;
      }
      for (const [index, category] of order.entries()) {
        const sortOrder = index + 1;
        if (
          category.category_id !== null &&
          category.category_sort !== sortOrder
        ) {
          await editCategory(category.category_id, {
            name: category.category_name,
            sort_order: sortOrder,
          });
        }
      }
    },
    onSettled: () =>
      props.source === "store"
        ? queryClient.invalidateQueries({ queryKey: ["product-categories"] })
        : undefined,
    onSuccess: () => {
      setDraftOrder(null);
      setOpen(false);
    },
  });
  const error = isAxiosError<{ msg?: string }>(saveOrder.error)
    ? saveOrder.error.response?.data?.msg || "Gagal menyimpan urutan kategori."
    : saveOrder.error?.message;
  const disabled = !canReorder || !orderIsCurrent || saveOrder.isPending;

  function move(index: number, target: number) {
    const next = orderedCategories.map((category) => category.category_id);
    [next[index], next[target]] = [next[target], next[index]];
    setDraftOrder(next);
  }

  return (
    <Drawer
      open={open}
      dismissible={!saveOrder.isPending}
      onOpenChange={(next) => {
        if (saveOrder.isPending) return;
        setDraftOrder(null);
        saveOrder.reset();
        setOpen(next);
      }}
    >
      <DrawerTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="shrink-0"
          aria-label="Atur urutan kategori"
        >
          <ListOrdered aria-hidden="true" />
        </Button>
      </DrawerTrigger>
      <DrawerContent
        aria-describedby={undefined}
        className="product-drawer pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
      >
        <DrawerHeader className="shrink-0">
          <DrawerTitle>Atur urutan kategori</DrawerTitle>
        </DrawerHeader>
        <motion.div
          layoutScroll
          className="min-h-0 space-y-6 overflow-y-auto px-4 py-4"
        >
          {query?.isPending && <p role="status">Memuat kategori...</p>}
          {query?.isError && (
            <div className="space-y-2">
              <p role="alert" className="text-destructive">
                Gagal memuat daftar kategori.
              </p>
              <Button
                type="button"
                variant="outline"
                loading={query.isFetching}
                onClick={() => void query.refetch()}
              >
                Coba lagi
              </Button>
            </div>
          )}
          {!currentOrder.length &&
            (props.source === "local" || query?.isSuccess) && (
              <p className="text-muted-foreground">Belum ada kategori.</p>
            )}
          {currentOrder.length === 1 && (
            <p className="text-muted-foreground">
              Perlu minimal dua kategori untuk mengubah urutan.
            </p>
          )}
          {error && (
            <p role="alert" className="text-destructive">
              {error}
            </p>
          )}
          {!orderIsCurrent && (
            <p role="alert" className="text-destructive">
              Daftar kategori berubah. Buka kembali pengaturan urutan.
            </p>
          )}
          {orderedCategories.length > 0 && (
            <Reorder.Group
              axis="y"
              values={orderedCategories.map(
                (category) => category.category_id ?? category.category_slug,
              )}
              onReorder={(next) => {
                if (!disabled) setDraftOrder(next);
              }}
              className="divide-y"
              aria-label="Susun kategori"
            >
              {orderedCategories.map((category, index) => (
                <ReorderCategory
                  key={category.category_slug}
                  category={category}
                  disabled={disabled}
                  moveUp={index > 0 ? () => move(index, index - 1) : undefined}
                  moveDown={
                    index < orderedCategories.length - 1
                      ? () => move(index, index + 1)
                      : undefined
                  }
                />
              ))}
            </Reorder.Group>
          )}
        </motion.div>
        <DrawerFooter className="shrink-0 border-t">
          <div className="grid grid-cols-2 gap-2">
            <DrawerClose asChild>
              <Button
                type="button"
                variant="outline"
                disabled={saveOrder.isPending}
              >
                Batal
              </Button>
            </DrawerClose>
            <Button
              type="button"
              disabled={
                disabled ||
                (!orderChanged && !error) ||
                query?.isFetching ||
                query?.isError
              }
              loading={saveOrder.isPending}
              onClick={() => saveOrder.mutate(orderedCategories)}
            >
              Simpan
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
