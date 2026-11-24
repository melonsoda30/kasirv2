import {
  createRootRouteWithContext,
  Link,
  Outlet,
  redirect,
  useLocation,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from 'react';
import { getAuthSession, isAdminAccount, isCashierEventLevel, useAuthStore } from '@/features/auth/auth-store';
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
    // Recheck on focus and periodically so expired sessions cannot keep an open page.
    const check = () => { getAuthSession() }
    const timer = window.setInterval(check, 30_000)
    window.addEventListener('focus', check)
    return () => { window.clearInterval(timer); window.removeEventListener('focus', check) }
  }, [session])
  if (pathname === '/login') return <Outlet />
  return session ? <MobileLayout showBottomNav={!isPayment}><Outlet /></MobileLayout> : null
}
