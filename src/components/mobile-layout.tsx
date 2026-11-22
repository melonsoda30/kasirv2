import type { ReactNode } from 'react'
import { cn } from 'cn'
import { BottomNav } from './bottom-nav'

export function MobileLayout({ children, showBottomNav = true }: { children: ReactNode; showBottomNav?: boolean }) {
  return (
    <div className={cn(
      'mobile-layout flex min-h-dvh w-full min-w-0 flex-col bg-white pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] [overflow-wrap:anywhere]',
      showBottomNav ? 'pb-[calc(4.5rem+env(safe-area-inset-bottom))]' : 'pb-[env(safe-area-inset-bottom)]',
    )}>
      {children}
      {showBottomNav && <BottomNav />}
    </div>
  )
}
