import { useId, useState } from "react";
import { InputNominal } from "@/components/input-nominal";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";
import { DrawerFooter } from "@/components/ui/drawer";
import { Textarea } from "@/components/ui/textarea";
import { isValidPartialRefund, type TransactionRefund } from "@/features/orders/payment-details";
import { formatCurrency } from "@/lib/currency";

const refundOptions = [
  { mode: "full", label: "Refund penuh" },
  { mode: "partial", label: "Refund parsial" },
] as const;

export function SaleRefundForm({ total, available, busy, onBack, onContinue }: {
  total: number;
  available: boolean;
  busy: boolean;
  onBack: () => void;
  onContinue: (refund: TransactionRefund) => void;
}) {
  const id = useId();
  const formId = `${id}-form`;
  const nominalId = `${id}-nominal`;
  const helpId = `${id}-nominal-help`;
  const reasonId = `${id}-reason`;
  const [mode, setMode] = useState<(typeof refundOptions)[number]["mode"]>();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const nominal = Number(amount);
  const validPartial = isValidPartialRefund(nominal, total);
  const refundReason = reason.trim();
  const canContinue = available && !busy && !!refundReason && (mode === "full" || (mode === "partial" && validPartial));

  return (
    <>
      <form id={formId} className="modal-body flow-panel space-y-4" onSubmit={(event) => {
        event.preventDefault();
        if (!canContinue) return;
        onContinue(mode === "partial" ? { isPartial: true, nominal, reason: refundReason } : { isPartial: false, reason: refundReason });
      }}>
        <dl className="bento-surface flex flex-wrap items-baseline justify-between gap-2 p-3">
          <dt className="text-muted-foreground">Total pembayaran</dt>
          <dd className="font-semibold tabular-nums">{formatCurrency(total, 2)}</dd>
        </dl>
        <fieldset disabled={busy} className="min-w-0 space-y-2">
          <legend className="mb-2 font-medium">Jenis refund</legend>
          <div className="flex flex-wrap gap-2">
            {refundOptions.map((option) => (
              <label key={option.mode} className={buttonVariants({
                variant: mode === option.mode ? "default" : "outline",
                size: "lg",
                className: "cursor-pointer rounded-full! has-focus-visible:ring-2 has-focus-visible:ring-ring has-disabled:cursor-not-allowed has-disabled:opacity-50",
              })}>
                <input
                  type="radio"
                  name={`${id}-mode`}
                  value={option.mode}
                  checked={mode === option.mode}
                  onChange={() => setMode(option.mode)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
        {mode === "partial" && (
          <div className="space-y-2">
            <label htmlFor={nominalId} className="block font-medium">Nominal refund</label>
            <InputNominal
              id={nominalId}
              value={amount}
              decimalScale={2}
              onValueChange={setAmount}
              disabled={busy}
              aria-required
              aria-invalid={amount !== "" && !validPartial}
              aria-describedby={helpId}
            />
            <p id={helpId} className="text-xs text-muted-foreground">
              Masukkan nominal lebih dari Rp0 dan di bawah {formatCurrency(total, 2)}.
            </p>
          </div>
        )}
        <div className="space-y-2">
          <label htmlFor={reasonId} className="block font-medium">Alasan refund (wajib)</label>
          <Textarea
            id={reasonId}
            name="refund_reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            required
            disabled={busy}
          />
        </div>
      </form>
      <DrawerFooter>
        <div className="modal-actions">
          <Button type="button" variant="outline" disabled={busy} onClick={onBack}>Kembali</Button>
          <Button type="submit" form={formId} disabled={!canContinue}>Lanjutkan</Button>
        </div>
      </DrawerFooter>
    </>
  );
}
