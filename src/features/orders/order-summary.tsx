import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import type { Product } from '@/features/products/sample-products'
import { formatCurrency } from '@/lib/currency'
import { orderTotal } from './order-store'
import type { OrderDraft, OrderLine } from './order-store'
import { OrderItemRow } from './order-item-row'
import { OrderNoteField } from './order-note-field'

export function OrderSummary({ order, productsByKey, renderQuantity }: {
  order: OrderDraft; productsByKey?: ReadonlyMap<string, Product>; renderQuantity?: (item: OrderLine) => ReactNode
}) {
  return <div className="space-y-3">
    {order.items.length ? (
      <ul className="divide-y">
        {order.items.map((item) => (
          <OrderItemRow key={item.key} orderId={renderQuantity ? undefined : order.id} item={item}
            catalogProduct={productsByKey?.get(item.key)} quantityControl={renderQuantity?.(item)} />
        ))}
      </ul>
    ) : <p className="py-8 text-center text-sm text-muted-foreground">Pesanan belum memiliki produk.</p>}
    {!renderQuantity && <OrderNoteField order={order} nested />}
    {renderQuantity && order.note && <p className="text-sm break-words whitespace-pre-wrap">{order.note}</p>}
    <div className="flex justify-between border-t pt-3 font-semibold"><span>{renderQuantity ? 'Subtotal produk' : 'Total'}</span><span className="tabular-nums">{formatCurrency(orderTotal(order))}</span></div>
  </div>
}

export function PayOrderButton({ order, label = 'Bayar pesanan' }: { order: OrderDraft; label?: string }) {
  const className = 'whitespace-normal'
  if (!order.items.length) return <Button type="button" className={className} disabled>{label}</Button>

  return (
    <Button asChild className={className}>
      <Link to="/payment/$orderId" params={{ orderId: order.id }}>{label}</Link>
    </Button>
  )
}
