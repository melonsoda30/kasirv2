import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Drawer, DrawerTrigger, DrawerBody, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter } from '@/components/ui/drawer'
import { ProductImage } from '@/features/products/product-card'
import { availableProductStock } from '@/features/products/product-stock'
import { formatCurrency } from '@/lib/currency'
import { useOrderProducts } from './order-products'
import { QuantityStepButton } from './order-quantity-buttons'
import { useOrderStore } from './order-store'
import type { OrderLine } from './order-store'

export function EditOrderItem({ orderId, item }: { orderId: string; item: OrderLine }) {
  const [open, setOpen] = useState(false)
  const [quantity, setQuantity] = useState(item.quantity)
  const orders = useOrderStore((state) => state.orders)
  const catalog = useOrderProducts()
  const product = catalog.data?.byKey.get(item.key) ?? { ...item.product, active: false, stock: 0 }
  const reserved = orders.filter((order) => order.id !== orderId).reduce((sum, order) => sum + order.items.reduce((count, line) => count + (line.key === item.key ? line.quantity : 0), 0), 0)
  const maximum = availableProductStock(product, reserved)
  function save(next: number) {
    const state = useOrderStore.getState()
    if (!state.orders.some((order) => order.id === orderId)) return
    state.selectOrder(orderId)
    const error = state.setQuantity(product, next)
    if (error) { toast.error(error); return }
    setOpen(false)
  }
  return <Drawer open={open} onOpenChange={(next) => { if (next) setQuantity(item.quantity); setOpen(next) }}>
    <DrawerTrigger asChild><Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label={`Edit ${item.product.title}`} title="Edit item"><Pencil aria-hidden="true" /></Button></DrawerTrigger>
    <DrawerContent>
      <DrawerHeader>
        <DrawerTitle className="break-words">{item.product.title}</DrawerTitle>
        <DrawerDescription>{formatCurrency(item.unitPrice)} / item</DrawerDescription>
      </DrawerHeader>
      <DrawerBody><ProductImage product={product} detail /></DrawerBody>
      <DrawerFooter className="@container">
        <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2">
          <QuantityStepButton delta={-1} label="Kurangi jumlah" disabled={quantity <= 1} onClick={() => setQuantity((value) => value - 1)} />
          <Input type="number" min={1} max={product.useStock === false ? undefined : maximum} step={1} inputMode="numeric" aria-label="Jumlah produk" className="w-16 text-center" value={quantity || ''} onChange={(event) => setQuantity(Number(event.target.value))} />
          <QuantityStepButton delta={1} label="Tambah jumlah" disabled={!product.active || quantity >= maximum} onClick={() => setQuantity((value) => value + 1)} />
        </div><span className="font-semibold tabular-nums">{formatCurrency(item.unitPrice * quantity)}</span></div>
        <div className="modal-actions"><Button type="button" variant="outline" onClick={() => save(0)}>Hapus item</Button><Button type="button" disabled={!Number.isSafeInteger(quantity) || quantity < 1} onClick={() => save(quantity)}>Simpan</Button></div>
      </DrawerFooter>
    </DrawerContent>
  </Drawer>
}
