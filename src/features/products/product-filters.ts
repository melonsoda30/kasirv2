import type { Product } from './sample-products'

export interface ProductFilters {
  store: string
  status: 'all' | 'active' | 'inactive'
}

export const defaultProductFilters: ProductFilters = { store: 'all', status: 'all' }

export function matchesProductFilters(product: Product, filters: ProductFilters): boolean {
  return (filters.store === 'all' || product.branchId === filters.store) &&
    (filters.status === 'all' || product.active === (filters.status === 'active'))
}
