import { ProductPrice } from "./product-price";
import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Package } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import type { Product } from "./sample-products";
import { cn } from "@/lib/cn";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateProductStatus } from "./product-api";
import { isAxiosError } from "axios";

export function ProductImage({
  product,
  detail = false,
}: {
  product: Product;
  detail?: boolean;
}) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const source =
    product.photo ||
    (product.image
      ? `https://images.unsplash.com/${product.image}?auto=format&fit=crop&w=640&q=80`
      : "");
  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden  aspect-square rounded",
        !detail && "bg-muted",
        detail && "p-4",
      )}
    >
      {!source || failedSource === source ? (
        <Package
          size={40}
          className="text-muted-foreground"
          aria-label={product.title}
        />
      ) : (
        <img
          src={source}
          alt={product.title}
          // width={640}
          // height={detail ? 480 : 640}
          loading="lazy"
          className={cn(
            "h-auto w-full object-cover aspect-square",
            !detail &&
              (!product.active
                ? "grayscale opacity-40"
                : product.stock === 0
                  ? "grayscale opacity-60"
                  : ""),
          )}
          onError={() => setFailedSource(source)}
        />
      )}
      {!detail && (
        <span
          className={cn(
            "absolute left-2 top-2 rounded px-2 py-1 text-xs font-medium",
            !product.active
              ? "bg-zinc-800 text-white"
              : product.stock === 0
                ? "bg-destructive text-white"
                : "bg-background/95 text-foreground",
          )}
        >
          {!product.active
            ? "Nonaktif"
            : product.stock === 0
              ? "Habis"
              : "Aktif"}
        </span>
      )}
    </div>
  );
}

function Stock({ product }: { product: Product }) {
  return (
    <span
      className={`shrink-0 text-xs ${product.stock === 0 ? "text-destructive" : "text-muted-foreground"}`}
    >
      {product.stock === 0 ? "Habis" : `${product.stock} tersisa`}
    </span>
  );
}

export function ProductCard({
  product,
  onUpdate,
}: {
  product: Product;
  onUpdate: (product: Product) => void;
}) {
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
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
            item.id === product.id ? { ...item, active } : item,
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
          className="w-full cursor-pointer text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={`Lihat detail ${product.title}`}
        >
          <ProductImage product={product} />
          <div className="space-y-1 pt-2">
            <h2 className="text-sm leading-5 font-medium text-foreground">
              {product.title}
            </h2>
            <div className="flex items-baseline justify-between gap-2">
              <ProductPrice product={product} />
              {/* <Stock product={product} /> */}
            </div>
          </div>
        </button>
      </DrawerTrigger>
      <DrawerContent className="product-drawer pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <div className="min-h-0 overflow-y-auto">
          <div className="relative mt-4">
            <ProductImage product={product} detail />
          </div>
          <div className="space-y-3 px-4 pt-5 pb-6">
            <DrawerTitle className="text-xl leading-7 font-semibold tracking-tight">
              {product.title}
            </DrawerTitle>
            <div className="flex items-baseline justify-between gap-4">
              <ProductPrice product={product} detail />
              <Stock product={product} />
            </div>
            <DrawerDescription className="pt-1 text-sm leading-6 whitespace-pre-wrap wrap-break-words">
              {product.description || "Belum ada deskripsi."}
            </DrawerDescription>
          </div>
        </div>
        <DrawerFooter className="shrink-0">
          <div className="grid grid-cols-2 gap-2">
            <Button asChild>
              <Link
                to="/produk/$productId/edit"
                params={{ productId: product.id }}
              >
                Edit produk
              </Link>
            </Button>
            <Dialog
              open={statusDialogOpen}
              onOpenChange={(open) => {
                if (!statusMutation.isPending) setStatusDialogOpen(open);
              }}
            >
              <DialogTrigger asChild>
                <Button variant="outline" disabled={statusMutation.isPending}>
                  {product.active ? "Nonaktifkan" : "Aktifkan"}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>
                    {product.active
                      ? "Nonaktifkan produk?"
                      : "Aktifkan produk?"}
                  </DialogTitle>
                  <DialogDescription className="mb-4">
                    Status {product.title} akan diubah menjadi{" "}
                    {product.active ? "nonaktif" : "aktif"}.
                  </DialogDescription>
                  <Button
                    type="button"
                    loading={statusMutation.isPending}
                    onClick={() => {
                      if (!statusMutation.isPending)
                        statusMutation.mutate(!product.active);
                    }}
                  >
                    {product.active ? "Nonaktifkan" : "Aktifkan"}
                  </Button>
                </DialogHeader>
              </DialogContent>
            </Dialog>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
