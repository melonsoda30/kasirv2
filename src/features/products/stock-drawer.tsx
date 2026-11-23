import { useId, useLayoutEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { ArrowDownUp, ChevronRight, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
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

type StockStep = "history" | "mutation" | "reset" | "confirm-reset";

const actionClassName = "min-w-0 cursor-pointer items-start justify-start gap-3 rounded-xl px-3 text-left whitespace-normal";

export function StockDrawer({
  item,
  children,
}: {
  item: StockRecord;
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
  if (step === "mutation") title = "Mutasi stok";
  if (step === "reset") title = "Reset stok";
  if (confirmingReset) title = "Konfirmasi reset stok";
  let submitLabel = "Simpan";
  if (step === "reset") submitLabel = "Lanjutkan";
  if (confirmingReset) submitLabel = "Reset stok";
  const [change, setChange] = useState("");
  const [note, setNote] = useState("");
  const history = [...item.history].sort((first, second) =>
    second.at.localeCompare(first.at),
  );
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
          aria-label={`Histori stok ${item.product_name}`}
          className="bento-surface flex h-full w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
        >
          {children}
        </button>
      </DrawerTrigger>
      <DrawerContent className="product-drawer pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <DrawerHeader className="shrink-0">
          <DrawerTitle ref={titleRef} tabIndex={-1}>{title}</DrawerTitle>
          <DrawerDescription>{item.product_name}</DrawerDescription>
        </DrawerHeader>
        {step === "history" && (
          <div className="flow-panel min-h-0 space-y-4 overflow-y-auto px-4 pb-4">
            {currentStock}
            <div className="grid gap-2 sm:grid-cols-2">
              <Button
                type="button"
                className={actionClassName}
                aria-labelledby={`${id}-mutation-label`}
                aria-describedby={`${id}-mutation-description`}
                onClick={() => setStep("mutation")}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary-foreground/15">
                  <ArrowDownUp aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span id={`${id}-mutation-label`} className="block font-semibold">
                    Mutasi stok
                  </span>
                  <span id={`${id}-mutation-description`} className="block text-xs font-normal text-primary-foreground/85">
                    Tambah atau kurangi stok. Perubahan dicatat dalam riwayat.
                  </span>
                </span>
                <ChevronRight className="self-center" aria-hidden="true" />
              </Button>
              <Button
                type="button"
                variant="outline"
                className={actionClassName}
                aria-labelledby={`${id}-reset-label`}
                aria-describedby={`${id}-reset-description`}
                onClick={() => setStep("reset")}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-destructive/10 text-destructive">
                  <RotateCcw aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span id={`${id}-reset-label`} className="block font-semibold">
                    Reset stok
                  </span>
                  <span id={`${id}-reset-description`} className="block text-xs font-normal text-muted-foreground">
                    Ganti stok dengan jumlah yang dimasukkan. Riwayat stok sebelumnya akan dihapus.
                  </span>
                </span>
                <ChevronRight className="self-center text-muted-foreground" aria-hidden="true" />
              </Button>
            </div>
            {history.length === 0 && (
              <p className="text-muted-foreground">Belum ada histori stok.</p>
            )}
            {history.length > 0 && (
              <ul className="divide-y rounded-md border">
                {history.map((entry, index) => (
                  <li
                    key={JSON.stringify([entry.at, entry.by_id, index])}
                    className="flex justify-between gap-3 p-3"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="font-medium">
                        {entry.type === "mutasi" ? "Mutasi stok" : entry.type}
                      </p>
                      <p className="text-muted-foreground">
                        Stok {entry.before} → {entry.after}
                      </p>
                      {entry.note && <p className="break-words">{entry.note}</p>}
                      <p className="text-xs text-muted-foreground">
                        <time dateTime={entry.at.replace(" ", "T")}>
                          {entry.at}
                        </time>
                      </p>
                    </div>
                    <span className={cn("font-medium", entry.delta < 0 && "text-destructive")}>
                      {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
        {step !== "history" && (
          <>
            <form
              key={step}
              id={formId}
              onSubmit={submit}
              className="flow-panel min-h-0 space-y-4 overflow-y-auto px-4 pb-4"
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
            <DrawerFooter className="shrink-0 border-t">
              <div className="grid grid-cols-2 gap-2">
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
