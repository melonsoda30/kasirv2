import { useEffect, useId, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { InputNominal } from "@/components/input-nominal";
import { SelectCombobox } from "@/components/select-combobox";
import { Button } from "@/components/ui/button";
import {
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  NestedDrawer,
} from "@/components/ui/drawer";
import { getAccountBranches, useAuthStore } from "@/features/auth/auth-store";
import { copyProductToBranch, getProductCopyDestinations, type CopyProductInput } from "./product-copy";
import { isValidProductStock } from "./product-schema";
import { ProductStockToggle } from "./product-stock-toggle";
import { useProductCatalog } from "./use-product-catalog";
import type { Product } from "./sample-products";

export function ProductCopyDrawer({ product }: { product: Product }) {
  const id = useId();
  const formId = `${id}-form`;
  const branchInputId = `${id}-branch`;
  const stockInputId = `${id}-stock`;
  const stockErrorId = `${id}-stock-error`;
  const [open, setOpen] = useState(false);
  const [branchId, setBranchId] = useState("");
  const [useStock, setUseStock] = useState(product.useStock ?? true);
  const [stock, setStock] = useState("0");
  const cancelButton = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();
  const store = useAuthStore((state) => state.session?.account.store);
  const catalog = useProductCatalog(undefined, open);
  const branches = getAccountBranches(store);
  const sourceId = product.branchId || product.storeId;
  const source = branches.find(({ id }) => id === sourceId)?.name ?? (product.branchId || product.store);
  const destinations = getProductCopyDestinations(product, catalog.data ?? [], branches);
  const validDestination = catalog.isSuccess && destinations.some(({ id }) => id === branchId);
  const invalidStock = useStock && !isValidProductStock(stock);

  const copy = useMutation({
    mutationFn: (input: CopyProductInput) => copyProductToBranch(product, input),
    meta: { toast: false },
    onSuccess: async (branchName) => {
      toast.success(`${product.title} berhasil ditambahkan ke ${branchName}.`);
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    },
  });
  const errorMessage = isAxiosError<{ msg?: string }>(copy.error)
    ? copy.error.response?.data?.msg || "Gagal menyalin produk. Silakan coba lagi."
    : copy.error?.message;

  useEffect(() => {
    // Close through Vaul so it restores the parent drawer after saving.
    if (open && copy.isSuccess) cancelButton.current?.click();
  }, [copy.isSuccess, open]);

  return (
    <NestedDrawer
      open={open}
      dismissible={!copy.isPending}
      onOpenChange={(next) => {
        if (next) {
          copy.reset();
          setBranchId("");
          setUseStock(product.useStock ?? true);
          setStock("0");
        }
        setOpen(next);
      }}
    >
      <DrawerTrigger asChild>
        <Button type="button" variant="outline" className="min-w-0 whitespace-normal">Salin ke cabang</Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Salin produk</DrawerTitle>
          <DrawerDescription>{product.title} · {source}</DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          {catalog.isPending && <p role="status" className="text-muted-foreground">Memuat cabang tujuan…</p>}
          {catalog.isError && (
            <div className="space-y-2">
              <p role="alert" className="text-destructive">Gagal memuat ketersediaan produk.</p>
              <Button type="button" variant="outline" loading={catalog.isFetching} onClick={() => void catalog.refetch()}>Coba lagi</Button>
            </div>
          )}
          {catalog.isSuccess && destinations.length === 0 && (
            <p className="text-sm text-muted-foreground">Tidak ada cabang tujuan yang tersedia untuk produk ini.</p>
          )}
          {catalog.isSuccess && destinations.length > 0 && (
            <form
              id={formId}
              onSubmit={(event) => {
                event.preventDefault();
                if (!validDestination || invalidStock || copy.isPending) return;
                copy.mutate({ branchId, useStock, stock });
              }}
            >
              <fieldset disabled={copy.isPending} className="min-w-0 space-y-4">
                <div className="space-y-2">
                  <label htmlFor={branchInputId} className="text-sm font-medium">Cabang tujuan</label>
                  <SelectCombobox
                    id={branchInputId}
                    aria-label="Cabang tujuan"
                    options={destinations.map(({ id, name }) => ({ value: id, label: name }))}
                    placeholder="Pilih cabang"
                    emptyMessage="Tidak ada cabang yang cocok."
                    disabled={copy.isPending}
                    value={validDestination ? branchId : ""}
                    onChange={(value) => {
                      setBranchId(value);
                      copy.reset();
                    }}
                  />
                </div>
                <ProductStockToggle
                  checked={useStock}
                  onChange={(event) => setUseStock(event.target.checked)}
                />
                {useStock && (
                  <div className="space-y-2">
                    <label htmlFor={stockInputId} className="text-sm font-medium">Stok awal</label>
                    <InputNominal
                      id={stockInputId}
                      value={stock}
                      onValueChange={setStock}
                      aria-required
                      aria-invalid={invalidStock}
                      aria-describedby={invalidStock ? stockErrorId : undefined}
                    />
                    {invalidStock && (
                      <p id={stockErrorId} className="text-sm text-destructive">Isi stok awal dengan bilangan bulat 0 atau lebih.</p>
                    )}
                  </div>
                )}
              </fieldset>
            </form>
          )}
          {errorMessage && <p role="alert" className="mt-3 text-sm text-destructive">{errorMessage}</p>}
        </DrawerBody>
        <DrawerFooter actions>
          <DrawerClose asChild>
            <Button ref={cancelButton} type="button" variant="outline" disabled={copy.isPending}>Batal</Button>
          </DrawerClose>
          <Button type="submit" form={formId} loading={copy.isPending} disabled={!validDestination || invalidStock}>
            Salin produk
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </NestedDrawer>
  );
}
