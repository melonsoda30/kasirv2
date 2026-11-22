import { useState } from 'react'
import { Pencil, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getAccountBranches, useAuthStore } from '@/features/auth/auth-store'
import { SalesPage } from '@/features/sales/sales-page'
import { API_BASE_URL } from '@/lib/api'
import { UserFormDrawer } from './user-form-drawer'
import { UserStatusDialog } from './user-status-dialog'
import { canManageUsers, userDisplayName, type UserRecord } from './users-api'

export function UserDetailPage({ user }: { user: UserRecord }) {
  const [failedImage, setFailedImage] = useState('')
  const account = useAuthStore((state) => state.session?.account)
  const accountStore = account?.store
  const name = userDisplayName(user)
  const image = user.user_foto ? new URL(user.user_foto, `${API_BASE_URL.replace(/\/$/, '')}/`).href : ''
  const branch = accountStore?.id === user.user_store_id
    ? getAccountBranches(accountStore).find(({ id }) => id === user.user_branch_id)
    : undefined
  const branchName = user.user_branch_id === 'all' ? 'Semua cabang' : branch?.name
  const details = [
    ['Toko', user.user_store_name || user.user_store_id], ['Cabang', branchName],
    ['Posisi', user.user_level || (user.is_cashier ? 'Kasir' : '')],
    ['ID pengguna', user.user_id], ['Username', user.user_username], ['Email', user.user_email],
    ['No. HP', user.user_phone], ['Alamat', user.user_address],
  ]
  return <SalesPage userScope={{ id: user.user_id, branchId: user.user_branch_id }} userCard={
    <section aria-label="Profil pengguna" className="rounded-lg border bg-background p-4">
      <div className="flex items-center gap-3">
        <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
          {image && image !== failedImage ? <img src={image} alt={`Foto ${name}`} className="size-full object-cover" onError={() => setFailedImage(image)} />
            : <UserRound className="size-7 text-muted-foreground" aria-hidden="true" />}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="break-words font-semibold">{name}</h2>
          <p className="mt-1 text-xs text-muted-foreground">{user.user_status === 'active' ? 'Aktif' : 'Nonaktif'}</p>
        </div>
        {canManageUsers(account) && (
          <div className="flex shrink-0 items-center gap-2">
            <UserFormDrawer user={user}>
              <Button type="button" variant="outline" size="icon" aria-label="Edit pengguna" title="Edit pengguna">
                <Pencil aria-hidden="true" />
              </Button>
            </UserFormDrawer>
            {(account?.account_id !== user.user_id || user.user_status !== 'active') && <UserStatusDialog user={user} />}
          </div>
        )}
      </div>
      <dl className="mt-4 space-y-2 border-t pt-3 text-sm">
        {details.map(([label, value]) => <div key={label} className="flex justify-between gap-4">
          <dt className="shrink-0 text-muted-foreground">{label}</dt><dd className="min-w-0 break-words text-right">{value || '—'}</dd>
        </div>)}
      </dl>
    </section>
  } />
}
