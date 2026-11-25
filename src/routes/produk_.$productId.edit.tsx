import { useRef, useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { SkeletonFields, SkeletonGroup } from '@/components/ui/skeleton'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { PageLayout } from '@/components/page-layout'
import { AdminBranchSwitcher, type AdminBranchChangeStatus } from '@/features/auth/admin-branch-drawer'
import { getAdminBranch, useAuthStore } from '@/features/auth/auth-store'
import { deleteProduct } from '@/features/products/product-api'
import { ProductForm } from '@/features/products/product-form'
import { useProductCatalog } from '@/features/products/use-product-catalog'

export const Route = createFileRoute('/produk_/$productId/edit')({
  validateSearch: (search: Record<string, unknown>): { branch?: string } => ({
    branch: typeof search.branch === 'string' ? search.branch : undefined,
  }),
  component: EditProductPage,
})

function EditProductPage() {
  const branchId = useAuthStore((state) => getAdminBranch(state.session)?.id)
  const catalog = useProductCatalog(branchId)
  const { productId } = Route.useParams()
  const { branch } = Route.useSearch()
  const product = catalog.data?.find((item) => item.id === productId && (!branch || item.branchId === branch))
  const guard = useRef<(() => AdminBranchChangeStatus) | null>(null)
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
  const branchSwitcher = <AdminBranchSwitcher getFormStatus={() => deletion.isPending ? 'busy' : guard.current?.()} onApplied={() => void navigate({ to: '/produk', replace: true })} />
  if (catalog.isPending) return (
    <PageLayout title="Edit produk" prevLink="/produk" branchSwitcher={branchSwitcher}>
      <SkeletonGroup label="Memuat produk" className="bento-surface p-4 sm:p-5">
        <SkeletonFields rows={4} />
      </SkeletonGroup>
    </PageLayout>
  )
  if (catalog.isError) return <PageLayout title="Edit produk" prevLink="/produk" branchSwitcher={branchSwitcher}><p role="alert">Gagal memuat produk.</p><Button type="button" variant="outline" loading={catalog.isFetching} onClick={() => void catalog.refetch()}>Coba lagi</Button></PageLayout>
  if (!product) return (
    <PageLayout title="Produk tidak ditemukan" prevLink="/produk" branchSwitcher={branchSwitcher}>
      <Button asChild variant="outline"><Link to="/produk">Kembali ke produk</Link></Button>
    </PageLayout>
  )
  return (
    <PageLayout title="Edit produk" prevLink="/produk" branchSwitcher={branchSwitcher} headerAction={
      <Dialog open={deleteOpen} onOpenChange={(open) => {
        if (!deletion.isPending) setDeleteOpen(open)
      }}>
        <DialogTrigger asChild>
          <Button type="button" variant="destructive" size="icon" aria-label="Hapus produk">
            <Trash2 aria-hidden="true" />
          </Button>
        </DialogTrigger>
        <DialogContent role="alertdialog" closeDisabled={deletion.isPending}>
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
      <ProductForm key={JSON.stringify([product.id, product.branchId])} product={product} branchGuardRef={guard} />
    </PageLayout>
  )
}
