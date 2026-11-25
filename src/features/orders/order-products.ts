import { useQuery } from '@tanstack/react-query'
import { getCashierBranch, useAuthStore } from '@/features/auth/auth-store'
import { fetchOrderProducts } from '@/features/products/product-api'
import { isLowStockQuantity } from '@/features/products/product-stock'
import type { Product } from '@/features/products/sample-products'
import { productKey } from './order-store'

export function isLowStock(product: Product, remaining = product.stock) {
  return product.active && product.useStock !== false && isLowStockQuantity(remaining)
}

const indexProducts = (products: Product[]) => ({
  products,
  byKey: new Map(products.map((product) => [productKey(product), product])),
})

export function useOrderProducts() {
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
    enabled: !!account,
    staleTime: 0,
    meta: { toast: false },
  })
}
