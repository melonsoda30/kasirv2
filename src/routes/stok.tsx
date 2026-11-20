import { createFileRoute } from '@tanstack/react-router'
import { StockPage } from '@/features/products/stock-page'

export const Route = createFileRoute('/stok')({
  component: StockPage,
})
