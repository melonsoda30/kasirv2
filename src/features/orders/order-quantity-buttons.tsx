import { Minus, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import type { Product } from '@/features/products/sample-products'
import { useOrderStore } from './order-store'
import type { OrderLine } from './order-store'

export function OrderQuantityButtons({ orderId, item, catalogProduct }: { orderId: string; item: OrderLine; catalogProduct?: Product }) {
  const orders = useOrderStore((state) => state.orders)
  const product = catalogProduct ?? { ...item.product, active: false, stock: 0 }
  const reserved = orders.reduce((sum, order) =>
    sum + (order.items.find((line) => line.key === item.key)?.quantity ?? 0), 0)

  function change(delta: number) {
    const state = useOrderStore.getState()
    const order = state.orders.find((order) => order.id === orderId)
    const line = order?.items.find((line) => line.key === item.key)
    if (!line) return
    state.selectOrder(orderId)
    const error = state.setQuantity(product, line.quantity + delta)
    if (error) toast.error(error)
  }

  return (
    <div className="inline-flex shrink-0 items-center gap-1 rounded-lg border p-0.5">
      <Button type="button" variant="ghost" size="icon-xs" aria-label={`Kurangi ${product.title}`} onClick={() => change(-1)}>
        <Minus aria-hidden="true" />
      </Button>
      <span className="min-w-6 text-center text-sm tabular-nums" aria-live="polite">{item.quantity}</span>
      <Button type="button" variant="ghost" size="icon-xs" aria-label={`Tambah ${product.title}`} disabled={!product.active || reserved >= product.stock} onClick={() => change(1)}>
        <Plus aria-hidden="true" />
      </Button>
    </div>
  )
}
