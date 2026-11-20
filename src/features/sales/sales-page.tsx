import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Tabs } from '@base-ui/react'
import { CollapsiblePageHeader } from '@/components/collapsible-page-header'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useProductStore } from '@/features/products/product-store'
import { useProductCatalog } from '@/features/products/use-product-catalog'
import { isCashierEventLevel, useAuthStore } from '@/features/auth/auth-store'
import { SalesFilterDrawer } from './sales-filter-drawer'
import { defaultSalesFilters, salesFilterChips } from './sales-filters'
import { fetchTransactions, transactionListParams } from './sales-api'
import { SalesSummaryCards } from './sales-summary-cards'
import { SalesTransactionList } from './sales-transaction-list'

export function SalesPage({ userScope, userCard }: {
  userScope?: { id: string; storeId: string }
  userCard?: ReactNode
} = {}) {
  const account = useAuthStore((state) => state.session?.account)
  const title = !userScope && isCashierEventLevel(account?.event_level) ? 'Transaksi' : 'Penjualan'
  const searchLabel = `Cari ${title.toLowerCase()}`
  useProductCatalog()
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState(() => ({ ...defaultSalesFilters, store: account?.event_id || 'all' }))
  const [debouncedSearch, setDebouncedSearch] = useState(search)
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300)
    return () => window.clearTimeout(timer)
  }, [search])
  const transactionFilters = userScope
    ? { ...filters, cashier: userScope.id, store: userScope.storeId || account?.event_id || 'all' }
    : filters
  const transactions = useQuery({
    queryKey: ['transactions', account?.account_username, transactionListParams(transactionFilters, debouncedSearch)],
    queryFn: ({ signal }) => fetchTransactions(transactionFilters, debouncedSearch, signal),
    enabled: !!account,
  })
  const products = useProductStore((state) => state.products)
  const visibleSales = transactions.data?.sales ?? []
  const availableStores = [...new Map([
    ...(account?.event_id ? [{ value: account.event_id, label: account.event_location || account.event_id }] : []),
    ...products.filter((item) => item.storeId).map((item) => ({ value: item.storeId!, label: item.store })),
  ].map((option) => [option.value, option])).values()]
  const chips = salesFilterChips(filters, products, availableStores).filter((chip) => !userScope || chip.key !== 'store')
  const hasQuery = search.trim() !== '' || chips.length > 0
  const toolbar = (
    <>
      <div className="flex h-9 gap-2 px-4">
        <Input type="search" aria-label={searchLabel} placeholder={`${searchLabel}...`} value={search} onChange={(event) => setSearch(event.target.value)} />
        <SalesFilterDrawer filters={filters} stores={availableStores} hideCashier={!!userScope} hideStore={!!userScope} cashiers={[...new Set([
          ...(filters.cashier !== 'all' ? [filters.cashier] : []), ...visibleSales.map((sale) => sale.cashier),
        ])]} onSave={setFilters} />
      </div>
      {chips.length > 0 && (
        <div role="group" aria-label="Filter penjualan aktif" className="mt-3 flex h-8 gap-2 overflow-x-auto px-4">
          {chips.map(({ key, label }) => <Button key={key} type="button" variant="secondary" size="sm" className="rounded-full" aria-label={`Hapus filter ${label}`}
            onClick={() => setFilters((current) => ({ ...current, [key]: key === 'dateRange' ? undefined : 'all' }))}>{label}<X aria-hidden="true" /></Button>)}
        </div>
      )}
    </>
  )
  return (
    <>
      {userScope ? <CollapsiblePageHeader title="Detail User" backTo="/users">{toolbar}</CollapsiblePageHeader> : (
      <header className="sales-toolbar fixed inset-x-0 top-0 z-20 border-b bg-background pt-[calc(env(safe-area-inset-top)+12px)] pb-3 pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <h1 className="sr-only">{title}</h1>
        {toolbar}
      </header>
      )}
      <main id="main-content" className={`min-w-0 flex-1 px-4 pb-6 ${userScope
        ? chips.length ? 'pt-[calc(153px+env(safe-area-inset-top)+1rem)]' : 'pt-[calc(109px+env(safe-area-inset-top)+1rem)]'
        : chips.length ? 'pt-[calc(104px+env(safe-area-inset-top)+1rem)]' : 'pt-[calc(60px+env(safe-area-inset-top)+1rem)]'}`}>
        {userCard}
        <Tabs.Root defaultValue="transactions" className={userScope ? 'mt-5' : undefined}>
          {userScope && <Tabs.List aria-label="Informasi pengguna" className="mb-4 flex border-b">
          <Tabs.Tab value="transactions" className="flex-1 border-b-2 border-transparent px-4 py-3 text-sm font-medium text-muted-foreground outline-none data-active:border-primary data-active:text-foreground focus-visible:ring-2 focus-visible:ring-ring">Transaksi</Tabs.Tab>
          <Tabs.Tab value="summary" className="flex-1 border-b-2 border-transparent px-4 py-3 text-sm font-medium text-muted-foreground outline-none data-active:border-primary data-active:text-foreground focus-visible:ring-2 focus-visible:ring-ring">Summary</Tabs.Tab>
        </Tabs.List>}
        {transactions.isPending ? (
          <div role="status" aria-label="Memuat penjualan" className="space-y-3">
            <span className="sr-only">Memuat penjualan</span>
            {Array.from({ length: 4 }, (_, index) => <div key={index} aria-hidden="true" className="h-36 rounded-lg bg-muted motion-safe:animate-pulse" />)}
          </div>
        ) : transactions.isError ? (
          <div role="alert" className="space-y-3 py-16 text-center">
            <p className="text-sm">Gagal memuat penjualan. Silakan coba lagi.</p>
            <Button type="button" variant="outline" loading={transactions.isFetching} onClick={() => void transactions.refetch()}>Coba lagi</Button>
          </div>
        ) : (
        <>
        {userScope ? (
          <>
            <Tabs.Panel value="summary"><SalesSummaryCards sales={visibleSales} summary={transactions.data.summary} /></Tabs.Panel>
            <Tabs.Panel value="transactions">
              <SalesTransactionList sales={visibleSales} />
              {!visibleSales.length && <p className="py-12 text-center text-sm text-muted-foreground">Tidak ada transaksi untuk pengguna dan filter ini.</p>}
            </Tabs.Panel>
          </>
        ) : <>
        <SalesSummaryCards sales={visibleSales} summary={transactions.data.summary} />
        <SalesTransactionList sales={visibleSales} />
        {visibleSales.length === 0 && (
        <div className="py-16 text-center">
          <h2 className="text-sm font-medium">{hasQuery ? 'Penjualan tidak ditemukan' : 'Belum ada penjualan'}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{hasQuery ? 'Coba pencarian atau filter lain.' : 'Transaksi penjualan akan tampil di sini.'}</p>
          {hasQuery && <Button type="button" variant="outline" className="mt-4" onClick={() => { setSearch(''); setFilters({ ...defaultSalesFilters }) }}>Reset pencarian</Button>}
        </div>
        )}
        </>}
        </>
        )}
        </Tabs.Root>
      </main>
    </>
  )
}
