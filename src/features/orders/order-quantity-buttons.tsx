import { Minus, Plus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { availableProductStock } from '@/features/products/product-stock'
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

  return <QuantityButtons title={product.title} quantity={item.quantity}
    canIncrease={product.active && item.quantity < Number.MAX_SAFE_INTEGER && availableProductStock(product, reserved) > 0} onChange={change} />
}

export function QuantityButtons({ title, quantity, canIncrease, disabled, onChange }: {
  title: string; quantity: number; canIncrease: boolean; disabled?: boolean; onChange: (delta: number) => void
}) {
  return (
    <div className="inline-flex shrink-0 items-center gap-1 rounded-lg border p-0.5">
      <Button type="button" variant="ghost" size="icon-xs" aria-label={`Kurangi ${title}`} disabled={disabled} onClick={() => onChange(-1)}>
        <Minus aria-hidden="true" />
      </Button>
      <span className="min-w-6 text-center text-sm tabular-nums" aria-live="polite">{quantity}</span>
      <Button type="button" variant="ghost" size="icon-xs" aria-label={`Tambah ${title}`} disabled={disabled || !canIncrease} onClick={() => onChange(1)}>
        <Plus aria-hidden="true" />
      </Button>
    </div>
  )
}
