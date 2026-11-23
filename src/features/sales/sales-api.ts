import { API_BASE_URL, isEmptyListResponse, request } from "../../lib/api";
import type { TransactionFilters } from "./sales-filters";
import { summarizeSales } from "./sales-summary";
import type { Sale, SaleDiscount, SaleFee, SaleItem, SaleStatus, SalesSummary } from "./sales-summary";

interface SummaryEntry {
  title: string;
  value: number | string;
}
interface TransactionItemData {
  product_id?: string | null;
  menu_id?: string | null;
  name: string;
  img: string;
  price: string | number;
  qty: string | number;
  price_total: string | number;
  category?: string;
  description?: string;
  discount_type?: string;
  discount?: string | number;
}

interface TransactionListData {
  summary: {
    transaction: SummaryEntry[];
    summary: SummaryEntry[];
    payments: SummaryEntry[];
    "sales-promotion"?: SummaryEntry[];
  } | [];
  data_trx: {
    trx_id: string;
    trx_kasir: string;
    trx_location: string;
    trx_date: string;
    trx_branch?: string;
    trx_sales?: { id: string | number; name: string } | null;
    trx_note?: string | null;
    trx_total: string | number;
    trx_payment: string;
    trx_change: string | number;
    trx_total_items: number;
    trx_status: string;
    trx_items?: TransactionItemData[];
  }[];
}

type TransactionListResponse =
  | TransactionListData
  | []
  | { status: string; msg?: string; data?: TransactionListData | [] };

