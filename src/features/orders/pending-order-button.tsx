import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { Account } from '@/features/auth/auth-store'
import { cashSessionAllowsSales, cashSessionOptions, refreshCashSessionData } from '@/features/cash-session/cash-session-query'
import { useOrderStore, type OrderDraft } from './order-store'
import { paymentTotals, savePayment } from './payment-details'
import { fetchPaymentMethods, paymentMethodsKey } from './payment-methods'

export function PendingOrderButton({ account, order, onQueued }: { account: Account; order: OrderDraft; onQueued: () => void }) {
  const [busy, setBusy] = useState(false)
  const saving = useRef(false)
  const queryClient = useQueryClient()

  async function queueOrder() {
    if (saving.current || !order.items.length) return
    saving.current = true
    setBusy(true)
    try {
      if (!cashSessionAllowsSales(await queryClient.fetchQuery(cashSessionOptions(account)))) {
        throw new Error('Buka shift di halaman Order sebelum memasukkan pesanan ke antrean.')
      }
      const methods = await queryClient.fetchQuery({
        queryKey: paymentMethodsKey(account.store?.id || account.event_id),
        queryFn: ({ signal }) => fetchPaymentMethods(signal),
        meta: { toast: false },
      })
      const method = methods.find(({ code }) => code === 'cash')
      if (!method) throw new Error('Metode Tunai tidak aktif.')

      const store = useOrderStore.getState()
      if (store.owner !== account.account_id || !store.orders.includes(order)) {
        throw new Error('Pesanan berubah. Buka ulang ringkasan pesanan.')
      }

      const totals = paymentTotals(order, null, null, method.fee)
      await savePayment({ ...totals, order, method, fee: null, discount: null, paid: 0, change: 0 }, account, 'pending_trx')
      const current = useOrderStore.getState()
      if (current.owner === account.account_id) {
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
      if (/buka shift/i.test(message)) onQueued()
      toast.error(message)
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  return (
    <Button type="button" variant="outline" className="h-auto min-h-8 whitespace-normal py-2"
      disabled={busy || !order.items.length} loading={busy} onClick={() => void queueOrder()}>
      Masukkan ke antrean
    </Button>
  )
}
