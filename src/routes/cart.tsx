import { createFileRoute } from '@tanstack/react-router'
import { CartPage } from '@/features/orders/cart-page'

export const Route = createFileRoute('/cart')({ component: CartPage })
