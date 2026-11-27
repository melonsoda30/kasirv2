import { ProductPrice } from "./product-price";
import { useId, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Ellipsis, Package } from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { SkeletonImage } from "@/components/ui/skeleton-image";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerTrigger,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import type { Product } from "./sample-products";
import { cn } from "@/lib/cn";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateProductStatus } from "./product-api";
import { ProductCopyDrawer } from "./product-copy-drawer";
import { isLowStockQuantity } from "./product-stock";
import { isAxiosError } from "axios";

export function ProductImage({
  product,
  detail = false,
  showActiveStatus = true,
}: {
  product: Product;
  detail?: boolean;
  showActiveStatus?: boolean;
}) {
  const source =
    product.photo ||
    (product.image
      ? `https://images.unsplash.com/${product.image}?auto=format&fit=crop&w=640&q=80`
      : "");
  const outOfStock =
    product.active && product.useStock !== false && product.stock <= 0;
  return (
    <div
      className={cn(
        "relative flex aspect-square items-center justify-center overflow-hidden",
        !detail && "rounded-t-[calc(var(--radius-2xl)-1px)] bg-muted",
        detail && "rounded p-4",
      )}
    >
      <SkeletonImage
        src={source}
        alt={product.title}
        loading="lazy"
        className="aspect-square"
        imageClassName={cn(
          "size-full object-cover",
          !detail && !product.active && "grayscale opacity-40",
          !detail && outOfStock && "grayscale opacity-60",
        )}
        fallback={
          <Package
            size={40}
            className="text-muted-foreground"
            aria-label={product.title}
          />
        }
      />
      {!detail && outOfStock && (
        <StatusBadge tone="danger" className="absolute top-2 left-2">
          Habis
        </StatusBadge>
      )}
      {showActiveStatus && !detail && !outOfStock && (
        <span
          className={cn(
            "absolute left-2 top-2 rounded px-2 py-1 text-xs font-medium",
            !product.active && "bg-zinc-800 text-white",
            product.active && "bg-background/95 text-foreground",
          )}
        >
          {!product.active && "Nonaktif"}
          {product.active && "Aktif"}
        </span>
      )}
    </div>
  );
}

function Stock({ product }: { product: Product }) {
  if (product.useStock === false)
    return (
      <span className="shrink-0 text-xs text-muted-foreground">Tanpa stok</span>
    );
  if (product.stock <= 0)
    return (
      <StatusBadge tone="danger" className="shrink-0">
        Stok habis
      </StatusBadge>
    );
  if (product.active && isLowStockQuantity(product.stock)) {
    return (
      <StatusBadge tone="warning" className="shrink-0">
        Hampir habis · {product.stock}
      </StatusBadge>
    );
  }
  return (
    <span className="shrink-0 text-xs text-muted-foreground">
      {product.stock} tersisa
    </span>
  );
}

