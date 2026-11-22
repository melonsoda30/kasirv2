import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { Product } from '../products/sample-products'
import { getProductPricing } from '../products/product-pricing'
import { useAuthStore } from '../auth/auth-store'

export interface OrderLine { key: string; product: Product; quantity: number; unitPrice: number }
export interface OrderDraft { id: string; name: string; items: OrderLine[]; note?: string }
export const productKey = (product: Product) => JSON.stringify([product.id, product.storeId ?? '', product.branchId ?? ''])
export const orderTotal = (order: OrderDraft) => order.items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)

interface OrderState {
  owner: string | null
  orders: OrderDraft[]
  activeId: string | null
  nextNumber: number
  initialize: (owner: string) => void
  createOrder: () => string
  selectOrder: (id: string) => void
  removeOrder: (id: string) => void
  setOrderNote: (id: string, note: string) => void
  setQuantity: (product: Product, quantity: number) => string | null
  addItem: (product: Product, quantity: number) => string | null
}

export const useOrderStore = create<OrderState>()(persist((set, get) => ({
  owner: null, orders: [], activeId: null, nextNumber: 1,
  initialize: (owner) => {
    if (get().owner !== owner) set({ owner, orders: [], activeId: null, nextNumber: 1 })
    if (get().orders.some((order) => !/^Antrian #\d+$/.test(order.name))) {
      set((state) => ({ orders: state.orders.map((order, index) => ({ ...order, name: `Antrian #${index + 1}` })), nextNumber: Math.max(state.nextNumber, state.orders.length + 1) }))
    }
    if (!get().orders.some((order) => order.id === get().activeId)) set({ activeId: get().orders[0]?.id ?? null })
  },
  createOrder: () => {
    const id = crypto.randomUUID()
    set((state) => {
      const number = state.orders.length ? state.nextNumber : 1
      const order = { id, name: `Antrian #${number}`, items: [] }
      return { orders: [...state.orders, order], activeId: id, nextNumber: number + 1 }
    })
    return id
  },
  selectOrder: (id) => { if (get().orders.some((order) => order.id === id)) set({ activeId: id }) },
  setOrderNote: (id, note) => set((state) => ({
    orders: state.orders.map((order) => order.id === id ? { ...order, note } : order),
  })),
  removeOrder: (id) => {
    const orders = get().orders.filter((order) => order.id !== id)
    if (!orders.length) set({ orders, activeId: null, nextNumber: 1 })
    else set({ orders, activeId: get().activeId === id ? orders[0].id : get().activeId })
  },
  setQuantity: (product, quantity) => {
    const state = get()
    const active = state.orders.find((order) => order.id === state.activeId)
    if (!Number.isSafeInteger(quantity) || quantity < 0) return 'Jumlah harus berupa bilangan bulat.'
    if (!active && (state.orders.length || quantity === 0)) return 'Pilih pesanan terlebih dahulu.'
    const key = productKey(product)
    const existing = active?.items.find((item) => item.key === key)
    if (quantity > (existing?.quantity ?? 0) && (!product.active || product.stock <= 0)) return 'Produk sedang tidak tersedia.'
    const reserved = state.orders.filter((order) => order.id !== active?.id)
      .reduce((sum, order) => sum + order.items.reduce((count, item) => count + (item.key === key ? item.quantity : 0), 0), 0)
    if (quantity > 0 && quantity >= (existing?.quantity ?? 0) && quantity > Math.max(0, product.stock - reserved)) return 'Jumlah melebihi stok yang tersedia untuk pesanan ini.'
    const line: OrderLine = { key, product, quantity, unitPrice: getProductPricing(product).finalPrice }
    if (!active) {
      const id = crypto.randomUUID()
      set({ orders: [{ id, name: 'Antrian #1', items: [line] }], activeId: id, nextNumber: 2 })
      return null
    }
    let items: OrderLine[]
    if (quantity === 0) items = active.items.filter((item) => item.key !== key)
    else if (existing) items = active.items.map((item) => item.key === key ? line : item)
    else items = [...active.items, line]
    set({ orders: state.orders.map((order) => order.id === active.id ? { ...order, items } : order) })
    return null
  },
  addItem: (product, quantity) => {
    if (!Number.isSafeInteger(quantity) || quantity <= 0) return 'Jumlah minimal 1.'
    const active = get().orders.find((order) => order.id === get().activeId)
    const existing = active?.items.find((item) => item.key === productKey(product))?.quantity ?? 0
    return get().setQuantity(product, existing + quantity)
  },
}), {
  name: 'kasirv2.order-drafts', storage: createJSONStorage(() => sessionStorage), version: 1,
  partialize: ({ owner, orders, activeId, nextNumber }) => ({ owner, orders, activeId, nextNumber }),
}))

useAuthStore.subscribe((state, previous) => {
  if (!state.session && previous.session) useOrderStore.setState({ owner: null, orders: [], activeId: null, nextNumber: 1 })
})
