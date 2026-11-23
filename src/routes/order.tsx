import { createFileRoute, redirect } from '@tanstack/react-router'
import { getAuthSession, usesCashierMode } from '@/features/auth/auth-store'
import { OrderPage } from '@/features/orders/order-page'
import { pendingOrderSearch } from '@/features/orders/pending-order-edit'

export const Route = createFileRoute('/order')({
  validateSearch: pendingOrderSearch,
  beforeLoad: (context) => {
    if (usesCashierMode(getAuthSession())) {
      throw redirect({ to: '/', search: context?.search, replace: true })
    }
  },
  component: OrderRoute,
})

function OrderRoute() {
  const { edit, session } = Route.useSearch()
  return <OrderPage key={edit} editTrxId={edit} returnSession={session} />
}
