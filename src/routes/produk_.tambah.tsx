import { useRef } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { PageLayout } from '@/components/page-layout'
import { AdminBranchSwitcher, type AdminBranchChangeStatus } from '@/features/auth/admin-branch-drawer'
import { getAdminBranch, useAuthStore } from '@/features/auth/auth-store'
import { ProductForm } from '@/features/products/product-form'

export const Route = createFileRoute('/produk_/tambah')({
  component: AddProductPage,
})

function AddProductPage() {
  const branchId = useAuthStore((state) => getAdminBranch(state.session)?.id)
  const guard = useRef<(() => AdminBranchChangeStatus) | null>(null)
  return (
    <PageLayout title="Tambah produk" prevLink="/produk" branchSwitcher={<AdminBranchSwitcher getFormStatus={() => guard.current?.()} />}>
      <ProductForm key={branchId} branchGuardRef={guard} />
    </PageLayout>
  )
}
