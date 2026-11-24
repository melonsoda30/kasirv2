import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { SkeletonFields, SkeletonGroup } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { PageLayout } from '@/components/page-layout'
import { deleteProduct } from '@/features/products/product-api'
import { ProductForm } from '@/features/products/product-form'
import { useProductStore } from '@/features/products/product-store'
import { useProductCatalog } from '@/features/products/use-product-catalog'

export const Route = createFileRoute('/produk_/$productId/edit')({ component: EditProductPage })

function EditProductPage() {
  const catalog = useProductCatalog()
  const { productId } = Route.useParams()
  const product = useProductStore((state) => state.products.find((item) => item.id === productId))
  const [deleteOpen, setDeleteOpen] = useState(false)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const deletion = useMutation({
    mutationFn: deleteProduct,
    onSuccess: async (message) => {
      await queryClient.invalidateQueries({ queryKey: ['products', 'catalog'] })
      toast.success(message)
      await navigate({ to: '/produk' })
    },
    onError: (error) => {
      toast.error(isAxiosError<{ msg?: string }>(error)
        ? error.response?.data?.msg || 'Gagal menghapus produk.'
        : error.message)
    },
  })
  if (catalog.isPending) return (
    <PageLayout title="Edit produk" prevLink="/produk">
      <SkeletonGroup label="Memuat produk" className="bento-surface p-4 sm:p-5">
        <SkeletonFields rows={4} />
      </SkeletonGroup>
    </PageLayout>
  )
  if (catalog.isError) return <PageLayout title="Edit produk" prevLink="/produk"><p role="alert">Gagal memuat produk.</p><Button type="button" variant="outline" loading={catalog.isFetching} onClick={() => void catalog.refetch()}>Coba lagi</Button></PageLayout>
  if (!product) return (
    <PageLayout title="Produk tidak ditemukan" prevLink="/produk">
      <Button asChild variant="outline"><Link to="/produk">Kembali ke produk</Link></Button>
    </PageLayout>
  )
  return (
    <PageLayout title="Edit produk" prevLink="/produk" headerAction={
      <Dialog open={deleteOpen} onOpenChange={(open) => {
        if (!deletion.isPending) setDeleteOpen(open)
      }}>
        <DialogTrigger asChild>
          <Button type="button" variant="destructive" size="icon" aria-label="Hapus produk">
            <Trash2 aria-hidden="true" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hapus produk?</DialogTitle>
            <DialogDescription>Produk “{product.title}” akan dihapus dari katalog.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" disabled={deletion.isPending} onClick={() => setDeleteOpen(false)}>
              Batal
            </Button>
            <Button type="button" variant="destructive" loading={deletion.isPending} onClick={() => deletion.mutate(product.id)}>
              Hapus produk
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    }>
      <ProductForm key={product.id} product={product} />
    </PageLayout>
  )
}
