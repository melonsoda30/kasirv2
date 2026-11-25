import { useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { ArrowDownUp, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { updateProductStock, type StockRecord } from "./stock-api";
import { StockHistory } from "./stock-history";

type StockStep = "history" | "mutation" | "reset" | "confirm-reset";

export function StockDrawer({
  item,
  branchName,
  children,
}: {
  item: StockRecord;
  branchName?: string;
  children: ReactNode;
}) {
  const id = useId();
  const formId = `${id}-form`;
  const inputId = `${id}-quantity`;
  const noteId = `${id}-note`;
  const [step, setStep] = useState<StockStep>("history");
  const titleRef = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  const confirmingReset = step === "confirm-reset";
  const resettingStock = step === "reset" || confirmingReset;
  let title = "Histori stok";
  if (step === "mutation") title = "Perbarui stok";
  if (step === "reset") title = "Reset stok";
  if (confirmingReset) title = "Konfirmasi reset stok";
  let submitLabel = "Simpan";
  if (step === "reset") submitLabel = "Lanjutkan";
  if (confirmingReset) submitLabel = "Reset stok";
  const [change, setChange] = useState("");
  const [note, setNote] = useState("");
  const quantity = Number(change);
  const validQuantity =
    /^[+-]?\d+$/.test(change.trim()) &&
    Number.isSafeInteger(quantity) &&
    (resettingStock ? quantity >= 0 : quantity !== 0);
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: updateProductStock,
    meta: { toast: false },
    onSuccess: async (message) => {
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      returnToHistory();
      toast.success(message);
    },
    onError: (error) => {
      toast.error(
        isAxiosError<{ msg?: string }>(error)
          ? error.response?.data?.msg || "Gagal menyimpan perubahan stok."
          : error.message,
      );
    },
  });

  useLayoutEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    titleRef.current?.focus({ preventScroll: true });
  }, [step]);

  function returnToHistory() {
    setStep("history");
    setChange("");
    setNote("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step === "history" || !validQuantity || update.isPending) return;
    if (step === "reset") {
      setStep("confirm-reset");
      return;
    }

    update.mutate({
      action: confirmingReset ? "set_stock" : "mutasi_stock",
      product_sku: item.product_sku,
      quantity,
      note: note.trim(),
    });
  }

  const currentStock = (
    <p className="flex items-baseline justify-between gap-3 font-medium">
      <span>Stok saat ini</span>
      <span className="text-lg font-semibold tabular-nums">{item.quantity}</span>
    </p>
  );

  return (
    <Drawer
      dismissible={!update.isPending}
      onOpenChange={(open) => {
        if (!open) returnToHistory();
      }}
    >
      <DrawerTrigger asChild>
        <button
          type="button"
          aria-label={`Histori stok ${item.product_name}${branchName ? ` di ${branchName}` : ""}`}
          className="bento-surface flex h-full w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
        >
          {children}
        </button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle ref={titleRef} tabIndex={-1}>{title}</DrawerTitle>
          <DrawerDescription className="break-words">{item.product_name}</DrawerDescription>
        </DrawerHeader>
        {step === "history" && (
          <>
            <StockHistory item={item} />
            <DrawerFooter>
              <div className="modal-actions">
                <Button type="button" variant="outline" onClick={() => setStep("reset")}>
                  <RotateCcw aria-hidden="true" /> Reset stok
                </Button>
                <Button type="button" onClick={() => setStep("mutation")}>
                  <ArrowDownUp aria-hidden="true" /> Perbarui stok
                </Button>
              </div>
            </DrawerFooter>
          </>
        )}
        {step !== "history" && (
          <>
            <form
              key={step}
              id={formId}
              onSubmit={submit}
              className="modal-body flow-panel space-y-4"
            >
              {confirmingReset && (
                <div className="space-y-3 rounded-xl border p-3">
                  <dl className="grid grid-cols-2 gap-3">
                    <div>
                      <dt className="text-xs text-muted-foreground">Stok saat ini</dt>
                      <dd className="text-lg font-semibold tabular-nums">{item.quantity}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Stok baru</dt>
                      <dd className="text-lg font-semibold tabular-nums">{quantity}</dd>
                    </div>
                  </dl>
                  <p className="text-sm text-destructive">Riwayat stok produk ini akan dihapus.</p>
                </div>
              )}
              {!confirmingReset && (
                <>
                  {currentStock}
                  {resettingStock && (
                    <p className="rounded-lg bg-destructive-muted p-3 text-sm text-destructive">
                      Riwayat stok sebelumnya akan dihapus setelah reset dikonfirmasi.
                    </p>
                  )}
                  <div className="space-y-2">
                    <label htmlFor={inputId} className="block font-medium">
                      {resettingStock ? "Jumlah stok baru" : "Perubahan stok"}
                    </label>
                    <Input
                      id={inputId}
                      inputMode={resettingStock ? "numeric" : undefined}
                      value={change}
                      disabled={update.isPending}
                      placeholder={resettingStock ? "Contoh: 10" : "10 atau -10"}
                      onChange={(event) => setChange(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <label htmlFor={noteId} className="block font-medium">
                      Catatan
                    </label>
                    <Textarea
                      id={noteId}
                      name="note"
                      value={note}
                      disabled={update.isPending}
                      placeholder="Catatan (opsional)"
                      onChange={(event) => setNote(event.target.value)}
                    />
                  </div>
                </>
              )}
            </form>
            <DrawerFooter>
              <div className="modal-actions">
                <Button
                  type="button"
                  variant="outline"
                  disabled={update.isPending}
                  onClick={confirmingReset ? () => setStep("reset") : returnToHistory}
                >
                  {confirmingReset ? "Kembali" : "Batal"}
                </Button>
                <Button
                  type="submit"
                  form={formId}
                  variant={confirmingReset ? "destructive" : "default"}
                  loading={update.isPending}
                  disabled={!validQuantity}
                >
                  {submitLabel}
                </Button>
              </div>
            </DrawerFooter>
          </>
        )}
      </DrawerContent>
    </Drawer>
  );
}
