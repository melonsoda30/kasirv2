import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query'
import { useAuthStore, type Account } from '@/features/auth/auth-store'
import { fetchCurrentCashSession } from './cash-session-api'

export const cashSessionScope = (account?: Account) => [account?.account_id, account?.store?.id, account?.store?.branch_id] as const

export function cashSessionOptions(account?: Account) {
  return queryOptions({
    queryKey: ['cash-session', 'current', ...cashSessionScope(account)],
    queryFn: ({ signal }) => fetchCurrentCashSession(signal),
    staleTime: 15_000,
    meta: { toast: false },
  })
}

export function useCashSession(enabled = true) {
  const account = useAuthStore((state) => state.session?.account)
  return useQuery({ ...cashSessionOptions(account), enabled: !!account && enabled })
}

export function cashSessionAllowsSales(current: Awaited<ReturnType<typeof fetchCurrentCashSession>> | undefined) {
  return !!current && (!current.use_session || current.session?.status === 'open')
}

export function refreshCashSessionData(queryClient: QueryClient) {
  void queryClient.invalidateQueries({ queryKey: ['cash-session'] })
  void queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard'] })
}
