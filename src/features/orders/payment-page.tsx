import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Banknote,
  Check,
  CircleAlert,
  CircleCheck,
  CreditCard,
  Pencil,
  Plus,
  QrCode,
  Tag,
} from "lucide-react";
import { cn } from "cn";
import { ImagePreview } from "@/components/image-input";
import { InputNominal } from "@/components/input-nominal";
import { PageLayout } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonGroup, SkeletonRows } from "@/components/ui/skeleton";
import { SkeletonImage } from "@/components/ui/skeleton-image";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Drawer,
  DrawerClose,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { getAccountBranches, getCashierBranch, useAuthStore, usesCashierMode, type Account } from "@/features/auth/auth-store";
import { formatCurrency, formatNominal } from "@/lib/currency";
import { cashSessionAllowsSales, cashSessionOptions, refreshCashSessionData, useCashSession } from "@/features/cash-session/cash-session-query";
import { fetchTransactionDetail } from "@/features/sales/sales-api";
import type { Sale, SaleDiscount, SaleFee } from "@/features/sales/sales-summary";
import { OrderItemRow } from "./order-item-row";
import { OrderNoteField } from "./order-note-field";
import { orderOwner, pendingOrderDraft, useOrderStore, type OrderDraft } from "./order-store";
import { PaymentAdjustment } from "./payment-adjustment";
import {
  editableSaleFees,
  customerPaymentFee,
  pendingPaymentDetails,
  paymentTotals,
  resolvePendingTransaction,
  savePayment,
  type AdditionalFee,
  type Discount,
  type PaymentReceipt,
} from "./payment-details";
import { findRecordedPaymentMethod, usePaymentMethods } from "./payment-methods";
import { PaymentProof } from "./payment-proof";
import { PaymentLeaveDialog } from "./payment-leave-dialog";

type DrawerStep = "fee" | "discount" | "cash" | "qris" | "proof";

const drawerTitles: Record<DrawerStep, string> = {
  fee: "Tambah biaya tambahan",
  discount: "Tambah diskon",
  cash: "Nominal Dibayarkan",
  qris: "Pembayaran QRIS",
  proof: "Upload Bukti Pembayaran",
};
const paymentIcons = { cash: Banknote, qris: QrCode, noncash: CreditCard };
const receiptDateTime = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Jakarta",
});

type CompletedPayment = PaymentReceipt & {
  transactionId?: string;
  completedAt: Date;
  cashier: string;
  store: string;
  branch?: string;
  salesperson?: string;
  taxAmount?: number;
  proofPreview?: string;
  recordedProof?: Sale["paymentProof"];
};

