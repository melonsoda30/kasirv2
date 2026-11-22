import { createFileRoute } from '@tanstack/react-router'
import { CashSessionPage } from '@/features/cash-session/cash-session-page'

export const Route = createFileRoute('/sesi-kas')({
  validateSearch: (search: Record<string, unknown>): { close?: boolean; session?: string } => ({
    close: search.close === true ? true : undefined,
    session: typeof search.session === 'string' ? search.session : undefined,
  }),
  component: CashSessionRoute,
})

function CashSessionRoute() {
  const { close, session } = Route.useSearch()
  return <CashSessionPage key={`${session ?? ''}:${close ?? ''}`} close={close} initialSessionId={session} />
}
