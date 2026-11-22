import { createFileRoute } from '@tanstack/react-router'
import { CartPage } from '@/features/orders/cart-page'

export const Route = createFileRoute('/cart')({
  validateSearch: (search: Record<string, unknown>): { session?: string } => ({ session: typeof search.session === 'string' ? search.session : undefined }),
  component: CartRoute,
})

function CartRoute() {
  const { session } = Route.useSearch()
  return <CartPage sessionId={session} />
}
