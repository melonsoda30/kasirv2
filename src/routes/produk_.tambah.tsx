import { createFileRoute } from '@tanstack/react-router'
import { PageLayout } from '@/components/page-layout'
import { ProductForm } from '@/features/products/product-form'

export const Route = createFileRoute('/produk_/tambah')({
  component: () => <PageLayout title="Tambah produk" prevLink="/produk"><ProductForm /></PageLayout>,
})
