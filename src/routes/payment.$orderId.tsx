import { createFileRoute } from '@tanstack/react-router'
import { PaymentPage } from '@/features/orders/payment-page'

export const Route = createFileRoute('/payment/$orderId')({ component: PaymentRoute })

function PaymentRoute() {
  const { orderId } = Route.useParams()
  return <PaymentPage key={orderId} orderId={orderId} />
}
