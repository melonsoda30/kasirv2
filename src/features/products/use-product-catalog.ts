import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '../auth/auth-store'
import { fetchProducts, PRODUCT_EVENT_ID } from './product-api'
import { useProductStore } from './product-store'

export function useProductCatalog() {
  const username = useAuthStore((state) => state.session?.account.account_username)
  const setProducts = useProductStore((state) => state.setProducts)
  const query = useQuery({
    queryKey: ['products', 'catalog', username, PRODUCT_EVENT_ID],
    queryFn: ({ signal }) => fetchProducts(signal),
    enabled: !!username,
  })
  useEffect(() => {
    if (query.data) setProducts(query.data)
  }, [query.data, setProducts])
  return query
}
