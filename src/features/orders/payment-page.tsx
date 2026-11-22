import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  Check,
  CircleCheck,
  CreditCard,
  Pencil,
  Plus,
  QrCode,
  Tag,
} from "lucide-react";
import { cn } from "cn";
import { InputNominal } from "@/components/input-nominal";
import { PageLayout } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { useAuthStore, type Account } from "@/features/auth/auth-store";
import { formatCurrency } from "@/lib/currency";
import { cashSessionAllowsSales, cashSessionOptions, refreshCashSessionData, useCashSession } from "@/features/cash-session/cash-session-query";
import { fetchTransactionDetail } from "@/features/sales/sales-api";
import type { Sale } from "@/features/sales/sales-summary";
import { OrderItemRow } from "./order-item-row";
import { OrderNoteField } from "./order-note-field";
import { useOrderStore, type OrderDraft } from "./order-store";
import { PaymentAdjustment } from "./payment-adjustment";
import {
  paymentTotals,
  resolvePendingTransaction,
  savePayment,
  type AdditionalFee,
  type Discount,
  type PaymentReceipt,
} from "./payment-details";
import { usePaymentMethods } from "./payment-methods";
import { PaymentProof } from "./payment-proof";
import { PaymentLeaveDialog } from "./payment-leave-dialog";

type DrawerStep = "fee" | "discount" | "cash" | "qris" | "proof";

const drawerTitles: Record<DrawerStep, string> = {
  fee: "Biaya Tambahan",
  discount: "Diskon",
  cash: "Nominal Dibayarkan",
  qris: "Pembayaran QRIS",
  proof: "Upload Bukti Pembayaran",
};
const paymentIcons = { cash: Banknote, qris: QrCode, noncash: CreditCard };

export function PaymentPage({ orderId, pending, returnSession }: { orderId: string; pending?: boolean; returnSession?: string }) {
  const account = useAuthStore((state) => state.session?.account);
  const accountId = account?.account_id;
  const order = useOrderStore((state) =>
    state.owner === accountId
      ? state.orders.find((entry) => entry.id === orderId)
      : undefined,
  );
  const [completed, setCompleted] = useState<{
    accountId: string;
    receipt: PaymentReceipt;
  } | null>(null);
  const receipt =
    completed?.accountId === accountId ? completed?.receipt : undefined;
  const detail = useQuery({
    queryKey: ['transactions', 'detail', account?.account_username, orderId],
    queryFn: ({ signal }) => fetchTransactionDetail(orderId, signal),
    enabled: !!account && !!pending && !receipt,
    staleTime: 0,
  });
  const serverOrder = pending && detail.data?.status === 'pending' ? detail.data : undefined;
  const payableOrder = pending ? (serverOrder && pendingOrderDraft(serverOrder)) : order;
  const isLoading = pending && detail.isPending;
  const loadFailed = pending && detail.isError;
  const showCheckout = !receipt && !isLoading && !loadFailed;
  const hasItems = account && payableOrder && payableOrder.items.length > 0;

  return (
    <PageLayout title="Pembayaran" prevLink="/cart" prevSearch={returnSession ? { session: returnSession } : undefined}>
      {receipt && (
        <section
          className="space-y-4 rounded-xl border p-5 text-center"
          aria-labelledby="payment-complete"
        >
          <CircleCheck
            className="mx-auto size-10 text-emerald-600"
            aria-hidden="true"
          />
          <div>
            <h2
              id="payment-complete"
              className="text-xl font-semibold"
              role="status"
            >
              Pembayaran selesai
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {receipt.order.name} ({receipt.method.title})
            </p>
          </div>
          <dl className="space-y-2 border-t pt-4 text-left text-sm">
            <TotalRow label="Total pembayaran" amount={receipt.total} />
            {receipt.method.kind === "cash" && (
              <>
                <TotalRow label="Dibayarkan" amount={receipt.paid} />
                <TotalRow label="Kembali" amount={receipt.change} />
              </>
            )}
          </dl>
          <Button asChild className="h-11 w-full">
            <Link to="/cart" search={{ session: returnSession }} replace>
              Kembali ke antrean
            </Link>
          </Button>
        </section>
      )}
      {!receipt && isLoading && (
        <p role="status" className="text-sm text-muted-foreground">Memuat pesanan...</p>
      )}
      {!receipt && pending && detail.isError && (
        <div className="space-y-3 text-sm">
          <p role="alert">{detail.error.message}</p>
          <Button type="button" variant="outline" onClick={() => void detail.refetch()}>Coba lagi</Button>
        </div>
      )}
      {showCheckout && hasItems && (
        <PaymentForm
          key={account.account_id}
          account={account}
          order={payableOrder}
          pendingSale={serverOrder}
          onComplete={(saved) => {
            setCompleted({ accountId: account.account_id, receipt: saved });
            const store = useOrderStore.getState();
            if (!pending && store.owner === account.account_id)
              store.removeOrder(saved.order.id);
          }}
        />
      )}
      {showCheckout && !hasItems && (
        <div className="space-y-4 rounded-xl border p-5 text-center">
          <p role="status" className="text-sm text-muted-foreground">
            {pending ? 'Pesanan ini sudah tidak menunggu pembayaran.' : 'Pesanan tidak tersedia atau belum memiliki produk.'}
          </p>
          <Button asChild variant="outline">
            <Link to="/cart" search={{ session: returnSession }}>Kembali ke antrean</Link>
          </Button>
        </div>
      )}
    </PageLayout>
  );
}

