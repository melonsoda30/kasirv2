import { useAuthStore, usesCashierMode } from './features/auth/auth-store'
import { DashboardPage } from './features/dashboard/dashboard-page'
import { OrderPage } from './features/orders/order-page'

export default function App({ editTrxId, returnSession }: { editTrxId?: string; returnSession?: string } = {}) {
  const cashierMode = useAuthStore((state) => usesCashierMode(state.session))
  return cashierMode ? <OrderPage key={editTrxId} home editTrxId={editTrxId} returnSession={returnSession} /> : <DashboardPage />
}
