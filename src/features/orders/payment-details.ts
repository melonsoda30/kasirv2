import { orderTotal, type OrderDraft } from './order-store'
import { isAxiosError } from 'axios'
import { request } from '@/lib/api'

export type AdditionalFee = { name: string; amount: number }
export type Discount = { name: string; type: 'nominal' | 'percent'; value: number }

export function paymentTotals(order: OrderDraft, fee: AdditionalFee | null, discount: Discount | null) {
  const subtotal = orderTotal(order)
  const beforeDiscount = subtotal + (fee?.amount ?? 0)
  const discountAmount = Math.min(beforeDiscount, discount?.type === 'percent'
    ? Math.round(beforeDiscount * (discount.value / 100))
    : discount?.value ?? 0)
  return { subtotal, discountAmount, total: beforeDiscount - discountAmount }
}

export type PaymentReceipt = ReturnType<typeof paymentTotals> & {
  order: OrderDraft
  method: { code: string; title: string; kind: 'cash' | 'qris' | 'noncash' }
  fee: AdditionalFee | null
  discount: Discount | null
  paid: number
  change: number
  proof?: File
}

type PaymentResponse = { status?: string; msg?: string; message?: string }
const pendingOrders = new Set<string>()

export async function savePayment(payment: PaymentReceipt, cashierId: string, eventId: string) {
  const orderId = payment.order.id
  if (pendingOrders.has(orderId)) throw new Error('Pembayaran pesanan ini sedang diproses.')

  const data = new FormData()
  data.set('action', 'add_trx')
  data.set('kasir', cashierId)
  data.set('event_id', eventId)
  data.set('payment_methods', payment.method.code)
  data.set('payment_subtotal', String(payment.subtotal))
  data.set('payment_total_price', String(payment.total))
  if (payment.method.kind === 'cash') {
    data.set('payment_cash_nominal', String(payment.paid))
    data.set('payment_cash_change', String(payment.change))
  } else if (payment.proof) {
    data.set('payment_upload_file', payment.proof)
  }
  if (payment.fee) {
    data.set('payment_additional_price[0][id]', '1')
    data.set('payment_additional_price[0][title]', payment.fee.name)
    data.set('payment_additional_price[0][value]', String(payment.fee.amount))
  }
  if (payment.discount) {
    const percentage = payment.discount.type === 'percent'
    data.set('discounts[0][id]', '1')
    data.set('discounts[0][title]', payment.discount.name)
    data.set('discounts[0][type]', percentage ? 'percentage' : 'fixed')
    data.set('discounts[0][value]', String(percentage ? payment.discount.value : payment.discountAmount))
  }
  payment.order.items.forEach(({ product, unitPrice, quantity }, index) => {
    const field = 'menu[' + index + ']'
    data.set(field + '[menu_id]', product.id)
    data.set(field + '[product_sku]', product.id)
    data.set(field + '[menu_name]', product.title)
    data.set(field + '[menu_price]', String(unitPrice))
    data.set(field + '[menu_qty]', String(quantity))
    data.set(field + '[menu_price_total]', String(unitPrice * quantity))
    if (product.branchId) data.set(field + '[branch_id]', product.branchId)
  })
  pendingOrders.add(orderId)
  try {
    const response = await request<PaymentResponse | null>({
      url: '/transaksi/trx', method: 'POST', data,
    })
    if (response?.status !== 'success') {
      throw new Error(response?.msg || response?.message || 'Server belum mengonfirmasi pembayaran. Periksa riwayat penjualan.')
    }
  } catch (error) {
    if (isAxiosError<PaymentResponse>(error)) {
      if (!error.response || error.response.status >= 500) {
        throw new Error('Status pembayaran belum diketahui. Periksa riwayat penjualan sebelum mencoba lagi.', { cause: error })
      }
      throw new Error(error.response.data?.msg || error.response.data?.message || 'Server menolak pembayaran.', { cause: error })
    }
    throw error
  } finally {
    pendingOrders.delete(orderId)
  }
}
