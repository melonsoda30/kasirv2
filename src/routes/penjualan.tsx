import { createFileRoute } from '@tanstack/react-router'
import { SalesPage } from '../features/sales/sales-page'

export const Route = createFileRoute('/penjualan')({
  component: SalesPage,
})