export function ProductCard({
  product,
  branchName,
  onUpdate,
}: {
  product: Product;
  branchName?: string;
  onUpdate: (product: Product) => void;
}) {
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [drawerContainer, setDrawerContainer] = useState<HTMLDivElement | null>(
    null,
  );
  const optionsButton = useRef<HTMLButtonElement>(null);
  const stockId = useId();
  const queryClient = useQueryClient();
  const statusMutation = useMutation({
    mutationFn: async (active: boolean) => {
      await queryClient.cancelQueries({ queryKey: ["products", "catalog"] });
      return updateProductStatus(product.id, active);
    },
    meta: { toast: false },
    onError: (error) => {
      const message = isAxiosError<{ msg?: string }>(error)
        ? error.response?.data?.msg
        : error.message;
      toast.error(
        message || "Gagal mengubah status produk. Silakan coba lagi.",
      );
    },
    onSuccess: (message, active) => {
      onUpdate({ ...product, active });
      queryClient.setQueriesData<Product[]>(
        { queryKey: ["products", "catalog"] },
        (items) =>
          items?.map((item) =>
            item.id === product.id && item.branchId === product.branchId ? { ...item, active } : item,
          ),
      );
      setStatusDialogOpen(false);
      toast.success(message);
      void queryClient.invalidateQueries({ queryKey: ["products", "catalog"] });
    },
  });

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <button
          type="button"
          className="flex h-full w-full cursor-pointer flex-col rounded-2xl text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Lihat detail ${product.title}${branchName ? ` di ${branchName}` : ""}`}
          aria-describedby={stockId}
        >
          <div className="w-full">
            <ProductImage product={product} />
          </div>
          <div className="flex w-full flex-1 flex-col justify-between gap-1 p-3">
            <div className="space-y-0.5">
              <h2 className="text-sm leading-5 font-medium text-foreground">
                {product.title}
              </h2>
              {branchName && (
                <p className="wrap-anywhere text-xs text-muted-foreground">{branchName}</p>
              )}
            </div>
            <div className="flex flex-col items-start gap-1">
              <ProductPrice product={product} />
              <div id={stockId}>
                <Stock product={product} />
              </div>
            </div>
          </div>
        </button>
      </DrawerTrigger>
      <DrawerContent ref={setDrawerContainer}>
        <DrawerHeader>
          <DrawerTitle className="wrap-break-words">
            {product.title}
          </DrawerTitle>
          {branchName && (
            <p className="wrap-anywhere text-sm text-muted-foreground">{branchName}</p>
          )}
        </DrawerHeader>
        <DrawerBody className="space-y-3">
          <ProductImage product={product} detail />
          <div className="flex items-baseline justify-between gap-4">
            <ProductPrice product={product} detail />
            <Stock product={product} />
          </div>
          <DrawerDescription className="leading-6 whitespace-pre-wrap wrap-break-words">
            {product.description || "Belum ada deskripsi."}
          </DrawerDescription>
        </DrawerBody>
        <DrawerFooter>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-2">
            <Button asChild className="min-w-0 whitespace-normal">
              <Link
                to="/produk/$productId/edit"
                params={{ productId: product.id }}
                search={{ branch: product.branchId || undefined }}
              >
                Edit produk
              </Link>
            </Button>
            <ProductCopyDrawer product={product} />
            <Dialog
              open={statusDialogOpen}
              onOpenChange={(open) => {
                if (!statusMutation.isPending) setStatusDialogOpen(open);
              }}
            >
              <DropdownMenu.Root modal={false}>
                <DropdownMenu.Trigger asChild>
                  <Button
                    ref={optionsButton}
                    type="button"
                    variant="outline"
                    size="icon"
                    className="size-11"
                    aria-label="Opsi produk"
                    disabled={statusMutation.isPending}
                  >
                    <Ellipsis aria-hidden="true" />
                  </Button>
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal container={drawerContainer}>
                  <DropdownMenu.Content
                    side="top"
                    align="end"
                    sideOffset={6}
                    className="z-50 min-w-40 rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10"
                    onCloseAutoFocus={(event) => {
                      if (statusDialogOpen) event.preventDefault();
                    }}
                    data-vaul-no-drag=""
                  >
                    <DropdownMenu.Item
                      className="flex min-h-9 cursor-pointer items-center rounded-md px-3 text-sm outline-none data-highlighted:bg-muted"
                      onSelect={() => setStatusDialogOpen(true)}
                    >
                      {product.active ? "Nonaktifkan" : "Aktifkan"}
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
              <DialogContent
                closeDisabled={statusMutation.isPending}
                onCloseAutoFocus={(event) => {
                  event.preventDefault();
                  optionsButton.current?.focus();
                }}
              >
                <DialogHeader>
                  <DialogTitle>
                    {product.active
                      ? "Nonaktifkan produk?"
                      : "Aktifkan produk?"}
                  </DialogTitle>
                  <DialogDescription>
                    Status {product.title} akan diubah menjadi{" "}
                    {product.active ? "nonaktif" : "aktif"}.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={statusMutation.isPending}
                    >
                      Batal
                    </Button>
                  </DialogClose>
                  <Button
                    type="button"
                    variant={product.active ? "destructive" : "default"}
                    loading={statusMutation.isPending}
                    onClick={() => {
                      if (!statusMutation.isPending)
                        statusMutation.mutate(!product.active);
                    }}
                  >
                    {product.active ? "Nonaktifkan" : "Aktifkan"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
