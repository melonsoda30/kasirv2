import { orderTotal, pendingOrderDraft, type OrderDraft } from "./order-store";
import { isAxiosError } from "axios";
import { z } from "zod";
import { request } from "@/lib/api";
import {
  getCashierBranches,
  isAdminAccount,
  type Account,
} from "@/features/auth/auth-store";
import { formatShiftMessage } from "@/features/cash-session/cash-session-api";
import { fetchTransactionDetail } from "@/features/sales/sales-api";
import type { Sale, SaleDiscount, SaleFee } from "@/features/sales/sales-summary";

export const MAX_PAYMENT_PROOF_SIZE = 100_000;

export type AdditionalFee = { name: string; amount: number };
export type Discount = {
  name: string;
  type: "nominal" | "percent";
  value: number;
};

type PaymentMethodSelection = {
  code: string;
  title: string;
  kind: "cash" | "qris" | "noncash";
  fee?: { amount: number; type: string };
  feeBearer?: string | null;
};

export function percentageOf(amount: number, percentage: number) {
  return Math.round(amount * (percentage / 100));
}

export function customerPaymentFee(method?: PaymentMethodSelection) {
  const fee = method?.fee;
  return method?.feeBearer === "customer" && fee && fee.amount > 0 ? fee : undefined;
}

function applyPaymentDiscounts(
  beforeDiscount: number,
  discounts: Pick<SaleDiscount, "value" | "type">[],
) {
  let total = beforeDiscount;
  const discountAmounts = discounts.map(({ type, value }) => {
    const amount = type === "percent" ? percentageOf(beforeDiscount, value) : value;
    const applied = Math.min(total, amount);
    total -= applied;
    return applied;
  });
  return {
    discountAmount: beforeDiscount - total,
    discountAmounts,
    total,
  };
}

function calculatePaymentTotals(
  subtotal: number,
  additionalAmount: number,
  discounts: Pick<SaleDiscount, "value" | "type">[],
  { paymentFeeRate = 0, fixedFee = 0, taxRate = 0, recordedTotal }: {
    paymentFeeRate?: number;
    fixedFee?: number;
    taxRate?: number;
    recordedTotal?: number;
  } = {},
) {
  const hasTax = taxRate > 0;
  const discountBase = subtotal + additionalAmount + (hasTax ? 0 : fixedFee);
  const discounted = applyPaymentDiscounts(discountBase, discounts);
  const taxAmount = percentageOf(discounted.total, taxRate);
  const beforeMethodFee = discounted.total + taxAmount + (hasTax ? fixedFee : 0);
  const percentageFee = Math.round(beforeMethodFee * paymentFeeRate / 100);
  const total = beforeMethodFee + percentageFee;
  if (recordedTotal !== undefined && total !== recordedTotal) {
    // Existing receipts may have calculated PPN from the product subtotal.
    const previousTax = percentageOf(subtotal, taxRate);
    const previousBase = subtotal + additionalAmount + fixedFee + previousTax;
    const previousDiscounted = applyPaymentDiscounts(previousBase, discounts);
    const previousPercentageFee = Math.round(previousDiscounted.total * paymentFeeRate / 100);
    const previousTotal = previousDiscounted.total + previousPercentageFee;
    if (!paymentFeeRate || previousTotal === recordedTotal) {
      return {
        subtotal,
        taxAmount: previousTax,
        methodFeeAmount: fixedFee + previousPercentageFee,
        ...previousDiscounted,
        total: previousTotal,
      };
    }
    const legacyFee = percentageOf(subtotal, paymentFeeRate);
    return {
      subtotal,
      taxAmount: previousTax,
      methodFeeAmount: fixedFee + legacyFee,
      ...applyPaymentDiscounts(previousBase + legacyFee, discounts),
    };
  }
  return { subtotal, taxAmount, methodFeeAmount: fixedFee + percentageFee, ...discounted, total };
}

export function recordedPaymentTotals(sale: Sale, subtotal: number) {
  const additionalPrices = sale.additionalPrices ?? [];
  const fixedFee = storedFixedFee(additionalPrices, sale.paymentFee)?.value ?? 0;
  return calculatePaymentTotals(
    subtotal,
    additionalPrices.reduce((sum, { value }) => sum + value, 0) - fixedFee,
    sale.discounts ?? [],
    { paymentFeeRate: sale.paymentFee, fixedFee, taxRate: sale.tax, recordedTotal: sale.total },
  );
}

