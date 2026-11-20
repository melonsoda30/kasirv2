import { create } from 'zustand'
import type { Sale } from './sales-summary'

interface SalesState {
  sales: Sale[]
  setSales: (sales: Sale[]) => void
}

export const useSalesStore = create<SalesState>((set) => ({
  sales: [],
  setSales: (sales) => set({ sales }),
}))
