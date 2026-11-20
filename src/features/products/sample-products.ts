// Temporary display data until the products API is available.
export const categories = ['Semua', 'Minuman', 'Makanan', 'Camilan', 'Kebutuhan'] as const

const products = [
  { id: '1', title: 'Kopi Susu Gula Aren', price: 18000, category: 'Minuman', image: 'photo-1461023058943-07fcbe16d735' },
  { id: '2', title: 'Croissant Butter', price: 22000, category: 'Makanan', image: 'photo-1555507036-ab1f4038808a' },
  { id: '3', title: 'Matcha Latte', price: 24000, category: 'Minuman', image: 'photo-1515823064-d6e0c04616a7' },
  { id: '4', title: 'Roti Panggang', price: 16000, category: 'Makanan', image: 'photo-1509440159596-0249088772ff' },
  { id: '5', title: 'Cookies Cokelat', price: 15000, category: 'Camilan', image: 'photo-1499636136210-6f4ee915583e' },
  { id: '6', title: 'Air Mineral', price: 6000, category: 'Minuman', image: 'photo-1602143407151-7111542de6e8' },
  { id: '7', title: 'Donat Gula', price: 10000, category: 'Camilan', image: 'photo-1551024601-bec78aea704b' },
  { id: '8', title: 'Kopi Biji Kemasan', price: 85000, category: 'Kebutuhan', image: 'photo-1447933601403-0c6688de566e' },
]

export interface Product {
  id: string
  title: string
  price: number
  category: string
  categoryName?: string
  image: string
  photo: string
  store: string
  storeId?: string
  branchId?: string
  discount: number
  discountType: string
  stock: number
  description: string
  active: boolean
}

export const stores = ['Toko Utama', 'Cabang 1']
export const discountTypes = ['Tanpa diskon', 'Nominal', 'Persentase (%)']

export const sampleProducts: Product[] = products.map((product) => ({
  ...product,
  stock: 20,
  description: `${product.title}, tersedia dalam kemasan satuan.`,
  active: true,
  photo: '',
  store: stores[0],
  discount: 0,
  discountType: discountTypes[0],
}))