export function paymentTotals(
  order: OrderDraft,
  additionalPrices: SaleFee[],
  discounts: SaleDiscount[],
  method?: PaymentMethodSelection,
  taxRate?: number,
) {
  const subtotal = orderTotal(order);
  const methodFeeConfig = customerPaymentFee(method);
  const isPercentageFee = methodFeeConfig?.type === "percent";
  return calculatePaymentTotals(
    subtotal,
    additionalPrices.reduce((sum, { value }) => sum + value, 0),
    discounts,
    {
      paymentFeeRate: isPercentageFee ? methodFeeConfig.amount : 0,
      fixedFee: isPercentageFee ? 0 : methodFeeConfig?.amount,
      taxRate,
    },
  );
}

export type PaymentReceipt = ReturnType<typeof paymentTotals> & {
  order: OrderDraft;
  method: PaymentMethodSelection;
  additionalPrices: SaleFee[];
  discounts: SaleDiscount[];
  paid: number;
  change: number;
  proof?: File;
  ppn?: number;
  sales?: string;
};

type PendingPayment = Partial<
  Pick<PaymentReceipt, "paid" | "change" | "ppn" | "subtotal" | "total">
> & {
  methodCode?: string;
  paymentFee?: number;
  additionalPrices?: AdditionalFee[];
  discounts?: SaleDiscount[];
};

type PaymentResponse = {
  status?: string;
  msg?: string;
  message?: string;
  trx_id?: string;
  trx_status?: string;
};
const pendingOrders = new Set<string>();
const paymentFeeTitle = "Biaya pembayaran";

type PaymentAdjustments = { additionalPrices?: SaleFee[]; discounts?: SaleDiscount[] };

export type SalePaymentChanges = PaymentAdjustments & {
  method: PaymentReceipt["method"];
  recordedMethod?: PaymentReceipt["method"];
  paid?: number;
};

function storedFixedFee(fees: readonly SaleFee[] | undefined, paymentFee?: number) {
  const last = fees?.at(-1);
  if (!paymentFee && last?.title === paymentFeeTitle) return last;
}

function recordedFixedFee(sale: Sale, method?: PaymentReceipt["method"]) {
  const last = storedFixedFee(sale.additionalPrices, sale.paymentFee);
  const fee = method?.fee;
  if (last && fee && fee.type !== "percent" &&
    (last.value === fee.amount || sale.status === "pending")) return last;
}

export function editableSaleFees(sale: Sale, method?: PaymentReceipt["method"]) {
  const fees = sale.additionalPrices ?? [];
  return (recordedFixedFee(sale, method) ? fees.slice(0, -1) : fees).filter(({ value }) => value !== 0);
}

