export const defaultProductSort = 'manual'

export const productSortOptions = [
  { value: defaultProductSort, label: 'Urutan Kustom' },
  { value: 'name_asc', label: 'Nama A–Z' },
  { value: 'name_desc', label: 'Nama Z–A' },
  { value: 'price_asc', label: 'Harga Termurah' },
  { value: 'price_desc', label: 'Harga Termahal' },
  { value: 'best_seller', label: 'Terlaris' },
] as const

export type ProductSort = typeof productSortOptions[number]['value']
