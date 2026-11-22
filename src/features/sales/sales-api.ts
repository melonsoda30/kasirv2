import { API_BASE_URL, request } from '../../lib/api'
import type { TransactionFilters } from './sales-filters'
import type { Sale, SaleStatus, SalesSummary } from './sales-summary'

interface SummaryEntry { title: string; value: number | string }
interface TransactionListData {
  summary: {
    transaction: SummaryEntry[]
    summary: SummaryEntry[]
    payments: SummaryEntry[]
    'sales-promotion'?: SummaryEntry[]
  }
  data_trx: {
    trx_id: string; trx_kasir: string; trx_location: string; trx_date: string
    trx_sales?: { id: string | number; name: string } | null
    trx_note?: string | null
    trx_total: string | number; trx_payment: string; trx_change: string | number
    trx_total_items: number; trx_status: string
  }[]
}

type TransactionListResponse = TransactionListData | { status: string; msg?: string; data?: TransactionListData }

function amount(value: number | string) {
  const number = Number(value)
  return Number.isFinite(number) ? number : 0
}

function paymentLabel(value: string) {
  const code = value.toLowerCase()
  if (code === 'cash') return 'Tunai'
  if (code === 'qris') return 'QRIS'
  return value
}

export function mapTransactionList(response: TransactionListResponse | null) {
  let data: TransactionListData | null | undefined
  if (response && typeof response === 'object' && 'status' in response) {
    if (response.status !== 'success') throw new Error(response.msg || 'Gagal memuat daftar transaksi.')
    data = response.data
  } else {
    data = response
  }
  if (!data || !Array.isArray(data.data_trx) || !data.summary ||
      !Array.isArray(data.summary.transaction) || !Array.isArray(data.summary.summary) ||
      !Array.isArray(data.summary.payments)) throw new Error('Format daftar transaksi dari server tidak valid.')
  const statuses: Record<string, SaleStatus> = { completed: 'complete', complete: 'complete', pending: 'pending', delete: 'delete', deleted: 'delete', cancelled: 'delete' }
  const sales: Sale[] = data.data_trx.map((trx) => {
    const date = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(trx.trx_date)
    const total = amount(trx.trx_total)
    const change = amount(trx.trx_change)
    const salesperson = trx.trx_sales
    return {
      id: trx.trx_id, cashier: trx.trx_kasir, store: trx.trx_location,
      ...(typeof trx.trx_note === 'string' && trx.trx_note.trim() ? { note: trx.trx_note.trim() } : {}),
      ...((typeof salesperson?.id === 'string' || typeof salesperson?.id === 'number') && typeof salesperson.name === 'string' && salesperson.name.trim()
        ? { salesperson: { id: String(salesperson.id), name: salesperson.name.trim() } }
        : {}),
      occurredAt: date ? `${date[3]}-${date[2]}-${date[1]}T${date[4]}:${date[5]}:00+07:00` : '',
      total, change, paid: total + change, paymentMethod: paymentLabel(trx.trx_payment),
      status: statuses[trx.trx_status.toLowerCase()] ?? 'unknown',
      totalItems: amount(trx.trx_total_items), items: [],
    }
  })
  const value = (entries: SummaryEntry[], title: string) => amount(entries.find((entry) => entry.title === title)?.value ?? 0)
  const promotions = data.summary['sales-promotion']
  const summary: SalesSummary = {
    transactions: value(data.summary.transaction, 'transaction'),
    productsSold: value(data.summary.transaction, 'items'),
    total: value(data.summary.summary, 'sellings'),
    change: value(data.summary.summary, 'changes'),
    paymentTotals: Object.fromEntries(data.summary.payments.map((entry) => [paymentLabel(entry.title), amount(entry.value)])),
    ...(Array.isArray(promotions) && {
      salesPromotions: promotions.map(({ title, value }) => ({ name: title, total: amount(value) })),
    }),
  }
  return { sales, summary }
}

function formatApiDate(date: Date | undefined) {
  if (!date) return ''
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function transactionListParams(filters: TransactionFilters, search: string) {
  let payment = filters.paymentMethod
  if (payment === 'Tunai') payment = 'cash'
  if (payment === 'QRIS') payment = 'qris'
  return {
    action: 'list_trx',
    kasir: filters.cashier,
    sales: 'all',
    search: search.trim(),
    shift: 'all',
    payment,
    branch_id: filters.store,
    ...(filters.status && { status: filters.status }),
    startDate: formatApiDate(filters.dateRange?.from),
    endDate: formatApiDate(filters.dateRange?.to),
    sku: 'all',
  }
}

export async function fetchTransactions(filters: TransactionFilters, search: string, signal?: AbortSignal) {
  const response = await request<TransactionListResponse | null>({ url: '/transaksi/trx', method: 'GET', params: transactionListParams(filters, search), signal })
  return mapTransactionList(response)
}

type TransactionDetailData = TransactionListData['data_trx'][number] & {
  trx_payment_fee?: string
  trx_address?: string
  trx_branch?: string
  trx_subtotal?: string | number
  trx_ppn?: string | number
  trx_additional_price?: unknown[]
  trx_discount?: unknown[]
  trx_nominal: string | number
  trx_upload_file: string
  trx_products: {
    menu_id: string; name: string; img: string; price: string | number
    qty: string | number; price_total: string | number
    category?: string; description?: string
    discount_type?: string; discount?: string | number
  }[]
}

export type TransactionDetailResponse = TransactionDetailData | { status: string; msg?: string; data?: TransactionDetailData }

export function mapTransactionDetail(result: TransactionDetailResponse | null): Sale {
  let response: TransactionDetailData | null | undefined
  if (result && typeof result === 'object' && 'status' in result) {
    if (result.status !== 'success') throw new Error(result.msg || 'Gagal memuat detail transaksi.')
    response = result.data
  } else {
    response = result
  }
  if (!response || typeof response.trx_id !== 'string' || !Array.isArray(response.trx_products)) {
    throw new Error('Format detail transaksi dari server tidak valid.')
  }
  const sale = mapTransactionList({ summary: { transaction: [], summary: [], payments: [] }, data_trx: [response] }).sales[0]
  const asset = (path: string) => path && !/^[?#]/.test(path.trim())
    ? new URL(path, `${API_BASE_URL.replace(/\/$/, '')}/transaksi/`).href : ''
  const proofType = /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(response.trx_upload_file) ? 'image' : 'document'
  return {
    ...sale,
    paymentCode: response.trx_payment,
    ...(response.trx_subtotal !== undefined && { subtotal: amount(response.trx_subtotal) }),
    ...(response.trx_ppn !== undefined && { tax: amount(response.trx_ppn) }),
    paid: amount(response.trx_nominal),
    items: response.trx_products.map((item) => ({
      productId: item.menu_id, title: item.name.trim(), quantity: amount(item.qty),
      unitPrice: amount(item.price), lineTotal: amount(item.price_total), image: asset(item.img),
    })),
    paymentProof: response.trx_payment.toLowerCase() === 'qris' && response.trx_upload_file ? {
      url: asset(response.trx_upload_file), name: 'Buka bukti pembayaran',
      type: proofType,
    } : undefined,
  }
}

export async function fetchTransactionDetail(trxId: string, signal?: AbortSignal) {
  const response = await request<TransactionDetailResponse | null>({
    url: '/transaksi/trx', method: 'GET', params: { action: 'detail_trx', trx_id: trxId }, signal,
  })
  const sale = mapTransactionDetail(response)
  if (sale.id !== trxId) throw new Error('Detail transaksi tidak sesuai dengan transaksi yang dipilih.')
  return sale
}
