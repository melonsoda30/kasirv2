import { useId, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { cn } from 'cn'
import { PageLayout } from '@/components/page-layout'
import { Button } from '@/components/ui/button'
import { Drawer, DrawerClose, DrawerContent, DrawerFooter, DrawerHeader, DrawerTitle } from '@/components/ui/drawer'
import { Input } from '@/components/ui/input'
import { InputNominal } from '@/components/input-nominal'
import { SelectCombobox } from '@/components/select-combobox'
import { Textarea } from '@/components/ui/textarea'
import { getAccountBranches, isAdminAccount, useAuthStore, type Account } from '@/features/auth/auth-store'
import { useDashboardQuery } from '@/features/dashboard/dashboard-api'
import { fetchUsers, userDisplayName } from '@/features/users/users-api'
import { formatCurrency, formatNominal } from '@/lib/currency'
import { closeCashSession, fetchCashSessionExport, fetchCashSessionReport, fetchCashSessions, type CashSession } from './cash-session-api'
import { CashSessionAmounts, CashSessionControl } from './cash-session-control'
import { cashSessionScope, refreshCashSessionData, useCashSession } from './cash-session-query'

const all = { value: 'all', label: 'Semua' }
const summaryDate = new Intl.DateTimeFormat('id-ID', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Jakarta',
})

function DailyShiftSummary({ account }: { account: Account }) {
  const query = useDashboardQuery('session_summary', account)
  const summary = query.data
  if (summary?.use_session === false) return null
  const date = summary ? new Date(`${summary.date}T00:00:00+07:00`) : undefined
  return <section className="space-y-3 rounded-xl border bg-background p-4" aria-label="Ringkasan tutup buku">
    <h2 className="text-sm font-semibold">Ringkasan tutup buku</h2>
    {summary && (
      <>
        <p className="text-sm text-muted-foreground">{date && !Number.isNaN(date.getTime()) ? summaryDate.format(date) : summary.date}</p>
        <dl className="grid grid-cols-2 gap-3">
          {[
            ['Jumlah shift', formatNominal(summary.count)],
            ['Shift aktif', formatNominal(summary.open_count)],
            ['Total omzet', formatCurrency(summary.total_omzet)],
            ['Uang tunai masuk', formatCurrency(summary.total_cash_in)],
            ['Total selisih', formatCurrency(summary.total_difference)],
            ['Shift dengan selisih di luar batas', formatNominal(summary.exceeded_count)],
          ].map(([label, value]) => <div key={label} className="min-w-0 rounded-lg bg-muted/50 px-3 py-2.5">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className={cn(
              'mt-1 text-sm font-semibold tabular-nums',
              label === 'Total selisih' && summary.total_difference < 0 && 'text-destructive',
            )}>{value}</dd>
          </div>)}
        </dl>
        <p className="text-xs text-muted-foreground">Batas selisih per shift {formatCurrency(summary.cash_tolerance)}</p>
      </>
    )}
    {!summary && query.isPending && (
      <p role="status" className="text-sm text-muted-foreground">Memuat ringkasan...</p>
    )}
    {!summary && !query.isPending && (
      <div className="flex items-center justify-between gap-2">
        <p role="alert" className="text-sm">Gagal memuat ringkasan tutup buku.</p>
        <Button type="button" variant="outline" size="sm" loading={query.isFetching} onClick={() => void query.refetch()}>Coba lagi</Button>
      </div>
    )}
  </section>
}

function cashDifference(session: CashSession) {
  if (session.closing_cash == null) return 'Uang fisik belum dicatat'
  const difference = session.closing_cash - session.expected_cash
  if (difference === 0) return 'Uang sesuai'
  const label = difference < 0 ? 'kurang' : 'lebih'
  return `Uang ${label} ${formatCurrency(Math.abs(difference))}`
}