export function PaymentPage({ orderId, pending, returnSession }: { orderId: string; pending?: boolean; returnSession?: string }) {
  const account = useAuthStore((state) => state.session?.account);
  const cashierMode = useAuthStore((state) => usesCashierMode(state.session));
  const draftOwner = useAuthStore((state) => orderOwner(state.session));
  const branchId = useAuthStore((state) => getCashierBranch(state.session)?.id);
  const order = useOrderStore((state) =>
    state.owner === draftOwner
      ? state.orders.find((entry) => entry.id === orderId)
      : undefined,
  );
  const [completed, setCompleted] = useState<{
    owner: string;
    receipt: CompletedPayment;
  } | null>(null);
  const receipt =
    completed?.owner === draftOwner ? completed?.receipt : undefined;
  const methodsQuery = usePaymentMethods(!!account && !receipt, pending ? "always" : undefined);
  const detail = useQuery({
    queryKey: ['transactions', 'detail', account?.account_username, orderId],
    queryFn: ({ signal }) => fetchTransactionDetail(orderId, signal),
    enabled: !!account && !!pending && !receipt,
    staleTime: 0,
  });
  const wrongBranch = !!pending && !!branchId && !!detail.data && detail.data.branchId !== branchId;
  const serverOrder = pending && !wrongBranch && detail.data?.status === 'pending' ? detail.data : undefined;
  const payableOrder = pending ? (serverOrder && pendingOrderDraft(serverOrder)) : order;
  const isLoading = pending && detail.isPending;
  const loadFailed = pending && detail.isError;
  const showCheckout = !receipt && !isLoading && !loadFailed;
  const hasItems = account && payableOrder && payableOrder.items.length > 0;
  const orderPath = cashierMode ? "/" : "/order";
  const prevLink = pending ? "/cart" : orderPath;
  const prevSearch = pending && returnSession ? { session: returnSession } : undefined;

  return (
    <PageLayout title="Pembayaran" prevLink={prevLink} prevSearch={prevSearch} branchSwitcher={null} wide>
      {receipt && (
        <PaymentCompleteDrawer receipt={receipt} returnSession={returnSession} />
      )}
      {!receipt && isLoading && (
        <SkeletonGroup label="Memuat pesanan" className="pb-[calc(8rem+env(safe-area-inset-bottom))]">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <SkeletonRows media="thumbnail" />
            <SkeletonRows rows={2} />
          </div>
          <div aria-hidden="true" className="payment-summary-bar fixed inset-x-0 bottom-0 z-30 space-y-3 rounded-t-2xl border-t bg-card pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pl-[calc(1rem+env(safe-area-inset-left))] pr-[calc(1rem+env(safe-area-inset-right))] sm:pl-[calc(1.5rem+env(safe-area-inset-left))] sm:pr-[calc(1.5rem+env(safe-area-inset-right))]">
            <Skeleton className="h-4 w-36" />
            <div className="flex justify-between gap-4"><Skeleton className="h-4 w-24" /><Skeleton className="h-4 w-20" /></div>
            <Skeleton className="h-12 w-full rounded-xl" />
          </div>
        </SkeletonGroup>
      )}
      {!receipt && pending && detail.isError && (
        <div className="space-y-3 text-sm">
          <p role="alert">{detail.error.message}</p>
          <Button type="button" variant="outline" loading={detail.isFetching} onClick={() => void detail.refetch()}>Coba lagi</Button>
        </div>
      )}
      {showCheckout && hasItems && draftOwner && (
        <PaymentForm
          key={draftOwner}
          account={account}
          draftOwner={draftOwner}
          branchId={branchId}
          order={payableOrder}
          pendingSale={serverOrder}
          methodsQuery={methodsQuery}
          onComplete={(saved) => {
            setCompleted({ owner: draftOwner, receipt: saved });
            const store = useOrderStore.getState();
            if (!pending && store.owner === draftOwner)
              store.removeOrder(saved.order.id);
          }}
        />
      )}
      {showCheckout && !hasItems && (
        <div className="bento-surface mx-auto max-w-lg space-y-4 p-5 text-center">
          <p role="status" className="text-sm text-muted-foreground">
            {wrongBranch && 'Cabang pesanan tidak sesuai dengan cabang kasir.'}
            {!wrongBranch && pending && 'Pesanan ini sudah tidak menunggu pembayaran.'}
            {!pending && 'Pesanan tidak tersedia atau belum memiliki produk.'}
          </p>
          <Button asChild variant="outline">
            <Link to={prevLink} search={prevSearch}>
              {pending ? "Kembali ke antrean" : "Kembali ke Order"}
            </Link>
          </Button>
        </div>
      )}
    </PageLayout>
  );
}

