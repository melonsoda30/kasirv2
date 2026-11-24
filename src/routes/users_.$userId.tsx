import { createFileRoute, Link } from '@tanstack/react-router'
import { PageLayout } from '@/components/page-layout'
import { Button } from '@/components/ui/button'
import { SkeletonGroup, SkeletonRows } from '@/components/ui/skeleton'
import { UserDetailPage } from '@/features/users/user-detail-page'
import { useUsers } from '@/features/users/users-api'

export const Route = createFileRoute('/users_/$userId')({ component: DetailPage })

function DetailPage() {
  const { userId } = Route.useParams()
  const users = useUsers()
  const user = users.data?.find((item) => item.user_id === userId)
  if (users.isPending) return (
    <PageLayout title="Detail pengguna" prevLink="/users">
      <SkeletonGroup label="Memuat pengguna" className="space-y-4">
        <SkeletonRows rows={1} media="avatar" />
        <SkeletonRows />
      </SkeletonGroup>
    </PageLayout>
  )
  if (users.isError) return (
    <PageLayout title="Detail pengguna" prevLink="/users">
      <p role="alert">Gagal memuat pengguna.</p>
      <Button type="button" variant="outline" loading={users.isFetching} onClick={() => void users.refetch()}>Coba lagi</Button>
    </PageLayout>
  )
  if (!user) return <PageLayout title="Pengguna tidak ditemukan" prevLink="/users"><Button asChild variant="outline"><Link to="/users">Kembali ke daftar pengguna</Link></Button></PageLayout>
  return <UserDetailPage key={user.user_id} user={user} />
}
