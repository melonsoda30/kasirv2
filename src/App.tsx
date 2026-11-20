import { isCashierEventLevel, useAuthStore } from './features/auth/auth-store'
import { DashboardPage } from './features/dashboard/dashboard-page'
import { OrderPage } from './features/orders/order-page'

export default function App() {
  const eventLevel = useAuthStore((state) => state.session?.account.event_level)
  return isCashierEventLevel(eventLevel) ? <OrderPage home /> : <DashboardPage />
}
