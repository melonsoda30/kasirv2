import { createRouter } from '@tanstack/react-router'
import { queryClient } from './lib/query-client'
import { routeTree } from './routeTree.gen'
import { isAdminAccount, useAuthStore } from './features/auth/auth-store'

export const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  defaultPreloadStaleTime: 0,
  defaultViewTransition: typeof window !== 'undefined' &&
    window.CSS?.supports('selector(:active-view-transition-type(page))')
    ? {
      types: ({ fromLocation, pathChanged }) => {
        if (!fromLocation || !pathChanged || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false
        return ['page']
      },
    }
    : false,
  scrollRestoration: true,
})

useAuthStore.subscribe((state, previous) => {
  const previousAccount = previous.session?.account
  if (!previousAccount) return

  const account = state.session?.account
  if (!account || account.event_level !== previousAccount.event_level ||
    isAdminAccount(account) !== isAdminAccount(previousAccount)) {
    queryClient.clear()
    void router.invalidate()
  }
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
