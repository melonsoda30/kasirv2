import { useQuery } from '@tanstack/react-query'
import { getCashierBranch, useAuthStore } from '@/features/auth/auth-store'
import { fetchOrderProducts } from '@/features/products/product-api'
import { compareProductNames, sortProducts } from '@/features/products/product-sort'
import { isLowStockQuantity } from '@/features/products/product-stock'
import type { Product } from '@/features/products/sample-products'
import { productKey } from './order-store'

export const orderProductSortOptions = [
  { value: 'name_asc', label: 'Nama A–Z' },
  { value: 'name_desc', label: 'Nama Z–A' },
  { value: 'best_seller', label: 'Terlaris' },
  { value: 'price_asc', label: 'Harga Termurah' },
  { value: 'price_desc', label: 'Harga Termahal' },
  { value: 'custom', label: 'Urutan Kustom' },
] as const

export type OrderProductSort = typeof orderProductSortOptions[number]['value']

export function sortOrderProducts(products: readonly Product[], sort: OrderProductSort, customOrder: readonly string[] = []) {
  if (sort !== 'custom') return sortProducts(products, sort)
  const customRank = new Map(customOrder.map((key, index) => [key, index]))
  return [...products].sort((a, b) => {
    const rankA = customRank.get(productKey(a)) ?? customOrder.length
    const rankB = customRank.get(productKey(b)) ?? customOrder.length
    return rankA - rankB || compareProductNames(a, b)
  })
}

export function isLowStock(product: Product, remaining = product.stock) {
  return product.active && product.useStock !== false && isLowStockQuantity(remaining)
}

const indexProducts = (products: Product[]) => ({
  products,
  byKey: new Map(products.map((product) => [productKey(product), product])),
})

export function useOrderProducts(enabled = true) {
  const account = useAuthStore((state) => state.session?.account)
  const branchId = useAuthStore((state) => getCashierBranch(state.session)?.id)
  return useQuery({
    queryKey: ['products', 'order-catalog', account?.account_id, account?.store?.id ?? account?.event_id,
      account?.store?.branch_id, account?.store?.all_branches, branchId],
    queryFn: async ({ signal }) => {
      const products = await fetchOrderProducts(signal)
      return branchId ? products.filter((product) => product.branchId === branchId) : products
    },
    select: indexProducts,
    enabled: !!account && enabled,
    staleTime: 0,
    meta: { toast: false },
  })
}
