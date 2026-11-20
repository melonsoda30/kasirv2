import { API_BASE_URL, request } from '../../lib/api'
import type { SalesFilters } from './sales-filters'
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
    trx_sales?: { id: string; name: string } | null
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
  return value.toLowerCase() === 'cash' ? 'Tunai' : value.toLowerCase() === 'qris' ? 'QRIS' : value
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
  const statuses: Record<string, SaleStatus> = { completed: 'complete', complete: 'complete', pending: 'pending', delete: 'delete', deleted: 'delete' }
  const sales: Sale[] = data.data_trx.map((trx) => {
    const date = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/.exec(trx.trx_date)
    const total = amount(trx.trx_total)
    const change = amount(trx.trx_change)
    const salesperson = trx.trx_sales
    return {
      id: trx.trx_id, cashier: trx.trx_kasir, store: trx.trx_location,
      ...(typeof salesperson?.id === 'string' && typeof salesperson.name === 'string' && salesperson.name.trim()
        ? { salesperson: { id: salesperson.id, name: salesperson.name.trim() } }
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

export function transactionListParams(filters: SalesFilters, search: string) {
  return {
    action: 'list_trx',
    kasir: filters.cashier,
    sales: 'all',
    search: search.trim(),
    shift: 'all',
    payment: filters.paymentMethod === 'Tunai' ? 'cash' : filters.paymentMethod === 'QRIS' ? 'qris' : filters.paymentMethod,
    event_id: filters.store,
    startDate: formatApiDate(filters.dateRange?.from),
    endDate: formatApiDate(filters.dateRange?.to),
    sku: 'all',
  }
}

export async function fetchTransactions(filters: SalesFilters, search: string, signal?: AbortSignal) {
  const response = await request<TransactionListResponse | null>({ url: '/transaksi/trx', method: 'GET', params: transactionListParams(filters, search), signal })
  return mapTransactionList(response)
}

export type TransactionDetailResponse = TransactionListData['data_trx'][number] & {
  trx_nominal: string | number
  trx_upload_file: string
  trx_products: {
    menu_id: string; name: string; img: string; price: string | number
    qty: string | number; price_total: string | number
  }[]
}

export function mapTransactionDetail(response: TransactionDetailResponse): Sale {
  if (!response || typeof response.trx_id !== 'string' || !Array.isArray(response.trx_products)) {
    throw new Error('Format detail transaksi dari server tidak valid.')
  }
  const sale = mapTransactionList({ summary: { transaction: [], summary: [], payments: [] }, data_trx: [response] }).sales[0]
  const asset = (path: string) => path ? new URL(path, `${API_BASE_URL.replace(/\/$/, '')}/transaksi/`).href : ''
  return {
    ...sale,
    paid: amount(response.trx_nominal),
    items: response.trx_products.map((item) => ({
      productId: item.menu_id, title: item.name.trim(), quantity: amount(item.qty),
      unitPrice: amount(item.price), lineTotal: amount(item.price_total), image: asset(item.img),
    })),
    paymentProof: response.trx_payment.toLowerCase() === 'qris' && response.trx_upload_file ? {
      url: asset(response.trx_upload_file), name: 'Buka bukti pembayaran',
      type: /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(response.trx_upload_file) ? 'image' : 'document',
    } : undefined,
  }
}

export async function fetchTransactionDetail(trxId: string, signal?: AbortSignal) {
  const response = await request<TransactionDetailResponse>({
    url: '/transaksi/trx', method: 'GET', params: { action: 'detail_trx', trx_id: trxId }, signal,
  })
  if (response?.trx_id !== trxId) throw new Error('Detail transaksi tidak sesuai dengan transaksi yang dipilih.')
  return mapTransactionDetail(response)
}
