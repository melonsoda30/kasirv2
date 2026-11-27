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

export function QuantityStepButton({ delta, label, disabled, onClick }: {
  delta: -1 | 1; label: string; disabled?: boolean; onClick: () => void
}) {
  const Icon = delta === -1 ? Minus : Plus
  return (
    <Button type="button" variant="outline" size="icon"
      className="size-11 @max-[8rem]:size-9 @min-[26rem]:size-12"
      aria-label={label} disabled={disabled} onClick={onClick}>
      <Icon aria-hidden="true" />
    </Button>
  )
}

export function QuantityButtons({ title, quantity, canIncrease, disabled, onChange }: {
  title: string; quantity: number; canIncrease: boolean; disabled?: boolean; onChange: (delta: number) => void
}) {
  return (
    <div className="inline-flex max-w-full shrink-0 items-center gap-1">
      <QuantityStepButton delta={-1} label={`Kurangi ${title}`} disabled={disabled} onClick={() => onChange(-1)} />
      <span
        className="flex h-11 min-w-7 items-center justify-center rounded-lg border border-input px-0.5 text-center text-sm leading-tight tabular-nums wrap-anywhere @max-[8rem]:h-9 @max-[8rem]:min-w-6 @min-[26rem]:h-12 dark:bg-input/30"
        aria-live="polite"
      >
        {quantity}
      </span>
      <QuantityStepButton delta={1} label={`Tambah ${title}`} disabled={disabled || !canIncrease} onClick={() => onChange(1)} />
    </div>
  )
}