function PaymentCompleteDrawer({ receipt, returnSession }: {
  receipt: CompletedPayment;
  returnSession?: string;
}) {
  const [open, setOpen] = useState(true);
  const navigate = useNavigate();
  const itemCount = receipt.order.items.reduce((count, item) => count + item.quantity, 0);
  const details = [
    ["ID transaksi", receipt.transactionId],
    ["Pembayaran dikonfirmasi", receiptDateTime.format(receipt.completedAt)],
    ["Toko", receipt.store],
    ["Cabang", receipt.branch],
    ["Kasir", receipt.cashier],
    ["Sales", receipt.salesperson],
  ].filter(([, value]) => !!value);
  const recordedProof = receipt.recordedProof;

  return (
    <Drawer
      open={open}
      autoFocus
      onOpenChange={setOpen}
      onAnimationEnd={(next) => {
        if (!next) void navigate({ to: "/cart", search: { session: returnSession }, replace: true });
      }}
    >
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle className="flex items-center justify-center gap-2">
            <CircleCheck className="size-5 shrink-0 fill-success-indicator text-status-icon-foreground" aria-hidden="true" />
            Pembayaran selesai
          </DrawerTitle>
          <DrawerDescription className="wrap-anywhere">
            {receipt.order.name === receipt.transactionId ? "Rincian pembelian" : receipt.order.name}
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody className="space-y-3">
          <section aria-label="Produk dibeli" className="bento-surface px-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b py-3">
              <h3 className="font-semibold">Produk dibeli</h3>
              <span className="text-xs text-muted-foreground">{formatNominal(itemCount)} item</span>
            </div>
            <ul className="divide-y">
              {receipt.order.items.map((item) => (
                <OrderItemRow key={item.key} item={item} showDiscount />
              ))}
            </ul>
            {receipt.order.note?.trim() && (
              <div className="space-y-1 border-t py-3">
                <h3 className="font-medium">Catatan pesanan</h3>
                <p className="wrap-anywhere whitespace-pre-wrap text-muted-foreground">{receipt.order.note.trim()}</p>
              </div>
            )}
          </section>
          <section aria-label="Ringkasan pembayaran" className="bento-surface space-y-3 p-4">
            <h3 className="font-semibold">Ringkasan pembayaran</h3>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="min-w-0">Metode pembayaran</dt>
                <dd className="wrap-anywhere text-right font-medium">{receipt.method.title}</dd>
              </div>
              <TotalRow label="Subtotal produk" amount={receipt.subtotal} />
              {!!receipt.taxAmount && <TotalRow label="PPN" amount={receipt.taxAmount} />}
              {receipt.additionalPrices.map(({ title, value }, index) => (
                <TotalRow key={`fee-${index}`} label={title} amount={value} />
              ))}
              {receipt.methodFeeAmount > 0 && <TotalRow label="Fee pembayaran" amount={receipt.methodFeeAmount} />}
              {receipt.discounts.map(({ title, type, value }, index) => (
                <TotalRow key={`discount-${index}`}
                  label={type === "percent" ? `${title} (${value.toLocaleString("id-ID")}%)` : title}
                  amount={-(receipt.discountAmounts[index] ?? 0)} />
              ))}
              <TotalRow label="Total pembayaran" amount={receipt.total} className="border-t pt-2 text-base font-semibold" />
              {receipt.method.kind === "cash" && (
                <>
                  <TotalRow label="Dibayarkan" amount={receipt.paid} />
                  <TotalRow label="Kembali" amount={receipt.change} />
                </>
              )}
            </dl>
          </section>
          <section aria-label="Informasi pesanan" className="bento-surface space-y-3 p-4">
            <h3 className="font-semibold">Informasi pesanan</h3>
            <dl className="space-y-2 text-sm">
              {details.map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="min-w-0 wrap-anywhere text-right">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
          {(receipt.proofPreview || recordedProof?.url) && (
            <section aria-label="Bukti pembayaran" className="bento-surface overflow-hidden">
              <h3 className="border-b p-4 font-semibold">Bukti pembayaran</h3>
              {receipt.proofPreview && <ImagePreview src={receipt.proofPreview} label="Bukti pembayaran yang diunggah" />}
              {!receipt.proofPreview && recordedProof?.url && (
                <a href={recordedProof.url} target="_blank" rel="noopener noreferrer" className="block p-4 font-medium text-link underline">
                  Buka bukti pembayaran
                </a>
              )}
            </section>
          )}
        </DrawerBody>
        <DrawerFooter>
          <DrawerClose asChild>
            <Button type="button">Selesai</Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function PaymentForm({
  account,
  draftOwner,
  branchId,
  order,
  pendingSale,
  methodsQuery,
  onComplete,
}: {
  account: Account;
  draftOwner: string;
  branchId?: string;
  order: OrderDraft;
  pendingSale?: Sale;
  methodsQuery: ReturnType<typeof usePaymentMethods>;
  onComplete: (receipt: CompletedPayment) => void;
}) {
  const cashSession = useCashSession();
  const queryClient = useQueryClient();
  const methods = methodsQuery.data ?? [];
  const [methodCode, setMethodCode] = useState("");
  const [fees, setFees] = useState<SaleFee[]>();
  const [discounts, setDiscounts] = useState<SaleDiscount[]>();
  const [adjustmentIndex, setAdjustmentIndex] = useState<number>();
  const [drawer, setDrawerStep] = useState<DrawerStep | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [paid, setPaid] = useState<number | null>(null);
  const [cashInput, setCashInput] = useState("");
  const [loadedQr, setLoadedQr] = useState("");
  const [failedQr, setFailedQr] = useState("");
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState("");
  const saving = useRef(false);
  const summaryRef = useRef<HTMLElement>(null);
  const summarySpaceRef = useRef<HTMLDivElement>(null);
  const drawerTitleRef = useRef<HTMLHeadingElement>(null);
  const drawerTriggerRef = useRef<HTMLElement | null>(null);
  const cashFormId = useId();
  const method = methods.find((entry) => entry.code === methodCode);
  const showPaymentSummary = !!method;

  useLayoutEffect(() => {
    if (!showPaymentSummary) return;
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
  }, [showPaymentSummary]);

  useLayoutEffect(() => {
    if (drawerOpen && drawer === "proof") drawerTitleRef.current?.focus({ preventScroll: true });
  }, [drawer, drawerOpen]);

  const pendingCode = pendingSale?.paymentCode ?? pendingSale?.paymentMethod;
  const recordedMethod = findRecordedPaymentMethod(methods, pendingCode);
  const checkingPendingMethods = !!pendingSale && (methodsQuery.isFetching || methodsQuery.isError);
  const isCash = method?.kind === "cash";
  const isQris = method?.kind === "qris";
  const unavailableMethod =
    !method && (drawer === "cash" || drawer === "qris" || drawer === "proof");
  const confirmingPayment = drawer === "proof" && (!!pendingSale || !isQris);
  const feeList = fees ?? (pendingSale ? editableSaleFees(pendingSale, recordedMethod) : []);
  const discountList = discounts ?? (pendingSale?.discounts ?? []).filter(({ value }) => value !== 0);
  const pendingPayment = pendingSale && pendingPaymentDetails(order, pendingSale, method, recordedMethod, {
    additionalPrices: fees, discounts,
  });
  const totals = pendingPayment?.totals ?? paymentTotals(order, feeList, discountList, method);
  const selectedFee = drawer === "fee" && adjustmentIndex !== undefined ? feeList[adjustmentIndex] : undefined;
  const selectedDiscount = drawer === "discount" && adjustmentIndex !== undefined ? discountList[adjustmentIndex] : undefined;
  let initialAdjustment: AdditionalFee | Discount | null = null;
  if (selectedFee) initialAdjustment = { name: selectedFee.title, amount: selectedFee.value };
  if (selectedDiscount) initialAdjustment = {
    name: selectedDiscount.title,
    type: selectedDiscount.type === "fixed" ? "nominal" : "percent",
    value: selectedDiscount.value,
  };
  let drawerTitle = drawer && drawerTitles[drawer];
  if (selectedFee) drawerTitle = "Edit biaya tambahan";
  if (selectedDiscount) drawerTitle = "Edit diskon";
  const change = paid === null ? 0 : Math.max(0, paid - totals.total);
  const canPayCash = paid !== null && paid >= totals.total;
  const payDisabled = busy || cashSession.isPending || checkingPendingMethods || !method || (isCash && !canPayCash);
  const readyToPay = !payDisabled && !saveError && cashSession.isSuccess && cashSessionAllowsSales(cashSession.data, branchId);
  const cashInputValid =
    cashInput !== "" &&
    Number.isSafeInteger(Number(cashInput)) &&
    Number(cashInput) >= 0;
  const itemCount = order.items.reduce(
    (count, item) => count + item.quantity,
    0,
  );

  function openCash(amount = paid) {
    setCashInput(amount === null ? "" : String(amount));
    setDrawer("cash");
  }

  function setDrawer(step: DrawerStep | null) {
    if (step !== null) {
      if (!drawerOpen && document.activeElement instanceof HTMLElement) {
        drawerTriggerRef.current = document.activeElement;
      }
      setDrawerStep(step);
    }
    setDrawerOpen(step !== null);
  }

  function openAdjustment(kind: "fee" | "discount", index?: number) {
    setAdjustmentIndex(index);
    setDrawer(kind);
  }

  function saveAdjustment(title: string, value: number, type: Discount["type"]) {
    if (drawer === "fee") {
      const entry = { title, value };
      setFees(adjustmentIndex === undefined
        ? [...feeList, entry]
        : feeList.map((fee, index) => index === adjustmentIndex ? entry : fee));
    } else if (drawer === "discount") {
      const entry: SaleDiscount = { title, value, type: type === "percent" ? "percent" : "fixed" };
      setDiscounts(adjustmentIndex === undefined
        ? [...discountList, entry]
        : discountList.map((discount, index) => index === adjustmentIndex ? entry : discount));
    }
    setDrawer(null);
  }

  function removeAdjustment() {
    if (drawer === "fee") setFees(feeList.filter((_, index) => index !== adjustmentIndex));
    if (drawer === "discount") setDiscounts(discountList.filter((_, index) => index !== adjustmentIndex));
    setDrawer(null);
  }

  async function finish(proof?: File, proofPreview?: string) {
    if (
      !method ||
      checkingPendingMethods ||
      saving.current ||
      (isCash && !canPayCash) ||
      (isQris && !pendingSale && !proof)
    )
      return;
    const store = useOrderStore.getState();
    if (orderOwner(useAuthStore.getState().session) !== draftOwner || (!pendingSale && (store.owner !== draftOwner || !store.orders.includes(order)))) {
      setSaveError("Pesanan berubah. Buka ulang pembayaran dari cart.");
      return;
    }
    saving.current = true;
    setBusy(true);
    setSaveError("");
    try {
      if (!cashSessionAllowsSales(await queryClient.fetchQuery(cashSessionOptions(account)), branchId)) {
        setDrawer(null);
        throw new Error('Buka shift dari Order atau Profil sebelum menyimpan pembayaran.');
      }
      if (orderOwner(useAuthStore.getState().session) !== draftOwner) throw new Error('Cabang atau akun berubah. Buka ulang pembayaran.')
      const payment: PaymentReceipt = {
        ...totals,
        order,
        method,
        additionalPrices: feeList,
        discounts: discountList,
        paid: isCash ? (paid ?? 0) : totals.total,
        change: isCash ? change : 0,
        proof,
      };
      let transactionId = pendingSale?.id;
      if (pendingSale) {
        await resolvePendingTransaction(order.id, {
          ...pendingPayment?.updates,
          methodCode: method.code,
          ...(isCash && { paid: payment.paid, change: payment.change }),
        }, branchId);
      } else {
        transactionId = await savePayment(payment, account, 'add_trx', branchId);
        void queryClient.invalidateQueries({ queryKey: ["products"] });
      }
      const receiptBranchId = branchId ?? pendingSale?.branchId ?? order.items[0]?.product.branchId ?? account.store?.branch_id;
      const receiptBranch = getAccountBranches(account.store).find(({ id }) => id === receiptBranchId)?.name;
      onComplete({
        ...payment,
        transactionId,
        additionalPrices: pendingPayment?.fees ?? payment.additionalPrices,
        taxAmount: pendingPayment?.taxAmount,
        completedAt: new Date(),
        cashier: account.account_fullname || account.account_username,
        store: pendingSale?.store || account.store?.name || account.event_location,
        branch: receiptBranch || (receiptBranchId === "all" ? undefined : receiptBranchId),
        salesperson: pendingSale?.salesperson?.name,
        proofPreview,
        recordedProof: method.code === recordedMethod?.code ? pendingSale?.paymentProof : undefined,
      });
      refreshCashSessionData(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    } catch (error) {
      refreshCashSessionData(queryClient);
      if (pendingSale) void queryClient.invalidateQueries({ queryKey: ['transactions'], refetchType: 'none' });
      const message = error instanceof Error ? error.message : "Pembayaran gagal disimpan. Coba lagi.";
      if (/buka shift/i.test(message)) setDrawer(null);
      setSaveError(message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section
        className="bento-surface overflow-hidden"
        aria-labelledby="product-summary"
      >
        <header className="border-b p-4 sm:p-5">
          <h2 id="product-summary" className="text-sm font-semibold">
            Ringkasan Produk
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {order.name} ({itemCount} item)
          </p>
        </header>
        <ul className="divide-y px-4 sm:px-5">
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
          <div className="border-t p-4"><OrderNoteField order={order} disabled={busy} /></div>
        )}
        <div className="grid grid-cols-2 gap-2 border-t p-3">
          <Button
            type="button"
            variant="outline"
            className="whitespace-normal"
            disabled={busy}
            onClick={() => openAdjustment("fee")}
          >
            <Plus aria-hidden="true" /> Tambah biaya
          </Button>
          <Button
            type="button"
            variant="outline"
            className="whitespace-normal"
            disabled={busy}
            onClick={() => openAdjustment("discount")}
          >
            <Tag aria-hidden="true" /> Tambah diskon
          </Button>
        </div>
      </section>

      <section
        className="bento-surface space-y-3 p-4 sm:p-5"
        aria-labelledby="payment-methods"
      >
        <h2 id="payment-methods" className="text-sm font-semibold">
          Metode Pembayaran
        </h2>
        {methodsQuery.isPending && (
          <SkeletonGroup label="Memuat metode pembayaran" className="space-y-2">
            <Skeleton className="h-11 w-full rounded-xl" />
            <Skeleton className="h-11 w-full rounded-xl" />
          </SkeletonGroup>
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
              const fee = customerPaymentFee(entry);
              return (
                <li key={entry.code}>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto min-h-11 w-full justify-start gap-3 rounded-xl bg-card whitespace-normal px-3 py-2 text-left aria-pressed:border-ring"
                    aria-pressed={entry.code === method?.code}
                    disabled={busy}
                    onClick={() => {
                      const cashAmount = !pendingSale || entry.code === method?.code ? paid : null;
                      setMethodCode(entry.code);
                      setPaid(cashAmount);
                      setSaveError("");
                      if (entry.kind === "cash") openCash(cashAmount);
                    }}
                  >
                    <Icon aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block">{entry.title}</span>
                      {fee && (
                        <span className="block text-xs text-muted-foreground">
                          {fee.type === "percent"
                            ? fee.amount.toLocaleString("id-ID") + "%"
                            : formatCurrency(fee.amount)}
                        </span>
                      )}
                      {entry.missingFee && (
                        <span className="block text-xs text-muted-foreground">
                          Fee sudah dihapus.
                        </span>
                      )}
                    </span>
                    {entry.code === method?.code && (
                      <Check className="size-4 shrink-0 text-accent-foreground" aria-hidden="true" />
                    )}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {showPaymentSummary && <div ref={summarySpaceRef} className="col-span-full" aria-hidden="true" />}
      {showPaymentSummary && <section
        ref={summaryRef}
        className="payment-summary-bar fixed inset-x-0 bottom-0 z-30 flex max-h-[60dvh] flex-col gap-2 rounded-t-2xl border-t bg-card pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pl-[calc(1rem+env(safe-area-inset-left))] pr-[calc(1rem+env(safe-area-inset-right))] sm:pl-[calc(1.5rem+env(safe-area-inset-left))] sm:pr-[calc(1.5rem+env(safe-area-inset-right))]"
        aria-labelledby="payment-total"
      >
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
          <h2 id="payment-total" className="text-sm font-semibold">Ringkasan Pembayaran</h2>
          {readyToPay && <StatusBadge tone="ready">Siap dibayar</StatusBadge>}
        </div>
        <div className="min-h-0 space-y-2 overflow-y-auto overscroll-contain">
          <dl className="space-y-2 text-sm">
            <TotalRow label="Subtotal produk" amount={totals.subtotal} />
            {!!pendingPayment?.taxAmount && <TotalRow label="PPN" amount={pendingPayment.taxAmount} />}
            {(pendingPayment?.fees ?? feeList).map(({ title, value }, index) => (
              <TotalRow key={`${title}-${index}`} label={title} amount={value} disabled={busy}
                onEdit={index < feeList.length ? () => openAdjustment("fee", index) : undefined} />
            ))}
            {totals.methodFeeAmount > 0 && (
              <TotalRow label="Fee" amount={totals.methodFeeAmount} />
            )}
            {discountList.map(({ title, type, value }, index) => (
              <TotalRow
                key={`${title}-${index}`}
                label={type === "percent" ? `${title} (${value.toLocaleString("id-ID")}%)` : title}
                amount={-(totals.discountAmounts[index] ?? 0)}
                disabled={busy}
                onEdit={() => openAdjustment("discount", index)}
              />
            ))}
            <TotalRow
              label="Total pembayaran"
              amount={totals.total}
              className="border-t pt-2 text-base font-semibold"
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
                      onClick={() => openCash()}
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
            <p role="status" className="text-sm text-warning-foreground">
              Nominal kurang {formatCurrency(totals.total - paid)}.
            </p>
          )}
          {saveError && (!drawerOpen || drawer !== "proof") && (
            <p role="alert" className="flex items-start gap-2 text-sm text-destructive">
              <CircleAlert className="mt-0.5 size-4 shrink-0 fill-destructive-indicator text-status-icon-foreground" aria-hidden="true" />
              {saveError}
            </p>
          )}
        </div>
        <Button
          type="button"
          className="h-12 w-full rounded-xl"
          loading={cashSession.isPending || methodsQuery.isPending || (!!pendingSale && methodsQuery.isFetching) || (busy && isCash)}
          disabled={payDisabled}
          onClick={() => {
            if (cashSession.isError) {
              setSaveError('Status shift belum bisa diperiksa. Coba lagi.');
              void cashSession.refetch();
              return;
            }
            if (!cashSessionAllowsSales(cashSession.data, branchId)) {
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
      </section>}

      <Drawer
        open={drawerOpen}
        dismissible={!busy}
        onOpenChange={(open) => {
          if (!open && !busy) setDrawer(null);
        }}
      >
        <DrawerContent
          onCloseAutoFocus={(event) => {
            if (!drawerTriggerRef.current?.isConnected) return;
            event.preventDefault();
            drawerTriggerRef.current.focus({ preventScroll: true });
          }}
          {...(drawer === "cash" || drawer === "qris" || drawer === "proof"
            ? {}
            : { "aria-describedby": undefined })}
        >
          {drawer && (
            <div className="drawer-step contents" key={drawer}>
              <DrawerHeader>
                <DrawerTitle ref={drawerTitleRef} tabIndex={-1}>
                  {unavailableMethod && "Metode pembayaran berubah"}
                  {!unavailableMethod && confirmingPayment && "Konfirmasi pembayaran"}
                  {!unavailableMethod && !confirmingPayment && drawerTitle}
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
                <DrawerFooter>
                  <DrawerClose asChild>
                    <Button type="button" variant="outline">
                      Pilih metode lain
                    </Button>
                  </DrawerClose>
                </DrawerFooter>
              )}
              {(drawer === "fee" || drawer === "discount") && (
                <PaymentAdjustment
                  key={`${drawer}-${adjustmentIndex ?? "new"}`}
                  kind={drawer}
                  initial={initialAdjustment}
                  onSave={saveAdjustment}
                  onRemove={removeAdjustment}
                />
              )}
              {drawer === "cash" && !unavailableMethod && (
                <>
                  <form
                    id={cashFormId}
                    className="modal-body"
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
                  <DrawerFooter>
                    <div className="modal-actions">
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
                  <DrawerBody className="payment-step-body">
                    {method?.image && failedQr !== method.image && (
                      <SkeletonImage
                        src={method.image}
                        alt="Kode QRIS toko"
                        className="mx-auto aspect-square max-w-[min(16rem,34dvh)] rounded-lg border bg-background"
                        imageClassName="size-full object-contain p-2"
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
                  </DrawerBody>
                  <DrawerFooter>
                    <div className="modal-actions">
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
                <DrawerBody className={cn("space-y-2", isQris && method?.image && "payment-step-body")}>
                  <p>Konfirmasi setelah pembayaran diterima.</p>
                  {saveError && (
                    <p role="alert" className="flex items-start gap-2 text-destructive">
                      <CircleAlert className="mt-0.5 size-4 shrink-0 fill-destructive-indicator text-status-icon-foreground" aria-hidden="true" />
                      {saveError}
                    </p>
                  )}
                </DrawerBody>
                <DrawerFooter>
                  <div className="modal-actions">
                    <DrawerClose asChild><Button type="button" variant="outline" disabled={busy}>Batal</Button></DrawerClose>
                    <Button type="button" loading={busy} disabled={busy} onClick={() => void finish()}>Selesaikan pembayaran</Button>
                  </div>
                </DrawerFooter>
              </> : <PaymentProof
                  busy={busy}
                  saveError={saveError}
                  required={isQris}
                  onFinish={(file, preview) => void finish(file, preview)}
                />)}
            </div>
          )}
        </DrawerContent>
      </Drawer>
      <PaymentLeaveDialog busy={busy} pending={!!pendingSale} />
    </div>
  );
}

function TotalRow({
  label,
  amount,
  className = "",
  onEdit,
  disabled,
}: {
  label: ReactNode;
  amount: number;
  className?: string;
  onEdit?: () => void;
  disabled?: boolean;
}) {
  const formattedAmount = formatCurrency(amount);
  return (
    <div className={cn("flex justify-between gap-3", onEdit && "items-center", className)}>
      <dt className="min-w-0 break-words">{label}</dt>
      <dd className="shrink-0 tabular-nums">
        {onEdit ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={onEdit}
            aria-label={typeof label === "string" ? `Edit ${label}, ${formattedAmount}` : `Edit ${formattedAmount}`}
            className="tabular-nums"
          >
            {formattedAmount}
            <Pencil className="shrink-0" aria-hidden="true" />
          </Button>
        ) : formattedAmount}
      </dd>
    </div>
  );
}