export function pendingPaymentDetails(
  order: OrderDraft,
  sale: Sale,
  method?: PaymentReceipt["method"],
  recordedMethod?: PaymentReceipt["method"],
  adjustments: PaymentAdjustments = {},
  taxRate = sale.tax ?? 0,
) {
  const subtotal = sale.subtotal ?? orderTotal(order);
  const taxChanged = taxRate !== (sale.tax ?? 0);
  const methodChanged = !!method && method.code !== recordedMethod?.code;
  const useCurrentFee = methodChanged || (sale.status === "pending" && !!method);
  const currentFee = customerPaymentFee(method);
  const savedPaymentFee = sale.paymentFee ?? 0;
  const savedFixedFee = recordedFixedFee(sale, recordedMethod);
  const paymentFee = useCurrentFee
    ? (currentFee?.type === "percent" ? currentFee.amount : 0)
    : savedPaymentFee;
  let fixedFee = savedFixedFee?.value ?? 0;
  if (useCurrentFee) fixedFee = currentFee && currentFee.type !== "percent" ? currentFee.amount : 0;
  const paymentFeeChanged = paymentFee !== savedPaymentFee;
  const fixedFeeChanged = fixedFee !== (savedFixedFee?.value ?? 0);
  const extraFees = adjustments.additionalPrices ?? editableSaleFees(sale, recordedMethod);
  const fees = fixedFee ? [...extraFees, { title: paymentFeeTitle, value: fixedFee }] : extraFees;
  const discounts = adjustments.discounts ?? (sale.discounts ?? []).filter(({ value }) => value !== 0);
  let replacementFees: AdditionalFee[] | undefined;
  if (adjustments.additionalPrices || fixedFeeChanged) {
    replacementFees = fees.map(({ title, value }) => ({ name: title, amount: value }));
    const lastFee = sale.additionalPrices?.at(-1);
    // An indexed multipart array needs an entry to replace the last stored adjustment.
    if (!replacementFees.length && lastFee) replacementFees = [{ name: lastFee.title, amount: 0 }];
  }
  let replacementDiscounts = adjustments.discounts;
  const lastDiscount = sale.discounts?.at(-1);
  if (replacementDiscounts?.length === 0 && lastDiscount) {
    replacementDiscounts = [{ ...lastDiscount, value: 0 }];
  }
  const paymentChanged = methodChanged || paymentFeeChanged || fixedFeeChanged || taxChanged || !!adjustments.additionalPrices || !!adjustments.discounts;
  const recalculatePendingTotal = sale.status === "pending" && !!method && (paymentFee > 0 || taxRate > 0);
  const fixedFeeInList = fixedFee || (storedFixedFee(fees, paymentFee)?.value ?? 0);
  const totals = calculatePaymentTotals(
    subtotal,
    fees.reduce((sum, { value }) => sum + value, 0) - fixedFeeInList,
    discounts,
    {
      paymentFeeRate: paymentFee,
      fixedFee: fixedFeeInList,
      taxRate,
      recordedTotal: paymentChanged || recalculatePendingTotal ? undefined : sale.total,
    },
  );
  const totalChanged = paymentChanged || (recalculatePendingTotal && totals.total !== sale.total);
  const updates: PendingPayment = {
    ...((methodChanged || paymentFeeChanged) && { paymentFee }),
    ...(taxChanged && { ppn: taxRate }),
    ...(totalChanged && { total: totals.total }),
    ...(replacementFees && { additionalPrices: replacementFees }),
    ...(replacementDiscounts && { discounts: replacementDiscounts }),
  };
  return {
    totals: {
      ...totals,
      methodFeeAmount: totals.methodFeeAmount - fixedFeeInList,
      total: totalChanged ? totals.total : sale.total,
    },
    fees,
    updates,
  };
}

function appendAdjustments(
  data: FormData,
  fees: AdditionalFee[],
  discounts: SaleDiscount[],
) {
  fees.forEach(({ name, amount }, index) => {
    const field = "payment_additional_price[" + index + "]";
    data.set(field + "[title]", name);
    data.set(field + "[value]", String(amount));
  });
  discounts.forEach(({ title, type, value }, index) => {
    const field = "discounts[" + index + "]";
    data.set(field + "[title]", title);
    data.set(field + "[type]", type);
    data.set(field + "[value]", String(value));
  });
}

function appendPendingPayment(data: FormData, payment: PendingPayment) {
  if (payment.methodCode) data.set("payment_methods", payment.methodCode);
  const amounts = {
    payment_fee: payment.paymentFee,
    payment_cash_nominal: payment.paid,
    payment_cash_change: payment.change,
    payment_ppn: payment.ppn,
    payment_subtotal: payment.subtotal,
    payment_total_price: payment.total,
  };
  for (const [field, value] of Object.entries(amounts)) {
    if (value !== undefined) data.set(field, String(value));
  }
  appendAdjustments(data, payment.additionalPrices ?? [], payment.discounts ?? []);
}

export async function resolvePendingTransaction(
  id: string,
  payment?: PendingPayment,
  branchId?: string,
) {
  const data = new FormData();
  if (payment) appendPendingPayment(data, payment);
  return mutateTransaction(
    id,
    payment ? "pay_trx" : "cancel_trx",
    data,
    { branchId },
  );
}

