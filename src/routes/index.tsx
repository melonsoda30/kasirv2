import { createFileRoute } from '@tanstack/react-router'
import App from '../App'
import { pendingOrderSearch } from '@/features/orders/pending-order-edit'

export const Route = createFileRoute('/')({ validateSearch: pendingOrderSearch, component: HomeRoute })

function HomeRoute() {
  const { edit, session } = Route.useSearch()
  return <App editTrxId={edit} returnSession={session} />
}
