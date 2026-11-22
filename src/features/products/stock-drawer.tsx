import { useId, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { updateProductStock, type StockRecord } from "./stock-api";

export function StockDrawer({
  item,
  children,
}: {
  item: StockRecord;
  children: ReactNode;
}) {
  const inputId = useId();
  const noteId = useId();
  const [mode, setMode] = useState<"mutasi_stock" | "set_stock" | null>(null);
  const settingStock = mode === "set_stock";
  const [change, setChange] = useState("");
  const [note, setNote] = useState("");
  const history = [...item.history].sort((first, second) =>
    second.at.localeCompare(first.at),
  );
  const quantity = Number(change);
  const validQuantity =
    /^[+-]?\d+$/.test(change.trim()) &&
    Number.isSafeInteger(quantity) &&
    (settingStock ? quantity >= 0 : quantity !== 0);
  const queryClient = useQueryClient();
  const update = useMutation({
    mutationFn: updateProductStock,
    meta: { toast: false },
    onSuccess: async (message) => {
      setMode(null);
      setChange("");
      setNote("");
      toast.success(message);
      await queryClient.invalidateQueries({ queryKey: ["products"] });
    },
    onError: (error) => {
      toast.error(
        isAxiosError<{ msg?: string }>(error)
          ? error.response?.data?.msg || "Gagal menyimpan perubahan stok."
          : error.message,
      );
    },
  });

  return (
    <Drawer
      dismissible={!update.isPending}
      onOpenChange={(open) => {
        if (!open) {
          setMode(null);
          setChange("");
          setNote("");
        }
      }}
    >
      <DrawerTrigger asChild>
        <button
          type="button"
          aria-label={`Histori stok ${item.product_name}`}
          className="flex w-full items-center gap-3 rounded-lg border bg-card p-3 text-left hover:bg-muted/50 focus-visible:outline-2 focus-visible:outline-ring"
        >
          {children}
        </button>
      </DrawerTrigger>
      <DrawerContent className="pb-[env(safe-area-inset-bottom)]">
        <DrawerHeader>
          <DrawerTitle>Histori stok</DrawerTitle>
          <DrawerDescription>{item.product_name}</DrawerDescription>
        </DrawerHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto px-4 pb-4">
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
                  <span
                    className={
                      cn(
                      entry.delta < 0
                        ? "font-medium text-destructive"
                        : "font-medium",
                    )
                    }
                  >
                    {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <p className="font-medium">Stok saat ini: {item.quantity}</p>
          {mode && (
            <>
              <div className="space-y-2">
                <label htmlFor={inputId} className="block font-medium">
                  {settingStock ? "Jumlah stok akhir" : "Perubahan stok"}
                </label>
                <Input
                  id={inputId}
                  value={change}
                  disabled={update.isPending}
                  placeholder={settingStock ? "Contoh: 10" : "10 atau -10"}
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
          <div className="flex  flex-wrap gap-2">
            {!mode && (
              <>
                <Button type="button" disabled={update.isPending} onClick={() => setMode("mutasi_stock")} className="flex-1">
                  Mutasi stok
                </Button>
                <Button type="button" variant="outline" disabled={update.isPending} onClick={() => setMode("set_stock")} className="flex-1">
                  Set stok
                </Button>
              </>
            )}
            {mode && (
              <>
                <Button
                  type="button"
                  className="flex-1"
                  loading={update.isPending}
                  disabled={!validQuantity}
                  onClick={() =>
                    update.mutate({
                      action: mode,
                      product_sku: item.product_sku,
                      quantity,
                      note: note.trim(),
                    })
                  }
                >
                  Simpan
                </Button>
                <Button
                  type="button"
                  disabled={update.isPending}
                  onClick={() => {
                    setMode(null);
                    setChange("");
                    setNote("");
                  }}
                  className="flex-1"
                  variant="outline"
                >
                  Batal
                </Button>
              </>
            )}
          </div>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
