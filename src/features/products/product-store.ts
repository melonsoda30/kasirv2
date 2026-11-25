import { create } from 'zustand'
import { useAuthStore } from '../auth/auth-store'
import type { Product } from './sample-products'

interface ProductState {
  products: Product[]
  setProducts: (products: Product[]) => void
  updateProduct: (product: Product) => void
  addProduct: (product: Product) => void
  categories: string[]
  addCategory: (category: string) => void
}

export const useProductStore = create<ProductState>((set) => ({
  products: [],
  categories: [],
  setProducts: (products) => set({ products }),
  addCategory: (category) => set((state) => {
    const name = category.trim()
    return !name || name.toLowerCase() === 'semua' || state.categories.some((item) => item.toLowerCase() === name.toLowerCase())
      ? state : { categories: [...state.categories, name] }
  }),
  addProduct: (product) => set((state) => ({ products: [...state.products, product] })),
  updateProduct: (product) => set((state) => ({
    products: state.products.map((item) => item.id === product.id && item.branchId === product.branchId ? product : item),
  })),
}))

useAuthStore.subscribe((state, previous) => {
  if (state.session?.account !== previous.session?.account) useProductStore.setState({ products: [], categories: [] })
})
