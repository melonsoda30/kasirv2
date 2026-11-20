import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Link } from '@tanstack/react-router'
import type { LinkProps } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function CollapsiblePageHeader({ title, backTo, children }: {
  title: string; backTo: LinkProps['to']; children: ReactNode
}) {
  const [showTitle, setShowTitle] = useState(true)
  useEffect(() => {
    let anchor = Math.max(0, window.scrollY)
    const onScroll = () => {
      const position = Math.max(0, window.scrollY)
      if (position <= 12) { setShowTitle(true); anchor = position; return }
      if (Math.abs(position - anchor) < 8) return
      setShowTitle(position < anchor)
      anchor = position
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  return (
    <header className="users-toolbar fixed inset-x-0 top-0 z-20 border-b bg-background pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
      <div className={`grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none ${showTitle ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'}`}>
        <div className="overflow-hidden" inert={!showTitle}>
          <div className="flex h-12 items-center gap-2 px-4">
            <Button asChild type="button" variant="ghost" size="icon"><Link to={backTo} aria-label="Kembali"><ArrowLeft aria-hidden="true" /></Link></Button>
            <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          </div>
        </div>
      </div>
      <div className="py-3">{children}</div>
    </header>
  )
}
