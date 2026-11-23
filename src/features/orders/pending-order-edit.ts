import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '@/features/auth/auth-store'
import { refreshCashSessionData } from '@/features/cash-session/cash-session-query'
import { getProductPricing } from '@/features/products/product-pricing'
import type { Product } from '@/features/products/sample-products'
import type { Sale } from '@/features/sales/sales-summary'
import { orderOwner, productKey, type OrderDraft, type OrderLine } from './order-store'
import { editPendingOrder } from './payment-details'
import { findRecordedPaymentMethod, usePaymentMethods } from './payment-methods'

export function pendingOrderSearch(search: Record<string, unknown>): { edit?: string; session?: string } {
  return {
    edit: typeof search.edit === 'string' && search.edit.trim() ? search.edit : undefined,
    session: typeof search.session === 'string' ? search.session : undefined,
  }
}

export function pendingQuantityLimit(original: OrderDraft, id: string, product?: Product) {
  const reserved = original.items.find((item) => item.product.id === id)?.quantity ?? 0
  return reserved + (product?.active ? Math.max(0, Math.floor(product.stock)) : 0)
}

export function changePendingQuantity(order: OrderDraft, original: OrderDraft, id: string, quantity: number, product?: Product) {
  if (!Number.isSafeInteger(quantity) || quantity < 0 || quantity > pendingQuantityLimit(original, id, product)) return order
  const existing = order.items.find((item) => item.product.id === id)
  if (!quantity) return { ...order, items: order.items.filter((item) => item !== existing) }

  const saved = existing ?? original.items.find((item) => item.product.id === id)
  let line: OrderLine
  if (saved) line = { ...saved, quantity }
  else if (product) line = { key: productKey(product), product, quantity, unitPrice: getProductPricing(product).finalPrice }
  else return order
  return { ...order, items: existing ? order.items.map((item) => item === existing ? line : item) : [...order.items, line] }
}

export function usePendingOrderEdit(owner: string | undefined, enabled: boolean) {
  const queryClient = useQueryClient()
  const methods = usePaymentMethods(enabled)
  return useMutation({
    mutationFn: ({ order, transaction }: { order: OrderDraft; transaction: Sale }) => {
      if (!owner || orderOwner(useAuthStore.getState().session) !== owner) {
        throw new Error('Cabang atau akun berubah. Buka ulang pesanan.')
      }
      const recordedCode = transaction.paymentCode?.trim()
      const code = recordedCode?.toLowerCase()
      const savedMethod = findRecordedPaymentMethod(methods.data ?? [], recordedCode)
      let methodCode = savedMethod?.code ?? recordedCode
      if (!savedMethod && (code === 'cash' || code === 'tunai')) methodCode = 'cash'
      if (!savedMethod && code === 'qris') methodCode = 'qris'
      return editPendingOrder(order, transaction, methodCode)
    },
    onSettled: async () => {
      refreshCashSessionData(queryClient)
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['transactions'] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
      ])
    },
    meta: { toast: false },
  })
}
