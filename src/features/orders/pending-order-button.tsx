import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { getCashierBranch, isAdminAccount, useAuthStore, type Account } from '@/features/auth/auth-store'
import { cashSessionAllowsSales, cashSessionOptions, refreshCashSessionData } from '@/features/cash-session/cash-session-query'
import { orderOwner, useOrderStore, type OrderDraft } from './order-store'
import { paymentTotals, savePayment } from './payment-details'
import { fetchPaymentMethods, paymentMethodsKey } from './payment-methods'

export function PendingOrderButton({ account, order, onQueued, onShiftRequired }: {
  account: Account
  order: OrderDraft
  onQueued: () => void
  onShiftRequired: () => void
}) {
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const queryClient = useQueryClient()
  const owner = useAuthStore((state) => orderOwner(state.session))
  const branchId = useAuthStore((state) => getCashierBranch(state.session)?.id)
  const requiresShift = !isAdminAccount(account)

  async function queueOrder() {
    if (saving.current || !order.items.length) return
    saving.current = true
    setBusy(true)
    try {
      if (requiresShift && !cashSessionAllowsSales(await queryClient.fetchQuery(cashSessionOptions(account)), branchId)) {
        onShiftRequired()
        return
      }
      const { payments, ppnRate } = await queryClient.fetchQuery({
        queryKey: paymentMethodsKey(account.store?.id || account.event_id),
        queryFn: ({ signal }) => fetchPaymentMethods(signal),
        meta: { toast: false },
      })
      const method = payments.find(({ code }) => code === 'cash')
      if (!method) throw new Error('Metode Tunai tidak aktif.')

      const store = useOrderStore.getState()
      if (orderOwner(useAuthStore.getState().session) !== owner || store.owner !== owner || !store.orders.includes(order)) {
        throw new Error('Pesanan berubah. Buka ulang ringkasan pesanan.')
      }

      const totals = paymentTotals(order, [], [], method, ppnRate)
      await savePayment({ ...totals, order, method, additionalPrices: [], discounts: [], paid: 0, change: 0, ppn: ppnRate }, account, 'pending_trx', branchId)
      const current = useOrderStore.getState()
      if (current.owner === owner) {
        if (current.activeId === order.id) current.createOrder()
        current.removeOrder(order.id)
        toast.success('Pesanan masuk antrean.')
      }
      onQueued()
      refreshCashSessionData(queryClient)
      void queryClient.invalidateQueries({ queryKey: ['transactions'] })
      void queryClient.invalidateQueries({ queryKey: ['products'] })
    } catch (error) {
      refreshCashSessionData(queryClient)
      const message = error instanceof Error ? error.message : 'Pesanan gagal dimasukkan ke antrean.'
      if (requiresShift && /buka shift/i.test(message)) onShiftRequired()
      toast.error(message)
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  return (
    <Button type="button" variant="outline" className="whitespace-normal"
      disabled={busy || !order.items.length} loading={busy} onClick={() => void queueOrder()}>
      Masukkan ke antrean
    </Button>
  )
}
