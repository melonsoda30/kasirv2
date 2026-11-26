import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuthStore } from '@/features/auth/auth-store'
import { refreshCashSessionData } from '@/features/cash-session/cash-session-query'
import { getProductPricing } from '@/features/products/product-pricing'
import { availableProductStock } from '@/features/products/product-stock'
import type { Product } from '@/features/products/sample-products'
import type { Sale } from '@/features/sales/sales-summary'
import { orderOwner, productKey, type OrderDraft, type OrderLine } from './order-store'
import { editPendingOrder, resolvePendingTransaction } from './payment-details'
import { findRecordedPaymentMethod, usePaymentMethods } from './payment-methods'

export function pendingOrderSearch(search: Record<string, unknown>): { edit?: string; session?: string } {
  return {
    edit: typeof search.edit === 'string' && search.edit.trim() ? search.edit : undefined,
    session: typeof search.session === 'string' ? search.session : undefined,
  }
}

export function pendingQuantityLimit(original: OrderDraft, id: string, product?: Product) {
  const reserved = original.items.find((item) => item.product.id === id)?.quantity ?? 0
  if (!product?.active) return reserved
  return Math.min(Number.MAX_SAFE_INTEGER, reserved + Math.floor(availableProductStock(product)))
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
      const savedMethod = findRecordedPaymentMethod(methods.data?.payments ?? [], recordedCode)
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

export function usePendingOrderCancellation(owner: string | undefined, branchId: string | undefined) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => {
      if (!owner || orderOwner(useAuthStore.getState().session) !== owner) {
        throw new Error('Cabang atau akun berubah. Buka ulang pesanan.')
      }
      return resolvePendingTransaction(id, undefined, branchId)
    },
    onSuccess: () => toast.success('Pesanan dibatalkan.'),
    onSettled: () => {
      refreshCashSessionData(queryClient)
      void queryClient.invalidateQueries({ queryKey: ['transactions'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
    },
    meta: { toast: false },
  })
}
