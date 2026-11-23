import type { SalesFilters } from './sales-filters'

export type SaleStatus = 'complete' | 'pending' | 'delete' | 'unknown'

export interface SaleItem {
  productId: string
  title: string
  quantity: number
  unitPrice?: number
  lineTotal?: number
  image?: string
  category?: string
  description?: string
  discountType?: string
  discount?: number
}

export type SaleFee = { title: string; value: number }
export type SaleDiscount = SaleFee & { type: 'fixed' | 'percent' }

export interface Sale {
  id: string
  occurredAt: string
  store: string
  storeId?: string
  branchId?: string
  cashier: string
  salesperson?: { id: string; name: string }
  salesId?: string
  paymentMethod: string
  paymentCode?: string
  paymentFee?: number
  additionalPrices?: SaleFee[]
  discounts?: SaleDiscount[]
  subtotal?: number
  tax?: number
  note?: string
  status: SaleStatus
  paymentProof?: { url: string; name?: string; type: 'image' | 'document' }
  /** Final sale amount after discounts, excluding change. */
  total: number
  paid: number
  change?: number
  totalItems?: number
  items: SaleItem[]
}

export interface SalesSummary {
  transactions: number
  productsSold: number
  total: number
  change: number
  paymentTotals: Record<string, number>
  salesPromotions?: { name: string; total: number }[]
}

export function filterSales(sales: readonly Sale[], filters: SalesFilters, search: string): Sale[] {
  const query = search.trim().toLocaleLowerCase('id-ID')
  const start = filters.dateRange?.from ? new Date(filters.dateRange.from).setHours(0, 0, 0, 0) : undefined
  const end = filters.dateRange?.to ? new Date(filters.dateRange.to).setHours(23, 59, 59, 999) : undefined
  return sales.filter((sale) => {
    const date = new Date(sale.occurredAt).getTime()
    return (start === undefined || date >= start) && (end === undefined || date <= end) &&
      (filters.paymentMethod === 'all' || sale.paymentMethod === filters.paymentMethod ||
        (filters.paymentMethod === 'cash' && sale.paymentMethod === 'Tunai') ||
        (filters.paymentMethod === 'qris' && sale.paymentMethod === 'QRIS')) &&
      (filters.store === 'all' || (sale.storeId ?? sale.store) === filters.store) &&
      (filters.cashier === 'all' || sale.cashier === filters.cashier) &&
      (filters.product === 'all' || sale.items.some((item) => item.productId === filters.product)) &&
      (!query || [sale.id, sale.store, sale.cashier, ...sale.items.map((item) => item.title)]
        .some((text) => text.toLocaleLowerCase('id-ID').includes(query)))
  })
}

export function summarizeSales(sales: readonly Sale[]): SalesSummary {
  const paymentTotals: Record<string, number> = {}
  let total = 0, productsSold = 0, change = 0
  for (const sale of sales) {
    total += sale.total
    productsSold += sale.totalItems ?? sale.items.reduce((quantity, item) => quantity + item.quantity, 0)
    change += Math.max(0, sale.paid - sale.total)
    paymentTotals[sale.paymentMethod] = (paymentTotals[sale.paymentMethod] ?? 0) + sale.total
  }
  return { transactions: sales.length, productsSold, total, change, paymentTotals }
}
