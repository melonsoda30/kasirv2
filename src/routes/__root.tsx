import {
  createRootRouteWithContext,
  Link,
  Outlet,
  redirect,
  useLocation,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from 'react';
import { getAdminBranch, getAuthSession, isAdminAccount, isAdminMode, isCashierEventLevel, useAuthStore } from '@/features/auth/auth-store';
import { AdminBranchSelection } from '@/features/auth/admin-branch-drawer';
import { refreshAuthSession } from '@/lib/api';
import type { QueryClient } from "@tanstack/react-query";
import { MobileLayout } from "../components/mobile-layout";
import { Button } from "../components/ui/button";

const profileRoutes = new Set(['/profil', '/profil_/edit', '/profil_/ganti-password'])
const cashierRoutes = new Set([
  ...profileRoutes,
  '/',
  '/order',
  '/cart',
  '/sesi-kas',
  '/penjualan',
  '/stok',
  '/payment/$orderId',
])

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    beforeLoad: ({ location, matches }) => {
      if (location.pathname === '/login') return

      const check = () => {
        const session = getAuthSession()
        if (!session) {
          throw redirect({ to: '/login', search: { redirect: location.href }, replace: true })
        }

        const isCashier = isCashierEventLevel(session.account.event_level)
        if (!isCashier && isAdminAccount(session.account)) return

        const routeId = matches.at(-1)?.routeId
        const allowedRoutes = isCashier ? cashierRoutes : profileRoutes
        if (!routeId || !allowedRoutes.has(routeId)) {
          throw redirect({ to: isCashier ? '/' : '/profil', replace: true })
        }
      }
      const refresh = refreshAuthSession()
      return refresh ? refresh.then(check, check) : check()
    },
    component: RootLayout,
    notFoundComponent: () => (
      <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6">
        {/* <h1 className="text-3xl font-semibold">Halaman tidak ditemukan</h1> */}
        <Link to="/" className="text-link underline">
          Kembali ke home
        </Link>
      </main>
    ),
    errorComponent: ({ reset }) => (
      <main className="flex min-h-svh flex-col items-center justify-center gap-4 p-6">
        <h1 className="text-3xl font-semibold">Halaman gagal dimuat</h1>
        <Button type="button" onClick={reset}>
          Coba lagi
        </Button>
        <Link to="/" className="text-link underline">
          Kembali ke beranda
        </Link>
      </main>
    ),
  },
);

function RootLayout() {
  const pathname = useLocation({ select: (location) => location.pathname })
  const isPayment = useRouterState({
    select: (state) => state.matches.some((match) => match.routeId === '/payment/$orderId'),
  })
  const session = useAuthStore((state) => state.session)
  useEffect(() => {
    if (!session) return
    const check = () => { void refreshAuthSession()?.catch(() => undefined) }
    const timer = window.setInterval(check, 30_000)
    window.addEventListener('focus', check)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', check) }
  }, [session])
  if (pathname === '/login') return <Outlet />
  if (session && isAdminMode(session) && !getAdminBranch(session)) {
    return <MobileLayout showBottomNav={false}><AdminBranchSelection key={session.account.account_id} account={session.account} /></MobileLayout>
  }
  return session ? <MobileLayout showBottomNav={!isPayment}><Outlet /></MobileLayout> : null
}
