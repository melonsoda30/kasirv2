import { Link } from '@tanstack/react-router'
import { Button } from '@/components/ui/button'
import type { Product } from '@/features/products/sample-products'
import { formatCurrency } from '@/lib/currency'
import { orderTotal } from './order-store'
import type { OrderDraft } from './order-store'
import { OrderItemRow } from './order-item-row'
import { OrderNoteField } from './order-note-field'

export function OrderSummary({ order, productsByKey }: { order: OrderDraft; productsByKey?: ReadonlyMap<string, Product> }) {
  return <div className="space-y-3">
    {order.items.length ? (
      <ul className="divide-y">
        {order.items.map((item) => (
          <OrderItemRow key={item.key} orderId={order.id} item={item} catalogProduct={productsByKey?.get(item.key)} />
        ))}
      </ul>
    ) : <p className="py-8 text-center text-sm text-muted-foreground">Pesanan belum memiliki produk.</p>}
    <OrderNoteField order={order} nested />
    <div className="flex justify-between border-t pt-3 font-semibold"><span>Total</span><span className="tabular-nums">{formatCurrency(orderTotal(order))}</span></div>
  </div>
}

export function PayOrderButton({ order, label = 'Bayar pesanan' }: { order: OrderDraft; label?: string }) {
  const className = 'h-auto min-h-8 whitespace-normal py-2'
  if (!order.items.length) return <Button type="button" className={className} disabled>{label}</Button>

  return (
    <Button asChild className={className}>
      <Link to="/payment/$orderId" params={{ orderId: order.id }}>{label}</Link>
    </Button>
  )
}
