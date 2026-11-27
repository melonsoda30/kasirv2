import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../auth/auth-store'
import { fetchProducts, PRODUCT_EVENT_ID } from './product-api'
import { defaultProductSort, type ProductSort } from './product-sort'
import { useProductStore } from './product-store'

export function useProductCatalog(branchId = PRODUCT_EVENT_ID, enabled = true, sort: ProductSort = defaultProductSort) {
  const username = useAuthStore((state) => state.session?.account.account_username)
  const setProducts = useProductStore((state) => state.setProducts)
  const query = useQuery({
    queryKey: ['products', 'catalog', username, branchId, sort],
    queryFn: ({ signal }) => fetchProducts(signal, branchId, sort),
    enabled: !!username && enabled,
  })
  useEffect(() => {
    if (enabled && branchId === PRODUCT_EVENT_ID && sort === defaultProductSort && query.data) setProducts(query.data)
  }, [branchId, enabled, query.data, setProducts, sort])
  return query
}