function downloadSessions(rows: Awaited<ReturnType<typeof fetchCashSessionExport>>) {
  if (!rows.length) { toast.info('Tidak ada shift untuk diekspor.'); return }
  const columns = [...new Set(rows.flatMap(Object.keys))]
  const cell = (value: string | number | boolean | null | undefined) => {
    const text = typeof value === 'string' && /^\s*[=+\-@]/.test(value) ? `'${value}` : String(value ?? '')
    return `"${text.replaceAll('"', '""')}"`
  }
  const csv = [columns.map(cell).join(','), ...rows.map((row) => columns.map((column) => cell(row[column])).join(','))].join('\r\n')
  const url = URL.createObjectURL(new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8' }))
  const link = document.createElement('a')
  link.href = url
  link.download = 'laporan-shift.csv'
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function CashSessionPage({ close, initialSessionId }: { close?: boolean; initialSessionId?: string }) {
  const account = useAuthStore((state) => state.session?.account)
  const current = useCashSession()
  const queryClient = useQueryClient()
  const admin = isAdminAccount(account)
  const scope = cashSessionScope(account)
  const [status, setStatus] = useState('all')
  const [branch, setBranch] = useState('all')
  const [cashier, setCashier] = useState('all')
  const [shift, setShift] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [selected, setSelected] = useState(close ? undefined : initialSessionId)
  const dates = from && to && from <= to ? { startDate: from, endDate: to } : undefined
  const datesInvalid = !!(from || to) && !dates
  const filters = { status, shift, ...dates, ...(admin && { branch_id: branch, user: cashier }) }
  const list = useQuery({
    queryKey: ['cash-session', 'list', ...scope, filters],
    queryFn: ({ signal }) => fetchCashSessions(filters, signal),
    enabled: !!current.data?.use_session && !datesInvalid,
    meta: { toast: false },
  })
  const users = useQuery({
    queryKey: ['cash-session', 'users', ...scope], queryFn: ({ signal }) => fetchUsers(signal),
    enabled: admin && !!current.data?.use_session, meta: { toast: false },
  })
  const report = useQuery({
    queryKey: ['cash-session', 'report', ...scope, selected],
    queryFn: ({ signal }) => fetchCashSessionReport(selected!, signal),
    enabled: !!selected && !!current.data?.use_session,
    meta: { toast: false },
  })
  const exportReport = useMutation({
    mutationFn: () => fetchCashSessionExport(dates ?? {}),
    onSuccess: downloadSessions,
    onError: (error) => toast.error(error.message),
    meta: { toast: false },
  })
  const [force, setForce] = useState(false)
  const forceFormId = useId()
  const [closingCash, setClosingCash] = useState('')
  const [closeNotes, setCloseNotes] = useState('')
  const forceClose = useMutation({
    mutationFn: (id: string) => closeCashSession({ session_id: id, closing_cash: closingCash, close_notes: closeNotes.trim() }, true),
    onSuccess: () => { setForce(false); toast.success('Shift ditutup.'); },
    onSettled: () => {
      refreshCashSessionData(queryClient)
      void queryClient.invalidateQueries({ queryKey: ['transactions'] })
    },
    meta: { toast: false },
  })

  const session = report.data?.session
  const canForceClose = admin && session?.status === 'open'
  const branchName = (id: string) => getAccountBranches(account?.store).find((branch) => branch.id === id)?.name || id

  return <PageLayout title="Shift" prevLink="/profil">
    <div className="space-y-4">
      <CashSessionControl returnToClose={close} closeSessionId={initialSessionId} />
      {current.data?.use_session === false && <p className="text-sm text-muted-foreground">Toko ini menggunakan mode Tanpa Shift.</p>}
      {admin && account && current.data?.use_session && <DailyShiftSummary account={account} />}
      {current.data?.use_session && <section className="space-y-3" aria-labelledby="cash-session-history">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="cash-session-history" className="font-semibold">Riwayat shift</h2>
          <Button type="button" size="sm" variant="outline" disabled={datesInvalid} loading={exportReport.isPending}
            onClick={() => exportReport.mutate()}>Unduh laporan CSV</Button>
        </div>
        <div className="grid grid-cols-2 gap-3 rounded-lg border p-3 text-sm">
          <label className="grid gap-1">Status shift<SelectCombobox searchable={false} aria-label="Status shift" options={[all, { value: 'open', label: 'Terbuka' }, { value: 'closed', label: 'Ditutup' }]} value={status} onChange={(value) => setStatus(value || 'all')} /></label>
          <label className="grid gap-1">Shift<SelectCombobox searchable={false} aria-label="Shift" options={[all, ...current.data.shift_list.filter(({ code }) => code !== 'none').map(({ code, title }) => ({ value: code, label: title }))]} value={shift} onChange={(value) => setShift(value || 'all')} /></label>
          {admin && <>
            <label className="grid gap-1">Cabang<SelectCombobox searchable={false} aria-label="Cabang" options={[all, ...getAccountBranches(account?.store).map(({ id, name }) => ({ value: id, label: name }))]} value={branch} onChange={(value) => setBranch(value || 'all')} /></label>
            <label className="grid gap-1">Kasir<SelectCombobox searchable={false} aria-label="Kasir" options={[all, ...(users.data ?? []).map((user) => ({ value: user.user_id, label: userDisplayName(user) }))]} value={cashier} onChange={(value) => setCashier(value || 'all')} /></label>
          </>}
          <label className="grid min-w-0 gap-1">Dari tanggal<Input type="date" value={from} onChange={(event) => setFrom(event.currentTarget.value)} /></label>
          <label className="grid min-w-0 gap-1">Sampai tanggal<Input type="date" value={to} min={from || undefined} onChange={(event) => setTo(event.currentTarget.value)} /></label>
        </div>
        {datesInvalid && (
          <p role="status" className="text-sm">Isi rentang tanggal mulai dan selesai yang valid.</p>
        )}
        {!datesInvalid && list.isPending && (
          <p role="status" className="text-sm text-muted-foreground">Memuat riwayat shift...</p>
        )}
        {!datesInvalid && list.isError && (
          <div className="space-y-2 text-sm"><p role="alert">{list.error.message}</p><Button type="button" variant="outline" onClick={() => void list.refetch()}>Coba lagi</Button></div>
        )}
        {!datesInvalid && list.isSuccess && list.data.sessions.length > 0 && (
          <ul className="divide-y rounded-lg border">
            {list.data.sessions.map((row) => <li key={row.session_id}>
              <button type="button" className="flex w-full items-start justify-between gap-3 p-3 text-left text-sm hover:bg-muted/40 focus-visible:outline-ring"
                onClick={() => setSelected(row.session_id)}>
                <span className="min-w-0"><strong className="block break-words">{row.shift_title} ({row.shift_date})</strong><span className="text-muted-foreground">{row.user_name} ({branchName(row.branch_id)})</span></span>
                <span className="shrink-0 text-right">
                  {row.status === 'open' && 'Terbuka'}
                  {row.status === 'closed' && row.close_type === 'force' && 'Ditutup paksa'}
                  {row.status === 'closed' && row.close_type !== 'force' && 'Ditutup'}
                  <span className="block text-xs text-muted-foreground">{row.status === 'closed' ? cashDifference(row) : formatCurrency(row.omzet)}</span>
                </span>
              </button>
            </li>)}
          </ul>
        )}
        {!datesInvalid && list.isSuccess && list.data.sessions.length === 0 && (
          <p className="text-sm text-muted-foreground">Belum ada shift yang sesuai.</p>
        )}
      </section>}
    </div>

    <Drawer open={!!selected && !!current.data?.use_session} dismissible={!forceClose.isPending} onOpenChange={(open) => {
      if (!open && !forceClose.isPending) { setSelected(undefined); setForce(false); forceClose.reset() }
    }}>
      <DrawerContent className="product-drawer pb-[env(safe-area-inset-bottom)]" aria-describedby={undefined}>
        <DrawerHeader className="shrink-0"><DrawerTitle>{force ? 'Tutup paksa shift' : 'Detail shift'}</DrawerTitle></DrawerHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto px-4 pb-4 text-sm">
          {report.isPending && (
            <p role="status">Memuat detail shift...</p>
          )}
          {!report.isPending && report.isError && (
            <div className="space-y-2">
              <p role="alert">{report.error.message}</p><Button type="button" variant="outline" onClick={() => void report.refetch()}>Coba lagi</Button>
            </div>
          )}
          {!report.isPending && !report.isError && session && (
            <>
              <div><p className="font-semibold">{session.shift_title} ({session.shift_date})</p><p>{session.user_name} ({branchName(session.branch_id)})</p><p className="break-all text-xs text-muted-foreground">{session.session_id}</p></div>
              <CashSessionAmounts session={session} />
              {force ? <form id={forceFormId} className="space-y-3" onSubmit={(event) => {
                event.preventDefault()
                if (canForceClose && closeNotes.trim() && !forceClose.isPending) forceClose.mutate(session.session_id)
              }}>
                <label className="grid gap-1">Uang tunai di laci (opsional)<InputNominal value={closingCash} onValueChange={setClosingCash} disabled={forceClose.isPending} /></label>
                <label className="grid gap-1">Alasan penutupan<Textarea value={closeNotes} onChange={(event) => setCloseNotes(event.currentTarget.value)} required disabled={forceClose.isPending} /></label>
                {forceClose.isError && <p role="alert" className="text-destructive">{forceClose.error.message}</p>}
              </form> : <>
                {session.status === 'closed' && <div className="space-y-1"><p>{cashDifference(session)}{session.difference_exceeded && ' (di luar toleransi)'}</p>
                  {session.closed_by_name && <p>Ditutup oleh {session.closed_by_name}</p>}
                  {session.close_notes && <p className="whitespace-pre-wrap break-words">{session.close_notes}</p>}
                </div>}
                {!!report.data?.by_method.length && <div className="space-y-2"><h3 className="font-semibold">Metode pembayaran</h3><ul className="divide-y">
                  {report.data.by_method.map(({ method, count, total }) => <li key={method} className="flex justify-between gap-2 py-2"><span>{method} ({count})</span><span>{formatCurrency(total)}</span></li>)}
                </ul></div>}
                {!!report.data?.transactions.length && <div className="space-y-2"><h3 className="font-semibold">Transaksi</h3><ul className="divide-y">
                  {report.data.transactions.map(({ id_trx, date, total, status }) => <li key={id_trx} className="flex justify-between gap-2 py-2">
                    <span className="min-w-0 break-words">{id_trx}<span className="block text-xs text-muted-foreground">{date} ({status})</span></span><span className="shrink-0">{formatCurrency(total)}</span>
                  </li>)}
                </ul></div>}
              </>}
            </>
          )}
        </div>
        <DrawerFooter className="shrink-0 border-t">
          {force && (
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" disabled={forceClose.isPending} onClick={() => setForce(false)}>Kembali</Button>
              <Button type="submit" form={forceFormId} variant="destructive" loading={forceClose.isPending} disabled={!canForceClose || !closeNotes.trim() || forceClose.isPending}>Tutup paksa</Button>
            </div>
          )}
          {!force && (
            <div className={cn('grid gap-2', canForceClose && 'grid-cols-2')}>
              <DrawerClose asChild><Button type="button" variant="outline">Tutup</Button></DrawerClose>
              {canForceClose && <Button type="button" variant="destructive" onClick={() => { setClosingCash(''); setCloseNotes(''); forceClose.reset(); setForce(true) }}>Tutup paksa</Button>}
            </div>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  </PageLayout>
}