function pendingOrderDraft(sale: Sale): OrderDraft {
  return {
    id: sale.id, name: sale.id, note: sale.note,
    items: sale.items.map((item, index) => ({
      key: `${item.productId}-${index}`,
      quantity: item.quantity,
      unitPrice: item.quantity && item.lineTotal !== undefined ? item.lineTotal / item.quantity : item.unitPrice ?? 0,
      product: {
        id: item.productId, title: item.title, price: item.unitPrice ?? 0, category: '',
        image: '', photo: item.image ?? '', store: sale.store, discount: 0,
        discountType: 'Tanpa diskon', stock: 0, description: '', active: true,
      },
    })),
  };
}

function PaymentForm({
  account,
  order,
  pendingSale,
  onComplete,
}: {
  account: Account;
  order: OrderDraft;
  pendingSale?: Sale;
  onComplete: (receipt: PaymentReceipt) => void;
}) {
  const accountId = account.account_id;
  const methodsQuery = usePaymentMethods();
  const cashSession = useCashSession();
  const queryClient = useQueryClient();
  const methods = methodsQuery.data ?? [];
  const [methodCode, setMethodCode] = useState("");
  const [fee, setFee] = useState<AdditionalFee | null>(null);
  const [discount, setDiscount] = useState<Discount | null>(null);
  const [drawer, setDrawer] = useState<DrawerStep | null>(null);
  const [paid, setPaid] = useState<number | null>(null);
  const [cashInput, setCashInput] = useState("");
  const [loadedQr, setLoadedQr] = useState("");
  const [failedQr, setFailedQr] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const saving = useRef(false);
  const summaryRef = useRef<HTMLElement>(null);
  const summarySpaceRef = useRef<HTMLDivElement>(null);
  const cashFormId = useId();

  useLayoutEffect(() => {
    const summary = summaryRef.current;
    const space = summarySpaceRef.current;
    if (!summary || !space) return;

    const reserveSummarySpace = () => {
      space.style.height = summary.offsetHeight + "px";
    };
    reserveSummarySpace();
    const observer = new ResizeObserver(reserveSummarySpace);
    observer.observe(summary, { box: "border-box" });
    return () => observer.disconnect();
  }, []);

  const pendingCode = pendingSale?.paymentCode ?? pendingSale?.paymentMethod;
  const recordedKind = ['cash', 'tunai'].includes(pendingCode?.toLowerCase() ?? '') ? 'cash' : 'noncash';
  const recordedMethod: (PaymentReceipt['method'] & { image?: string }) | undefined = pendingCode && pendingSale ? {
    code: pendingCode,
    title: pendingSale.paymentMethod,
    kind: recordedKind,
  } : undefined;
  const method = recordedMethod ?? methods.find((entry) => entry.code === methodCode);
  const isCash = method?.kind === "cash";
  const isQris = method?.kind === "qris";
  const unavailableMethod =
    !method && (drawer === "cash" || drawer === "qris" || drawer === "proof");
  const confirmingNonQris = drawer === "proof" && !isQris;
  const totals = pendingSale ? {
    subtotal: pendingSale.subtotal ?? order.items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0),
    total: pendingSale.total, methodFeeAmount: 0, discountAmount: 0,
  } : paymentTotals(order, fee, discount, method?.fee);
  const change = paid === null ? 0 : Math.max(0, paid - totals.total);
  const canPayCash = paid !== null && paid >= totals.total;
  const cashInputValid =
    cashInput !== "" &&
    Number.isSafeInteger(Number(cashInput)) &&
    Number(cashInput) >= 0;
  const itemCount = order.items.reduce(
    (count, item) => count + item.quantity,
    0,
  );

  function openCash() {
    setCashInput(paid === null ? "" : String(paid));
    setDrawer("cash");
  }

  async function finish(proof?: File) {
    if (
      !method ||
      saving.current ||
      (isCash && !canPayCash) ||
      (isQris && !proof)
    )
      return;
    const store = useOrderStore.getState();
    if (useAuthStore.getState().session?.account.account_id !== accountId || (!pendingSale && (store.owner !== accountId || !store.orders.includes(order)))) {
      setSaveError("Pesanan berubah. Buka ulang pembayaran dari cart.");
      return;
    }
    saving.current = true;
    setBusy(true);
    setSaveError("");
    try {
      if (!cashSessionAllowsSales(await queryClient.fetchQuery(cashSessionOptions(account)))) {
        setDrawer(null);
        throw new Error('Buka shift dari Order atau Profil sebelum menyimpan pembayaran.');
      }
      if (useAuthStore.getState().session?.account.account_id !== accountId) throw new Error('Sesi login berubah. Buka ulang pembayaran.')
      const payment: PaymentReceipt = {
        ...totals,
        order,
        method,
        fee,
        discount,
        paid: isCash ? (paid ?? 0) : totals.total,
        change: isCash ? change : 0,
        proof,
      };
      if (pendingSale) await resolvePendingTransaction(order.id, payment);
      else await savePayment(payment, account);
      onComplete(payment);
      refreshCashSessionData(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
      void queryClient.invalidateQueries({ queryKey: ["products"] });
    } catch (error) {
      refreshCashSessionData(queryClient);
      if (pendingSale) void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      const message = error instanceof Error ? error.message : "Pembayaran gagal disimpan. Coba lagi.";
      if (/buka shift/i.test(message)) setDrawer(null);
      setSaveError(message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <section
        className="overflow-hidden rounded-xl border bg-background"
        aria-labelledby="product-summary"
      >
        <header className="border-b p-4">
          <h2 id="product-summary" className="text-sm font-semibold">
            Ringkasan Produk
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {order.name} ({itemCount} item)
          </p>
        </header>
        <ul className="divide-y px-4">
          {order.items.map((item) => (
            <OrderItemRow key={item.key} item={item} showDiscount />
          ))}
        </ul>
        {pendingSale && order.note && (
          <div className="space-y-1 border-t p-4 text-sm">
            <p className="font-medium">Catatan pesanan</p><p className="whitespace-pre-wrap break-words">{order.note}</p>
          </div>
        )}
        {!pendingSale && (
          <>
            <div className="border-t p-4"><OrderNoteField order={order} disabled={busy} /></div>
            <div className="grid grid-cols-2 gap-2 border-t p-3">
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-8 whitespace-normal py-2"
              disabled={busy}
              onClick={() => setDrawer("fee")}
            >
              {fee ? <Pencil aria-hidden="true" /> : <Plus aria-hidden="true" />}{" "}
              Biaya Tambahan
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-auto min-h-8 whitespace-normal py-2"
              disabled={busy}
              onClick={() => setDrawer("discount")}
            >
              <Tag aria-hidden="true" /> Diskon
            </Button>
            </div>
          </>
        )}
      </section>

      <section
        className="space-y-3 rounded-xl border bg-background p-4"
        aria-labelledby="payment-methods"
      >
        <h2 id="payment-methods" className="text-sm font-semibold">
          Metode Pembayaran
        </h2>
        {pendingSale && (
          <p className="text-sm">{pendingSale.paymentMethod}</p>
        )}
        {!pendingSale && (
          <>
          {methodsQuery.isPending && (
            <p role="status" className="text-sm text-muted-foreground">
              Memuat metode pembayaran…
            </p>
          )}
          {methodsQuery.isError && (
            <div className="flex items-center justify-between gap-2">
              <p role="alert" className="text-sm text-muted-foreground">
                Metode pembayaran gagal dimuat.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={methodsQuery.isFetching}
                onClick={() => void methodsQuery.refetch()}
              >
                Coba lagi
              </Button>
            </div>
          )}
          {methodsQuery.isSuccess && !methods.length && (
            <p className="text-sm text-muted-foreground">
              Belum ada metode pembayaran aktif.
            </p>
          )}
          {methods.length > 0 && (
            <ul className="space-y-2">
              {methods.map((entry) => {
                const Icon = paymentIcons[entry.kind];
                return (
                  <li key={entry.code}>
                    <Button
                      type="button"
                      variant="outline"
                      className="h-auto min-h-10 w-full justify-start gap-3 whitespace-normal px-3 py-2 text-left aria-pressed:border-primary aria-pressed:bg-muted"
                      aria-pressed={entry.code === methodCode}
                      disabled={busy}
                      onClick={() => {
                        setMethodCode(entry.code);
                        setSaveError("");
                        if (entry.kind === "cash") openCash();
                      }}
                    >
                      <Icon aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className="block">{entry.title}</span>
                        {entry.fee && (
                          <span className="block text-xs text-muted-foreground">
                            {entry.fee.type === "percent"
                              ? entry.fee.amount.toLocaleString("id-ID") + "%"
                              : formatCurrency(entry.fee.amount)}
                          </span>
                        )}
                        {entry.missingFee && (
                          <span className="block text-xs text-muted-foreground">
                            Fee sudah dihapus.
                          </span>
                        )}
                      </span>
                      {entry.code === methodCode && (
                        <Check className="size-4 shrink-0" aria-hidden="true" />
                      )}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
          </>
        )}
      </section>

      <div ref={summarySpaceRef} aria-hidden="true" />
      <section
        ref={summaryRef}
        className="payment-summary-bar fixed inset-x-0 bottom-0 z-30 flex max-h-[60dvh] flex-col gap-2 border-t bg-background pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pl-[calc(1rem+env(safe-area-inset-left))] pr-[calc(1rem+env(safe-area-inset-right))]"
        aria-labelledby="payment-total"
      >
        <h2 id="payment-total" className="shrink-0 text-sm font-semibold">
          Ringkasan Pembayaran
        </h2>
        <div className="min-h-0 space-y-2 overflow-y-auto overscroll-contain">
          <dl className="space-y-2 text-sm">
            <TotalRow label="Subtotal produk" amount={totals.subtotal} />
            {!!pendingSale?.tax && <TotalRow label="PPN" amount={pendingSale.tax} />}
            {fee && <TotalRow label={fee.name} amount={fee.amount} />}
            {totals.methodFeeAmount > 0 && (
              <TotalRow label="Fee" amount={totals.methodFeeAmount} />
            )}
            {discount && (
              <TotalRow
                label={
                  discount.type === "percent"
                    ? discount.name +
                      " (" +
                      discount.value.toLocaleString("id-ID") +
                      "%)"
                    : discount.name
                }
                amount={-totals.discountAmount}
              />
            )}
            <TotalRow
              label="Total pembayaran"
              amount={totals.total}
              className="border-t pt-2 font-semibold"
            />
            {isCash && (
              <>
                <div className="flex items-center justify-between gap-3">
                  <dt>Dibayarkan</dt>
                  <dd>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={
                        "Edit nominal dibayarkan" +
                        (paid === null ? "" : " " + formatCurrency(paid))
                      }
                      onClick={openCash}
                      disabled={busy}
                      className="tabular-nums"
                    >
                      {paid === null ? "Isi nominal" : formatCurrency(paid)}{" "}
                      <Pencil aria-hidden="true" />
                    </Button>
                  </dd>
                </div>
                <TotalRow label="Kembali" amount={change} />
              </>
            )}
          </dl>
          {isCash && paid !== null && !canPayCash && (
            <p role="status" className="text-sm text-destructive">
              Nominal kurang {formatCurrency(totals.total - paid)}.
            </p>
          )}
          {saveError && drawer !== "proof" && (
            <p role="alert" className="text-sm text-destructive">
              {saveError}
            </p>
          )}
        </div>
        <Button
          type="button"
          className="h-12 w-full"
          loading={busy && isCash}
          disabled={busy || cashSession.isPending || !method || (isCash && !canPayCash)}
          onClick={() => {
            if (cashSession.isError) {
              setSaveError('Status shift belum bisa diperiksa. Coba lagi.');
              void cashSession.refetch();
              return;
            }
            if (!cashSessionAllowsSales(cashSession.data)) {
              setSaveError('Buka shift dari Order atau Profil sebelum menerima pembayaran.');
              return;
            }
            if (isCash) void finish();
            else {
              setLoadedQr("");
              setFailedQr("");
              setSaveError("");
              setDrawer(isQris && method?.image ? "qris" : "proof");
            }
          }}
        >
          Bayar
        </Button>
      </section>

      <Drawer
        open={drawer !== null}
        dismissible={!busy}
        onOpenChange={(open) => {
          if (!open && !busy) setDrawer(null);
        }}
      >
        <DrawerContent
          className="product-drawer pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
          {...(drawer === "cash" || drawer === "qris" || drawer === "proof"
            ? {}
            : { "aria-describedby": undefined })}
        >
          {drawer && (
            <>
              <DrawerHeader className="shrink-0">
                <DrawerTitle>
                  {unavailableMethod && "Metode pembayaran berubah"}
                  {!unavailableMethod && confirmingNonQris && "Konfirmasi pembayaran"}
                  {!unavailableMethod && !confirmingNonQris && drawerTitles[drawer]}
                </DrawerTitle>
                {unavailableMethod && (
                  <DrawerDescription>
                    Pilih metode pembayaran yang tersedia untuk melanjutkan.
                  </DrawerDescription>
                )}
                {!unavailableMethod && drawer === "cash" && (
                  <DrawerDescription>
                    Total pembayaran {formatCurrency(totals.total)}
                  </DrawerDescription>
                )}
                {!unavailableMethod && drawer === "qris" && (
                  <DrawerDescription>
                    Pindai QRIS untuk membayar {formatCurrency(totals.total)}.
                  </DrawerDescription>
                )}
                {!unavailableMethod && drawer === "proof" && (
                  <DrawerDescription>
                    {method?.title} ({formatCurrency(totals.total)})
                  </DrawerDescription>
                )}
              </DrawerHeader>
              {unavailableMethod && (
                <DrawerFooter className="shrink-0 border-t">
                  <DrawerClose asChild>
                    <Button type="button" variant="outline">
                      Pilih metode lain
                    </Button>
                  </DrawerClose>
                </DrawerFooter>
              )}
              {(drawer === "fee" || drawer === "discount") && (
                <PaymentAdjustment
                  key={drawer}
                  kind={drawer}
                  initial={drawer === "fee" ? fee : discount}
                  onSave={(name, value, type) => {
                    if (drawer === "fee") setFee({ name, amount: value });
                    else setDiscount({ name, type, value });
                    setDrawer(null);
                  }}
                  onRemove={() => {
                    if (drawer === "fee") setFee(null);
                    else setDiscount(null);
                    setDrawer(null);
                  }}
                />
              )}
              {drawer === "cash" && !unavailableMethod && (
                <>
                  <form
                    id={cashFormId}
                    className="min-h-0 overflow-y-auto px-4 pb-4"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (!cashInputValid) return;
                      setPaid(Number(cashInput));
                      setDrawer(null);
                    }}
                  >
                    <label className="grid gap-2 font-medium">
                      Dibayarkan
                      <InputNominal
                        value={cashInput}
                        onValueChange={setCashInput}
                        placeholder="0"
                        required
                      />
                    </label>
                  </form>
                  <DrawerFooter className="shrink-0 border-t">
                    <div className="grid grid-cols-2 gap-2">
                      <DrawerClose asChild>
                        <Button type="button" variant="outline">
                          Batal
                        </Button>
                      </DrawerClose>
                      <Button
                        type="submit"
                        form={cashFormId}
                        disabled={!cashInputValid}
                      >
                        Simpan
                      </Button>
                    </div>
                  </DrawerFooter>
                </>
              )}
              {drawer === "qris" && !unavailableMethod && (
                <>
                  <div className="min-h-0 overflow-y-auto px-4 pb-4">
                    {method?.image && failedQr !== method.image && (
                      <img
                        src={method.image}
                        alt="Kode QRIS toko"
                        className="mx-auto aspect-square w-full max-w-64 rounded-lg border bg-background object-contain p-2"
                        onLoad={() => setLoadedQr(method.image ?? "")}
                        onError={() => setFailedQr(method.image ?? "")}
                      />
                    )}
                    {!(method?.image && failedQr !== method.image) && (
                      <p
                        role="status"
                        className="text-center text-muted-foreground"
                      >
                        {method?.image
                          ? "Gambar QRIS gagal dimuat."
                          : "Gambar QRIS belum tersedia di pengaturan toko."}
                      </p>
                    )}
                  </div>
                  <DrawerFooter className="shrink-0 border-t">
                    <div className="grid grid-cols-2 gap-2">
                      <DrawerClose asChild>
                        <Button type="button" variant="outline">
                          Batal
                        </Button>
                      </DrawerClose>
                      <Button
                        type="button"
                        disabled={
                          !method?.image ||
                          loadedQr !== method.image ||
                          failedQr === method.image
                        }
                        onClick={() => setDrawer("proof")}
                      >
                        Selanjutnya
                      </Button>
                    </div>
                  </DrawerFooter>
                </>
              )}
              {drawer === "proof" && !unavailableMethod && (pendingSale ? <>
                <div className="min-h-0 space-y-2 overflow-y-auto px-4 pb-4">
                  <p>Konfirmasi setelah pembayaran diterima.</p>
                  {saveError && <p role="alert" className="text-destructive">{saveError}</p>}
                </div>
                <DrawerFooter className="shrink-0 border-t">
                  <div className="grid grid-cols-2 gap-2">
                    <DrawerClose asChild><Button type="button" variant="outline" disabled={busy}>Batal</Button></DrawerClose>
                    <Button type="button" loading={busy} disabled={busy} onClick={() => void finish()}>Selesaikan pembayaran</Button>
                  </div>
                </DrawerFooter>
              </> : <PaymentProof
                  busy={busy}
                  saveError={saveError}
                  required={isQris}
                  onFinish={(file) => void finish(file)}
                />)}
            </>
          )}
        </DrawerContent>
      </Drawer>
      <PaymentLeaveDialog busy={busy} />
    </div>
  );
}

function TotalRow({
  label,
  amount,
  className = "",
}: {
  label: ReactNode;
  amount: number;
  className?: string;
}) {
  return (
    <div className={cn("flex justify-between gap-3", className)}>
      <dt className="min-w-0">{label}</dt>
      <dd className="shrink-0 tabular-nums">{formatCurrency(amount)}</dd>
    </div>
  );
}
