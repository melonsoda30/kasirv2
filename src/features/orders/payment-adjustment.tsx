import { useId, useState } from "react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { DrawerClose, DrawerFooter } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { InputNominal } from "@/components/input-nominal";
import type { AdditionalFee, Discount } from "./payment-details";

export function PaymentAdjustment({
  kind,
  initial,
  onSave,
  onRemove,
}: {
  kind: "fee" | "discount";
  initial: AdditionalFee | Discount | null;
  onSave: (name: string, value: number, type: Discount["type"]) => void;
  onRemove: () => void;
}) {
  const id = useId();
  const [name, setName] = useState(initial?.name ?? "");
  const [type, setType] = useState<Discount["type"]>(
    initial && "type" in initial ? initial.type : "nominal",
  );
  const [value, setValue] = useState(() => {
    if (!initial) return "";
    return String("amount" in initial ? initial.amount : initial.value);
  });
  const percent = kind === "discount" && type === "percent";
  const amount = Number(value);
  const valid =
    name.trim().length > 0 &&
    amount > 0 &&
    (percent ? amount <= 100 : Number.isSafeInteger(amount));

  return (
    <>
      <form
        id={id}
        className="modal-body space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid) onSave(name.trim(), amount, type);
        }}
      >
        <label className="grid gap-2 font-medium">
          {kind === "fee" ? "Nama Biaya" : "Nama Diskon"}
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={80}
            required
          />
        </label>
        {kind === "discount" && (
          <fieldset>
            <legend className="mb-2 font-medium">Tipe Diskon</legend>
            <div className="flex gap-2">
              {(["nominal", "percent"] as const).map((option) => (
                <label
                  key={option}
                  className={buttonVariants({
                    variant: option === type ? "default" : "outline",
                    size: "lg",
                    className:
                      "cursor-pointer rounded-full! has-focus-visible:ring-2 has-focus-visible:ring-ring",
                  })}
                >
                  <input
                    className="sr-only"
                    type="radio"
                    name={id}
                    checked={type === option}
                    onChange={() => {
                      setType(option);
                      setValue("");
                    }}
                  />
                  {option === "nominal" ? "Nominal (Rp)" : "Persen (%)"}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <label className="grid gap-2 font-medium">
          {kind === "fee" && "Harga (Rp)"}
          {kind === "discount" && percent && "Nilai (%)"}
          {kind === "discount" && !percent && "Nilai (Rp)"}
          {percent ? (
            <Input
              type="number"
              inputMode="decimal"
              min="0"
              max="100"
              step="any"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              required
            />
          ) : (
            <InputNominal
              value={value}
              onValueChange={setValue}
              placeholder="0"
              required
            />
          )}
        </label>
      </form>
      <DrawerFooter>
        <div className={cn("modal-actions", initial && "grid-cols-3!")}>
          <DrawerClose asChild>
            <Button type="button" variant="outline">Batal</Button>
          </DrawerClose>
          {initial && (
            <Button type="button" variant="destructive" onClick={onRemove}>
              Hapus
            </Button>
          )}
          <Button type="submit" form={id} disabled={!valid}>
            Simpan
          </Button>
        </div>
      </DrawerFooter>
    </>
  );
}