function amount(value: number | string) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function optionalAmount(value: string | number | null | undefined) {
  if (value === undefined || value === null || String(value).trim() === "") return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function paymentLabel(value: string) {
  const code = value.toLowerCase();
  if (code === "cash") return "Tunai";
  if (code === "qris") return "QRIS";
  return value;
}

function transactionAsset(path: string) {
  return path && !/^[?#]/.test(path.trim())
    ? new URL(path, `${API_BASE_URL.replace(/\/$/, "")}/transaksi/`).href
    : "";
}

function mapTransactionItem(item: TransactionItemData): SaleItem {
  return {
    productId: item.product_id?.trim() || item.menu_id?.trim() || "",
    title: item.name.trim(),
    quantity: amount(item.qty),
    unitPrice: amount(item.price),
    lineTotal: amount(item.price_total),
    image: transactionAsset(item.img),
    ...(item.category !== undefined && { category: item.category }),
    ...(item.description !== undefined && { description: item.description }),
    ...(item.discount_type !== undefined && { discountType: item.discount_type }),
    ...(item.discount !== undefined && { discount: amount(item.discount) }),
  };
}

export function mapTransactionList(response: TransactionListResponse | null) {
  if (isEmptyListResponse(response)) return { sales: [], summary: summarizeSales([]) };
  let data: TransactionListData | [] | null | undefined;
  if (response && typeof response === "object" && "status" in response) {
    if (response.status !== "success")
      throw new Error(response.msg || "Gagal memuat daftar transaksi.");
    data = response.data;
  } else {
    data = response;
  }
  if (
    !data ||
    Array.isArray(data) ||
    !Array.isArray(data.data_trx)
  )
    throw new Error("Format daftar transaksi dari server tidak valid.");
  const summaryData = data.summary;
  if (Array.isArray(summaryData) && summaryData.length > 0) {
    throw new Error("Format daftar transaksi dari server tidak valid.");
  }
  if (!Array.isArray(summaryData) && (!summaryData || !Array.isArray(summaryData.transaction) ||
    !Array.isArray(summaryData.summary) || !Array.isArray(summaryData.payments))) {
    if (data.data_trx.length === 0) return { sales: [], summary: summarizeSales([]) };
    throw new Error("Format daftar transaksi dari server tidak valid.");
  }
  const statuses: Record<string, SaleStatus> = {
    completed: "complete",
    complete: "complete",
    pending: "pending",
    delete: "delete",
    deleted: "delete",
    cancelled: "delete",
  };
  const sales: Sale[] = data.data_trx.map((trx) => {
    const date = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(
      trx.trx_date,
    );
    const total = amount(trx.trx_total);
    const change = amount(trx.trx_change);
    const salesperson = trx.trx_sales;
    return {
      id: trx.trx_id,
      cashier: trx.trx_kasir,
      store: trx.trx_location,
      ...(trx.trx_branch && { branchId: trx.trx_branch }),
      ...(typeof trx.trx_note === "string" && trx.trx_note.trim()
        ? { note: trx.trx_note.trim() }
        : {}),
      ...((typeof salesperson?.id === "string" ||
        typeof salesperson?.id === "number") &&
      typeof salesperson.name === "string" &&
      salesperson.name.trim()
        ? {
            salesperson: {
              id: String(salesperson.id),
              name: salesperson.name.trim(),
            },
          }
        : {}),
      occurredAt: date
        ? `${date[3]}-${date[2]}-${date[1]}T${date[4]}:${date[5]}:00+07:00`
        : "",
      total,
      change,
      paid: total + change,
      paymentMethod: paymentLabel(trx.trx_payment),
      status: statuses[trx.trx_status.toLowerCase()] ?? "unknown",
      totalItems: amount(trx.trx_total_items),
      items: Array.isArray(trx.trx_items)
        ? trx.trx_items.map(mapTransactionItem)
        : [],
    };
  });
  if (Array.isArray(summaryData)) return { sales, summary: summarizeSales(sales) };
  const value = (entries: SummaryEntry[], title: string) =>
    amount(entries.find((entry) => entry.title === title)?.value ?? 0);
  const promotions = summaryData["sales-promotion"];
  const summary: SalesSummary = {
    transactions: value(summaryData.transaction, "transaction"),
    productsSold: value(summaryData.transaction, "items"),
    total: value(summaryData.summary, "sellings"),
    change: value(summaryData.summary, "changes"),
    paymentTotals: Object.fromEntries(
      summaryData.payments.map((entry) => [
        paymentLabel(entry.title),
        amount(entry.value),
      ]),
    ),
    ...(Array.isArray(promotions) && {
      salesPromotions: promotions.map(({ title, value }) => ({
        name: title,
        total: amount(value),
      })),
    }),
  };
  return { sales, summary };
}

function formatApiDate(date: Date | undefined) {
  if (!date || !Number.isFinite(date.getTime())) return undefined;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function transactionListParams(
  filters: TransactionFilters,
  search: string,
) {
  const keyword = search.trim();
  const cashier = filters.cashier?.trim();
  const sales = filters.sales?.trim();
  const payment = filters.paymentMethod;
  const { status } = filters;
  const startDate = formatApiDate(filters.dateRange?.from);
  const endDate = formatApiDate(filters.dateRange?.to);
  return {
    action: "list_trx",
    ...(keyword && { search: keyword }),
    ...(cashier && cashier !== "all" && { kasir: cashier }),
    ...(sales && sales !== "all" && { sales }),
    ...(payment && payment !== "all" && { payment }),
    ...(status && status !== "all" && { status }),
    ...(startDate && { startDate }),
    ...(endDate && { endDate }),
  };
}

export async function fetchTransactions(
  filters: TransactionFilters,
  search: string,
  signal?: AbortSignal,
) {
  const response = await request<TransactionListResponse | null>({
    url: "/transaction/trx",
    method: "GET",
    params: transactionListParams(filters, search),
    signal,
  });
  return mapTransactionList(response);
}

type TransactionDetailData = TransactionListData["data_trx"][number] & {
  trx_payment_fee?: string | number | null;
  trx_address?: string;
  trx_subtotal?: string | number;
  trx_ppn?: string | number;
  trx_additional_price?: StoredAdjustment[] | null;
  trx_discount?: (StoredAdjustment & { type?: string })[] | null;
  trx_nominal: string | number;
  trx_upload_file: string;
  trx_products: TransactionItemData[];
};

type StoredAdjustment = { title?: string; value?: number | string | null };

function mapAdjustment(entry: StoredAdjustment): SaleFee | undefined {
  const value = optionalAmount(entry?.value);
  if (typeof entry?.title === "string" && value !== undefined) return { title: entry.title, value };
}

export type TransactionDetailResponse =
  | TransactionDetailData
  | { status: string; msg?: string; data?: TransactionDetailData };

export function mapTransactionDetail(
  result: TransactionDetailResponse | null,
): Sale {
  let response: TransactionDetailData | null | undefined;
  if (result && typeof result === "object" && "status" in result) {
    if (result.status !== "success")
      throw new Error(result.msg || "Gagal memuat detail transaksi.");
    response = result.data;
  } else {
    response = result;
  }
  if (
    !response ||
    typeof response.trx_id !== "string" ||
    !Array.isArray(response.trx_products)
  ) {
    throw new Error("Format detail transaksi dari server tidak valid.");
  }
  const sale = mapTransactionList({
    summary: { transaction: [], summary: [], payments: [] },
    data_trx: [response],
  }).sales[0];
  const salesId = String(response.trx_sales?.id ?? "").trim();
  const paymentFee = optionalAmount(String(response.trx_payment_fee ?? "").trim().replace(/%$/, ""));
  const additionalPrices = Array.isArray(response.trx_additional_price)
    ? response.trx_additional_price.flatMap<SaleFee>((entry) => {
        const fee = mapAdjustment(entry);
        return fee ? [fee] : [];
      })
    : undefined;
  const discounts = Array.isArray(response.trx_discount)
    ? response.trx_discount.flatMap<SaleDiscount>((entry) => {
        const discount = mapAdjustment(entry);
        const type = entry?.type;
        return discount && (type === "fixed" || type === "percent") ? [{ ...discount, type }] : [];
      })
    : undefined;
  const proofType = /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(
    response.trx_upload_file,
  )
    ? "image"
    : "document";
  return {
    ...sale,
    paymentCode: response.trx_payment,
    ...(salesId && { salesId }),
    ...(paymentFee !== undefined && { paymentFee }),
    ...(additionalPrices && additionalPrices.length === response.trx_additional_price?.length && { additionalPrices }),
    ...(discounts && discounts.length === response.trx_discount?.length && { discounts }),
    ...(response.trx_subtotal !== undefined && {
      subtotal: amount(response.trx_subtotal),
    }),
    ...(response.trx_ppn !== undefined && { tax: amount(response.trx_ppn) }),
    paid: amount(response.trx_nominal),
    items: response.trx_products.map(mapTransactionItem),
    paymentProof:
      response.trx_payment.toLowerCase() === "qris" && response.trx_upload_file
        ? {
            url: transactionAsset(response.trx_upload_file),
            name: "Buka bukti pembayaran",
            type: proofType,
          }
        : undefined,
  };
}

export async function fetchTransactionDetail(
  trxId: string,
  signal?: AbortSignal,
) {
  const response = await request<TransactionDetailResponse | null>({
    url: "/transaction/trx",
    method: "GET",
    params: { action: "detail_trx", trx_id: trxId },
    signal,
  });
  const sale = mapTransactionDetail(response);
  if (sale.id !== trxId)
    throw new Error(
      "Detail transaksi tidak sesuai dengan transaksi yang dipilih.",
    );
  return sale;
}