export async function editPendingOrder(order: OrderDraft, transaction: Sale, methodCode = transaction.paymentCode) {
  if (transaction.id !== order.id || transaction.status !== "pending") {
    throw new Error("Pesanan sudah tidak menunggu pembayaran.");
  }
  const data = new FormData();
  const sales = transaction.salesId || transaction.salesperson?.id;
  if (sales) data.set("sales", sales);
  const subtotal = orderTotal(order);
  const additionalPrices = transaction.additionalPrices ?? [];
  const fixedFee = storedFixedFee(additionalPrices, transaction.paymentFee)?.value ?? 0;
  const { total } = calculatePaymentTotals(
    subtotal,
    additionalPrices.reduce((sum, { value }) => sum + value, 0) - fixedFee,
    transaction.discounts ?? [],
    { paymentFeeRate: transaction.paymentFee, taxRate: transaction.tax, fixedFee },
  );
  appendPendingPayment(data, {
    methodCode,
    total,
    paymentFee: transaction.paymentFee,
    paid: transaction.paid,
    change: transaction.change,
    additionalPrices: additionalPrices.map(({ title, value }) => ({ name: title, amount: value })),
    discounts: transaction.discounts,
  });
  appendProducts(data, order.items);
  return mutateTransaction(order.id, "edit_trx", data, {
    editedOrder: order,
  });
}

export async function editSalePayment(sale: Sale, changes: SalePaymentChanges, branchId?: string) {
  if (sale.status !== "complete" && sale.status !== "pending") {
    throw new Error("Status transaksi ini tidak dapat diedit.");
  }
  if (!changes.method.code.trim()) throw new Error("Pilih metode pembayaran yang aktif.");
  const { totals, updates } = pendingPaymentDetails(
    pendingOrderDraft(sale), sale, changes.method, changes.recordedMethod, changes,
  );
  if (updates.total !== undefined && sale.subtotal === undefined && !sale.items.length) {
    throw new Error("Subtotal transaksi tidak tersedia untuk menghitung ulang pembayaran.");
  }
  const data = new FormData();
  const payment: PendingPayment = { ...updates, methodCode: changes.method.code, total: totals.total };
  if (changes.method.kind === "cash") {
    const paid = changes.paid;
    if (paid === undefined || !Number.isSafeInteger(paid) || paid < 0 || (paid < totals.total && (sale.status === "complete" || paid > 0))) {
      throw new Error("Nominal tunai harus mencukupi total pembayaran.");
    }
    payment.paid = paid;
    payment.change = Math.max(0, paid - totals.total);
  } else if (changes.method.code !== changes.recordedMethod?.code) {
    payment.paid = 0;
    payment.change = 0;
  }
  appendPendingPayment(data, payment);
  return mutateTransaction(sale.id, "edit_trx", data, { branchId });
}

export type TransactionRefund = { reason: string } & (
  { isPartial: false } | { isPartial: true; nominal: number }
);

const refundResponse = z.object({
  trx_id: z.string(),
  trx_status: z.enum(["refund_partial", "refund_full"]),
  refund: z.object({
    amount: z.number().positive(),
    method: z.literal("cash"),
    reason: z.string().trim().min(1),
  }),
  omzet: z.number().nonnegative(),
  restored: z.number().int().nonnegative().optional(),
});

export function isValidPartialRefund(nominal: number, total: number) {
  return Number.isFinite(nominal) && Number.isFinite(total) && nominal > 0 && nominal < total;
}

export async function refundSale(sale: Sale, refund: TransactionRefund, branchId?: string) {
  if (sale.status !== "complete") throw new Error("Refund hanya tersedia untuk transaksi lunas.");
  if (!Number.isFinite(sale.total) || sale.total <= 0) throw new Error("Total pembayaran tidak valid.");
  const reason = refund.reason?.trim();
  if (!reason) throw new Error("Alasan refund wajib diisi.");
  if (refund.isPartial && !isValidPartialRefund(refund.nominal, sale.total)) {
    throw new Error("Nominal refund parsial harus lebih dari nol dan di bawah total pembayaran.");
  }
  const status = refund.isPartial ? "refund_partial" : "refund_full";
  const data = new FormData();
  data.set("refund_status", status);
  data.set("refund_reason", reason);
  if (refund.isPartial) data.set("refund_amount", String(refund.nominal));
  const response = refundResponse.safeParse(await mutateTransaction(sale.id, "edit_trx", data, { branchId }));
  if (!response.success || response.data.trx_id !== sale.id || response.data.trx_status !== status) {
    throw new Error("Server belum mengonfirmasi refund. Periksa detail transaksi sebelum mencoba lagi.");
  }
  return {
    id: response.data.trx_id,
    status: response.data.trx_status,
    refund: { ...response.data.refund, restored: response.data.restored },
    netRevenue: response.data.omzet,
  };
}

