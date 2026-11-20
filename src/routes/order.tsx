import { createFileRoute, redirect } from '@tanstack/react-router'
import { getAuthSession, isCashierEventLevel } from '@/features/auth/auth-store'
import { OrderPage } from '@/features/orders/order-page'

export const Route = createFileRoute('/order')({
  beforeLoad: () => {
    if (isCashierEventLevel(getAuthSession()?.account.event_level)) {
      throw redirect({ to: '/', replace: true })
    }
  },
  component: OrderPage,
})
