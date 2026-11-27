import { getProductPricing } from './product-pricing'
import type { Product } from './sample-products'

export const productSortOptions = [
  { value: 'default', label: 'Urutan bawaan' },
  { value: 'name_asc', label: 'Nama A–Z' },
  { value: 'name_desc', label: 'Nama Z–A' },
  { value: 'price_asc', label: 'Harga Termurah' },
  { value: 'price_desc', label: 'Harga Termahal' },
  { value: 'best_seller', label: 'Terlaris' },
] as const

export type ProductSort = typeof productSortOptions[number]['value']

const productNameOrder = new Intl.Collator('id-ID', { sensitivity: 'base' })

export function compareProductNames(a: Product, b: Product) {
  return productNameOrder.compare(a.title, b.title)
}

export function sortProducts(products: readonly Product[], sort: ProductSort) {
  if (sort === 'default') return products
  return [...products].sort((a, b) => {
    const byName = compareProductNames(a, b)
    if (sort === 'name_desc') return -byName
    if (sort === 'best_seller') return (b.soldQuantity ?? 0) - (a.soldQuantity ?? 0) || byName
    if (sort === 'price_asc' || sort === 'price_desc') {
      const byPrice = getProductPricing(a).finalPrice - getProductPricing(b).finalPrice
      return (sort === 'price_desc' ? -byPrice : byPrice) || byName
    }
    return byName
  })
}