function productSnapshot(order: OrderDraft) {
  return JSON.stringify(
    order.items
      .map(({ product, quantity }) => JSON.stringify([product.id, quantity]))
      .sort(),
  );
}

async function mutateTransaction(
  id: string,
  action: "pay_trx" | "cancel_trx" | "edit_trx",
  data: FormData,
  { branchId, editedOrder }: { branchId?: string; editedOrder?: OrderDraft },
) {
  if (!id.trim()) throw new Error("ID transaksi wajib diisi.");
  if (pendingOrders.has(id)) throw new Error("Pesanan ini sedang diproses.");
  data.set("action", action);
  data.set("trx_id", id);
  const isRefund = data.has("refund_status");
  pendingOrders.add(id);
  try {
    if (branchId && (await fetchTransactionDetail(id)).branchId !== branchId) {
      throw new Error("Cabang pesanan tidak sesuai dengan cabang kasir.");
    }
    const response = await request<PaymentResponse | null>({
      url: "/transaction/trx",
      method: "POST",
      data,
    });
    if (response?.status !== "success")
      throw new Error(
        formatShiftMessage(
          response?.msg ||
            response?.message ||
            (isRefund ? "Server belum mengonfirmasi refund." : "Server belum mengonfirmasi perubahan pesanan."),
        ),
      );
    if (
      action === "pay_trx" &&
      ((response.trx_id && response.trx_id !== id) ||
        (response.trx_status && response.trx_status !== "completed"))
    ) {
      throw new Error("Server belum mengonfirmasi pelunasan transaksi ini.");
    }
    if (editedOrder) {
      const savedOrder = pendingOrderDraft(await fetchTransactionDetail(id));
      if (productSnapshot(editedOrder) !== productSnapshot(savedOrder)) {
        throw new Error(
          "Server belum mengonfirmasi perubahan produk. Periksa kembali antrean.",
        );
      }
    }
    return response;
  } catch (error) {
    if (isAxiosError<PaymentResponse>(error)) {
      if (!error.response || error.response.status >= 500) {
        throw new Error(
          isRefund
            ? "Status refund belum diketahui. Periksa detail transaksi sebelum mencoba lagi."
            : "Status pesanan belum diketahui. Periksa antrean sebelum mencoba lagi.",
          { cause: error },
        );
      }
      throw new Error(
        formatShiftMessage(
          error.response.data?.msg ||
            error.response.data?.message ||
            (isRefund ? "Server menolak refund." : "Server menolak perubahan pesanan."),
        ),
        { cause: error },
      );
    }
    throw error;
  } finally {
    pendingOrders.delete(id);
  }
}

function appendProducts(data: FormData, items: OrderDraft["items"]) {
  if (!items.length)
    throw new Error("Tambahkan produk sebelum menyimpan transaksi.");
  items.forEach(({ product, unitPrice, quantity }, index) => {
    if (
      !product.id?.trim() ||
      !product.title?.trim() ||
      !Number.isFinite(quantity) ||
      quantity <= 0 ||
      !Number.isFinite(product.price) ||
      product.price < 0 ||
      !Number.isFinite(unitPrice * quantity) ||
      unitPrice < 0
    ) {
      throw new Error("Data produk dalam pesanan tidak valid.");
    }
    const field = "product[" + index + "]";
    let discountType = "none";
    if (product.discountType === "Persentase (%)") discountType = "percent";
    if (product.discountType === "Nominal") discountType = "fixed";
    data.set(field + "[product_id]", product.id);
    data.set(field + "[product_name]", product.title);
    data.set(field + "[product_qty]", String(quantity));
    data.set(field + "[product_price]", String(product.price));
    data.set(field + "[product_price_total]", String(unitPrice * quantity));
    if (product.category)
      data.set(field + "[product_category]", product.category);
    if (product.photo) data.set(field + "[product_img]", product.photo);
    if (product.description)
      data.set(field + "[product_description]", product.description);
    data.set(field + "[product_discount_type]", discountType);
    data.set(
      field + "[product_discount]",
      String(discountType === "none" ? 0 : product.discount),
    );
  });
}

