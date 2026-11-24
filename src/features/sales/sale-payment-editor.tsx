import { useId, useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { InputNominal } from "@/components/input-nominal";
import { SelectCombobox } from "@/components/select-combobox";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import {
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  NestedDrawer,
} from "@/components/ui/drawer";
import { PaymentAdjustment } from "@/features/orders/payment-adjustment";
import {
  editableSaleFees,
  pendingPaymentDetails,
  type AdditionalFee,
  type Discount,
  type SalePaymentChanges,
} from "@/features/orders/payment-details";
import {
  findRecordedPaymentMethod,
  usePaymentMethods,
} from "@/features/orders/payment-methods";
import { pendingOrderDraft } from "@/features/orders/order-store";
import { formatCurrency } from "@/lib/currency";
import type { Sale, SaleDiscount, SaleFee } from "./sales-summary";

type Adjustment = { kind: "fee" | "discount"; index?: number };

export function SalePaymentEditor({
  sale,
  busy,
  error,
  onBack,
  onSave,
}: {
  sale: Sale;
  busy: boolean;
  error?: string;
  onBack: () => void;
  onSave: (changes: SalePaymentChanges) => void;
}) {
  const query = usePaymentMethods(true, "always");
  const methods = query.data ?? [];
  const recorded = findRecordedPaymentMethod(
    methods,
    sale.paymentCode ?? sale.paymentMethod,
  );
  const [selected, setSelected] = useState<string>();
  const method =
    selected === undefined
      ? recorded
      : methods.find(({ code }) => code === selected);
  const [cashInput, setCashInput] = useState<string>();
  const cash =
    cashInput ?? (method?.code === recorded?.code ? String(sale.paid) : "");
  const [fees, setFees] = useState<SaleFee[]>();
  const [discounts, setDiscounts] = useState<SaleDiscount[]>();
  const [adjustment, setAdjustment] = useState<Adjustment | null>(null);
  const formId = useId();
  const feeList = fees ?? editableSaleFees(sale, recorded);
  const discountList =
    discounts ?? (sale.discounts ?? []).filter(({ value }) => value !== 0);
  const { totals } = pendingPaymentDetails(
    pendingOrderDraft(sale),
    sale,
    method,
    recorded,
    { additionalPrices: fees, discounts },
  );
  const paid = cash === "" ? undefined : Number(cash);
  const isCash = method?.kind === "cash";
  const validCash =
    paid !== undefined &&
    Number.isSafeInteger(paid) &&
    paid >= 0 &&
    (paid >= totals.total || (sale.status === "pending" && paid === 0));
  const valid =
    !!method && !query.isError && !query.isFetching && (!isCash || validCash);

  let initial: AdditionalFee | Discount | null = null;
  if (adjustment?.index !== undefined) {
    if (adjustment.kind === "fee") {
      const fee = feeList[adjustment.index];
      if (fee) initial = { name: fee.title, amount: fee.value };
    } else {
      const discount = discountList[adjustment.index];
      if (discount)
        initial = {
          name: discount.title,
          value: discount.value,
          type: discount.type === "fixed" ? "nominal" : "percent",
        };
    }
  }

  function saveAdjustment(
    title: string,
    value: number,
    type: Discount["type"],
  ) {
    if (!adjustment) return;
    const { index } = adjustment;
    if (adjustment.kind === "fee") {
      const fee = { title, value };
      setFees(
        index === undefined
          ? [...feeList, fee]
          : feeList.map((entry, i) => (i === index ? fee : entry)),
      );
    } else {
      const discount: SaleDiscount = {
        title,
        value,
        type: type === "nominal" ? "fixed" : "percent",
      };
      setDiscounts(
        index === undefined
          ? [...discountList, discount]
          : discountList.map((entry, i) => (i === index ? discount : entry)),
      );
    }
    setAdjustment(null);
  }

  function removeAdjustment() {
    if (!adjustment) return;
    if (adjustment.kind === "fee")
      setFees(feeList.filter((_, index) => index !== adjustment.index));
    else
      setDiscounts(
        discountList.filter((_, index) => index !== adjustment.index),
      );
    setAdjustment(null);
  }

  return (
    <>
      <form
        id={formId}
        className="drawer-body flow-panel space-y-4 p-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid && method && !busy)
            onSave({
              method,
              recordedMethod: recorded,
              paid: isCash ? paid : undefined,
              additionalPrices: fees,
              discounts,
            });
        }}
      >
        <div className="space-y-2">
          <label htmlFor={`${formId}-method`} className="font-medium">
            Metode pembayaran
          </label>
          {query.isPending ? (
            <SkeletonGroup label="Memuat metode pembayaran">
              <Skeleton className="h-10 w-full" />
            </SkeletonGroup>
          ) : (
            <SelectCombobox
              id={`${formId}-method`}
              searchable={false}
              placeholder="Pilih metode pembayaran"
              value={method?.code ?? ""}
              options={methods.map(({ code, title }) => ({
                value: code,
                label: title,
              }))}
              disabled={busy}
              onChange={setSelected}
            />
          )}
          {query.isError && (
            <div className="flex items-center justify-between gap-2">
              <p role="alert">Metode pembayaran gagal dimuat.</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                loading={query.isFetching}
                onClick={() => void query.refetch()}
              >
                Coba lagi
              </Button>
            </div>
          )}
          {query.isSuccess && !methods.length && (
            <p role="status">Belum ada metode pembayaran aktif.</p>
          )}
        </div>
        {isCash && (
          <label className="grid gap-2 font-medium">
            Nominal tunai
            <InputNominal
              value={cash}
              onValueChange={setCashInput}
              disabled={busy}
              placeholder="0"
            />
            {paid !== undefined && !validCash && (
              <span className="text-sm font-normal text-destructive">
                Nominal tunai harus mencukupi total pembayaran.
              </span>
            )}
          </label>
        )}
        <section
          className="space-y-2 border-t pt-3"
          aria-label="Biaya tambahan"
        >
          <h3 className="font-medium">Biaya tambahan</h3>
          {feeList.map(({ title, value }, index) => (
            <Button
              key={`${title}-${index}`}
              type="button"
              variant="outline"
              className="w-full"
              disabled={busy}
              aria-label={`Edit biaya ${title}`}
              onClick={() => setAdjustment({ kind: "fee", index })}
            >
              <span className="min-w-0 truncate mr-auto">{title}</span>
              <span className="shrink-0 tabular-nums">
                {formatCurrency(value)}
              </span>
              <Pencil aria-hidden="true" />
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => setAdjustment({ kind: "fee" })}
          >
            <Plus aria-hidden="true" /> Tambah biaya
          </Button>
        </section>
        <section className="space-y-2 border-t pt-3" aria-label="Diskon">
          <h3 className="font-medium">Diskon</h3>
          {discountList.map(({ title, value, type }, index) => (
            <Button
              key={`${title}-${index}`}
              type="button"
              variant="outline"
              className="w-full"
              disabled={busy}
              aria-label={`Edit diskon ${title}`}
              onClick={() => setAdjustment({ kind: "discount", index })}
            >
              <span className="min-w-0 truncate mr-auto">{title}</span>
              <span className="shrink-0 tabular-nums">
                {type === "percent"
                  ? `${value.toLocaleString("id-ID")}%`
                  : formatCurrency(value)}
              </span>
              <Pencil aria-hidden="true" />
            </Button>
          ))}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => setAdjustment({ kind: "discount" })}
          >
            <Plus aria-hidden="true" /> Tambah diskon
          </Button>
        </section>
        <dl className="space-y-2 border-t pt-3">
          <div className="flex justify-between gap-3 font-semibold">
            <dt>Total pembayaran</dt>
            <dd className="tabular-nums">{formatCurrency(totals.total)}</dd>
          </div>
          {isCash && paid !== undefined && (
            <div className="flex justify-between gap-3">
              <dt>Kembali</dt>
              <dd className="tabular-nums">
                {formatCurrency(Math.max(0, paid - totals.total))}
              </dd>
            </div>
          )}
        </dl>
      </form>
      <DrawerFooter>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={onBack}
          >
            Kembali
          </Button>
          <Button
            type="submit"
            form={formId}
            loading={busy}
            disabled={!valid || busy}
          >
            Simpan
          </Button>
        </div>
      </DrawerFooter>
      <NestedDrawer
        open={!!adjustment}
        onOpenChange={(open) => {
          if (!open) setAdjustment(null);
        }}
      >
        <DrawerContent
          aria-describedby={undefined}
        >
          {adjustment && (
            <>
              <DrawerHeader>
                <DrawerTitle>
                  {initial ? "Edit" : "Tambah"}{" "}
                  {adjustment.kind === "fee" ? "biaya tambahan" : "diskon"}
                </DrawerTitle>
              </DrawerHeader>
              <PaymentAdjustment
                kind={adjustment.kind}
                initial={initial}
                onSave={saveAdjustment}
                onRemove={removeAdjustment}
              />
            </>
          )}
        </DrawerContent>
      </NestedDrawer>
    </>
  );
}
