import { createFileRoute } from '@tanstack/react-router'
import { PaymentPage } from '@/features/orders/payment-page'

export const Route = createFileRoute('/payment/$orderId')({
  validateSearch: (search: Record<string, unknown>): { pending?: boolean; session?: string } => ({
    pending: search.pending === true ? true : undefined,
    session: typeof search.session === 'string' ? search.session : undefined,
  }),
  component: PaymentRoute,
})

function PaymentRoute() {
  const { orderId } = Route.useParams()
  const { pending, session } = Route.useSearch()
  return <PaymentPage key={`${pending ? 'pending' : 'draft'}:${orderId}`} orderId={orderId} pending={pending} returnSession={session} />
}
