import { orderTotal, type OrderDraft } from './order-store'
import { isAxiosError } from 'axios'
import { request } from '@/lib/api'
import { getAccountBranches, isAdminAccount, type Account } from '@/features/auth/auth-store'
import { formatShiftMessage } from '@/features/cash-session/cash-session-api'

export const MAX_PAYMENT_PROOF_SIZE = 5 * 1024 * 1024

export type AdditionalFee = { name: string; amount: number }
export type Discount = { name: string; type: 'nominal' | 'percent'; value: number }

export function paymentTotals(
  order: OrderDraft,
  fee: AdditionalFee | null,
  discount: Discount | null,
  methodFeeConfig?: { amount: number; type: string },
) {
  const subtotal = orderTotal(order)
  const methodFeeAmount = methodFeeConfig?.type === 'percent'
    ? Math.round(subtotal * (methodFeeConfig.amount / 100))
    : methodFeeConfig?.amount ?? 0
  const beforeDiscount = subtotal + (fee?.amount ?? 0) + methodFeeAmount
  const discountAmount = Math.min(beforeDiscount, discount?.type === 'percent'
    ? Math.round(beforeDiscount * (discount.value / 100))
    : discount?.value ?? 0)
  return { subtotal, methodFeeAmount, discountAmount, total: beforeDiscount - discountAmount }
}

export type PaymentReceipt = ReturnType<typeof paymentTotals> & {
  order: OrderDraft
  method: { code: string; title: string; kind: 'cash' | 'qris' | 'noncash'; fee?: { amount: number; type: string } }
  fee: AdditionalFee | null
  discount: Discount | null
  paid: number
  change: number
  proof?: File
  ppn?: number
  sales?: string
}

type PaymentResponse = { status?: string; msg?: string; message?: string }
const pendingOrders = new Set<string>()

export async function resolvePendingTransaction(id: string, payment?: Pick<PaymentReceipt, 'method' | 'paid' | 'change'>) {
  if (pendingOrders.has(id)) throw new Error('Pesanan ini sedang diproses.')
  const data = new FormData()
  data.set('trx_id', id)
  if (payment?.method.kind === 'cash') {
    data.set('payment_cash_nominal', String(payment.paid))
    data.set('payment_cash_change', String(payment.change))
  }
  pendingOrders.add(id)
  try {
    const response = await request<PaymentResponse | null>({
      url: '/transaction/trx.php', method: 'POST', params: { action: payment ? 'pay_trx' : 'cancel_trx' }, data,
    })
    if (response?.status !== 'success') throw new Error(formatShiftMessage(response?.msg || response?.message || 'Server belum mengonfirmasi perubahan pesanan.'))
  } catch (error) {
    if (isAxiosError<PaymentResponse>(error)) {
      if (!error.response || error.response.status >= 500) {
        throw new Error('Status pesanan belum diketahui. Periksa antrean sebelum mencoba lagi.', { cause: error })
      }
      throw new Error(formatShiftMessage(error.response.data?.msg || error.response.data?.message || 'Server menolak perubahan pesanan.'), { cause: error })
    }
    throw error
  } finally {
    pendingOrders.delete(id)
  }
}

export async function savePayment(payment: PaymentReceipt, account: Account, action: 'add_trx' | 'pending_trx' = 'add_trx') {
  const orderId = payment.order.id
  if (pendingOrders.has(orderId)) throw new Error('Pesanan ini sedang diproses.')
  if (payment.proof && payment.proof.size > MAX_PAYMENT_PROOF_SIZE) {
    throw new Error('Bukti pembayaran maksimal 5 MB.')
  }

  const data = new FormData()
  data.set('action', action)
  data.set('payment_methods', payment.method.code)
  data.set('payment_subtotal', String(payment.subtotal))
  data.set('payment_total_price', String(payment.total))
  if (payment.ppn !== undefined) data.set('payment_ppn', String(payment.ppn))
  if (payment.sales) data.set('sales', payment.sales)
  const note = payment.order.note?.trim()
  if (note) data.set('note', note)
  if (account.store?.all_branches && isAdminAccount(account)) {
    const branchIds = new Set(payment.order.items.map(({ product }) => product.branchId).filter(Boolean))
    if (branchIds.size > 1) throw new Error('Produk dalam satu transaksi harus berasal dari cabang yang sama.')
    const branchId = [...branchIds][0] || account.store.branch_id
    if (branchId && getAccountBranches(account.store).some(({ id }) => id === branchId)) {
      data.set('branch_id', branchId)
    }
  }
  if (action === 'add_trx' && payment.method.kind === 'cash') {
    data.set('payment_cash_nominal', String(payment.paid))
    data.set('payment_cash_change', String(payment.change))
  }
  if (action === 'add_trx' && payment.proof) data.set('payment_upload_file', payment.proof)
  const fees = payment.fee ? [payment.fee] : []
  if (payment.method.fee?.type === 'percent') {
    data.set('payment_fee', String(payment.method.fee.amount))
  } else if (payment.methodFeeAmount > 0) {
    fees.push({ name: 'Biaya pembayaran', amount: payment.methodFeeAmount })
  }
  fees.forEach(({ name, amount }, index) => {
    const field = 'payment_additional_price[' + index + ']'
    data.set(field + '[title]', name)
    data.set(field + '[value]', String(amount))
  })
  if (payment.discount) {
    const percentage = payment.discount.type === 'percent'
    data.set('discounts[0][title]', payment.discount.name)
    data.set('discounts[0][type]', percentage ? 'percent' : 'fixed')
    data.set('discounts[0][value]', String(percentage ? payment.discount.value : payment.discountAmount))
  }
  payment.order.items.forEach(({ product, unitPrice, quantity }, index) => {
    const field = 'product[' + index + ']'
    let discountType = 'none'
    if (product.discountType === 'Persentase (%)') discountType = 'percent'
    if (product.discountType === 'Nominal') discountType = 'fixed'
    data.set(field + '[product_id]', product.id)
    data.set(field + '[product_name]', product.title)
    data.set(field + '[product_qty]', String(quantity))
    data.set(field + '[product_price]', String(product.price))
    data.set(field + '[product_price_total]', String(unitPrice * quantity))
    if (product.category) data.set(field + '[product_category]', product.category)
    if (product.photo) data.set(field + '[product_img]', product.photo)
    if (product.description) data.set(field + '[product_description]', product.description)
    data.set(field + '[product_discount_type]', discountType)
    data.set(field + '[product_discount]', String(discountType === 'none' ? 0 : product.discount))
  })
  pendingOrders.add(orderId)
  try {
    const response = await request<PaymentResponse | null>({
      url: '/transaksi/trx', method: 'POST', data,
    })
    if (response?.status !== 'success') {
      throw new Error(formatShiftMessage(response?.msg || response?.message || 'Server belum mengonfirmasi transaksi. Periksa riwayat penjualan.'))
    }
  } catch (error) {
    if (isAxiosError<PaymentResponse>(error)) {
      if (!error.response || error.response.status >= 500) {
        throw new Error('Status transaksi belum diketahui. Periksa riwayat penjualan sebelum mencoba lagi.', { cause: error })
      }
      throw new Error(formatShiftMessage(error.response.data?.msg || error.response.data?.message || 'Server menolak transaksi.'), { cause: error })
    }
    throw error
  } finally {
    pendingOrders.delete(orderId)
  }
}