export async function savePayment(
  payment: PaymentReceipt,
  account: Account,
  action: "add_trx" | "pending_trx" = "add_trx",
  cashierBranchId?: string,
) {
  const { id: orderId, items } = payment.order;
  const store = account.store;
  if (pendingOrders.has(orderId))
    throw new Error("Pesanan ini sedang diproses.");
  if (!payment.method.code.trim())
    throw new Error("Pilih metode pembayaran yang aktif.");
  if (!Number.isFinite(payment.total) || payment.total < 0)
    throw new Error("Total pembayaran tidak valid.");
  if (payment.proof && payment.proof.size >= MAX_PAYMENT_PROOF_SIZE) {
    throw new Error("Bukti pembayaran harus berukuran di bawah 100 KB.");
  }
  if (
    store?.id &&
    items.some(({ product }) => product.storeId && product.storeId !== store.id)
  ) {
    throw new Error("Produk harus berasal dari toko kasir.");
  }

  const branchIds = new Set(
    items.map(({ product }) => product.branchId).filter(Boolean),
  );
  const canChooseBranch = !!store?.all_branches && isAdminAccount(account);
  const storeBranchId =
    store?.branch_id === "all" ? undefined : store?.branch_id;
  const transactionBranchId =
    cashierBranchId || (canChooseBranch ? undefined : storeBranchId);
  if (
    transactionBranchId &&
    items.some(
      ({ product }) =>
        (cashierBranchId || product.branchId) &&
        product.branchId !== transactionBranchId,
    )
  ) {
    throw new Error("Produk harus berasal dari cabang kasir yang dipilih.");
  }
  if (branchIds.size > 1)
    throw new Error(
      "Produk dalam satu transaksi harus berasal dari cabang yang sama.",
    );

  const data = new FormData();
  data.set("action", action);
  data.set("payment_methods", payment.method.code);
  data.set("payment_subtotal", String(payment.subtotal));
  data.set("payment_total_price", String(payment.total));
  if (payment.ppn !== undefined) data.set("payment_ppn", String(payment.ppn));
  if (payment.sales) data.set("sales", payment.sales);
  const note = payment.order.note?.trim();
  if (note) data.set("note", note);
  if (canChooseBranch) {
    const branchId = cashierBranchId || [...branchIds][0];
    if (branchId) {
      if (!getCashierBranches(store).some(({ id }) => id === branchId)) {
        throw new Error("Branch tidak terdaftar di store ini");
      }
      data.set("branch_id", branchId);
    }
  }
  if (action === "pending_trx" || payment.method.kind === "cash") {
    data.set(
      "payment_cash_nominal",
      String(action === "pending_trx" ? 0 : payment.paid),
    );
    data.set(
      "payment_cash_change",
      String(action === "pending_trx" ? 0 : payment.change),
    );
  }
  if (payment.proof) data.set("payment_upload_file", payment.proof);
  const fees = payment.additionalPrices.map(({ title, value }) => ({ name: title, amount: value }));
  const methodFee = customerPaymentFee(payment.method);
  if (methodFee?.type === "percent") {
    data.set("payment_fee", String(methodFee.amount));
  } else if (methodFee && payment.methodFeeAmount > 0) {
    fees.push({ name: paymentFeeTitle, amount: payment.methodFeeAmount });
  }
  const discounts = payment.discounts.map((discount, index) =>
    discount.type === "fixed" ? { ...discount, value: payment.discountAmounts[index] } : discount,
  );
  appendAdjustments(data, fees, discounts);
  appendProducts(data, items);
  pendingOrders.add(orderId);
  try {
    const response = await request<PaymentResponse | null>({
      url: "/transaction/trx",
      method: "POST",
      data,
    });
    if (response?.status !== "success") {
      throw new Error(
        formatShiftMessage(
          response?.msg ||
            response?.message ||
            "Server belum mengonfirmasi transaksi. Periksa riwayat penjualan.",
        ),
      );
    }
    return typeof response.trx_id === "string" ? response.trx_id.trim() || undefined : undefined;
  } catch (error) {
    if (isAxiosError<PaymentResponse>(error)) {
      if (!error.response || error.response.status >= 500) {
        throw new Error(
          "Status transaksi belum diketahui. Periksa riwayat penjualan sebelum mencoba lagi.",
          { cause: error },
        );
      }
      throw new Error(
        formatShiftMessage(
          error.response.data?.msg ||
            error.response.data?.message ||
            "Server menolak transaksi.",
        ),
        { cause: error },
      );
    }
    throw error;
  } finally {
    pendingOrders.delete(orderId);
  }
}
