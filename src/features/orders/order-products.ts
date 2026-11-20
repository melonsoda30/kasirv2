import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/features/auth/auth-store'
import { fetchOrderProducts } from '@/features/products/product-api'
import type { Product } from '@/features/products/sample-products'
import { productKey } from './order-store'

const indexProducts = (products: Product[]) => ({
  products,
  byKey: new Map(products.map((product) => [productKey(product), product])),
})

export function useOrderProducts() {
  const account = useAuthStore((state) => state.session?.account)
  return useQuery({
    queryKey: ['products', 'order-catalog', account?.account_id, account?.store?.id ?? account?.event_id,
      account?.store?.branch_id, account?.store?.all_branches],
    queryFn: ({ signal }) => fetchOrderProducts(signal),
    select: indexProducts,
    enabled: !!account,
    staleTime: 0,
    meta: { toast: false },
  })
}
