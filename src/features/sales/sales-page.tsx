import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Tabs } from "@base-ui/react";
import { cn } from "cn";
import { CollapsiblePageHeader } from "@/components/collapsible-page-header";
import { useQuery } from "@tanstack/react-query";
import { X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonGroup, SkeletonRows } from "@/components/ui/skeleton";
import { useProductStore } from "@/features/products/product-store";
import {
  getAccountBranches,
  getCashierBranch,
  isAdminAccount,
  useAuthStore,
  usesCashierMode,
} from "@/features/auth/auth-store";
import { CashSessionControl } from "@/features/cash-session/cash-session-control";
import { usePaymentMethods } from "@/features/orders/payment-methods";
import { useUsers, userDisplayName } from "@/features/users/users-api";
import { SalesFilterDrawer } from "./sales-filter-drawer";
import { defaultSalesFilters, salesFilterChips } from "./sales-filters";
import { fetchTransactions, transactionListParams } from "./sales-api";
import { SalesSummaryCards } from "./sales-summary-cards";
import { SalesTransactionList } from "./sales-transaction-list";

function SalesSummarySkeleton() {
  return (
    <div aria-hidden="true" className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      <div className="bento-surface flex flex-col justify-between gap-3 p-4 sm:p-5 lg:mb-9">
        <div className="flex min-h-9 items-center justify-between gap-2">
          <Skeleton className="h-4 w-24 max-w-[40%]" />
          <Skeleton className="h-4 w-36 max-w-[55%]" />
        </div>
        <Skeleton className="h-8 w-2/3" />
      </div>
      <div className="flex min-w-0 flex-col">
        <div className="grid flex-1 grid-cols-2 gap-3">
          {[0, 1].map((index) => (
            <div key={index} className="bento-surface flex flex-col justify-between gap-3 p-4 sm:p-5">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-8 w-1/2" />
            </div>
          ))}
        </div>
        <div className="flex h-9 items-center justify-center gap-3">
          <Skeleton className="h-1 w-6 rounded-full" />
          <Skeleton className="h-1 w-6 rounded-full" />
        </div>
      </div>
    </div>
  );
}

export function SalesPage({
  userScope,
  userCard,
}: {
  userScope?: { id: string; branchId: string };
  userCard?: ReactNode;
} = {}) {
  const account = useAuthStore((state) => state.session?.account);
  const isAdmin = isAdminAccount(account);
  const cashierMode = useAuthStore((state) => usesCashierMode(state.session));
  const cashierBranchId = useAuthStore((state) => getCashierBranch(state.session)?.id);
  const branchId = cashierBranchId ?? account?.store?.branch_id;
  const isCashierTransactions = !userScope && cashierMode;
  const hideStore = !!userScope || !isAdmin || isCashierTransactions;
  const users = useUsers(isAdmin && !userScope);
  const paymentMethods = usePaymentMethods(!!account, undefined, "all");
  const paymentOptions = (paymentMethods.data ?? []).map(({ code, title }) => ({ value: code, label: title }));
  const title = isCashierTransactions ? "Transaksi" : "Penjualan";
  const searchLabel = `Cari ${title.toLowerCase()}`;
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState(() => ({
    ...defaultSalesFilters,
    store: account?.store?.branch_id || "all",
  }));
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 300);
    return () => window.clearTimeout(timer);
  }, [search]);
  const adminBranch = userScope
    ? userScope.branchId || branchId || "all"
    : filters.store;
  const accountBranch = branchId ?? (isAdmin ? "all" : "");
  const visibleBranch = isAdmin && !isCashierTransactions ? adminBranch : accountBranch;
  const transactionFilters = {
    branchId: cashierBranchId,
    cashier: userScope?.id ?? filters.cashier,
    dateRange: filters.dateRange,
    paymentMethod: filters.paymentMethod,
  };
  const transactions = useQuery({
    queryKey: [
      "transactions",
      account?.account_username,
      transactionListParams(transactionFilters, debouncedSearch),
    ],
    queryFn: ({ signal }) =>
      fetchTransactions(transactionFilters, debouncedSearch, signal),
    enabled: !!account && (isAdmin || !!branchId),
  });
  const products = useProductStore((state) => state.products);
  const sales = transactions.data?.sales ?? [];
  const requestedBranch = transactionFilters.branchId;
  const allowUnknownBranch =
    (!!requestedBranch && requestedBranch === visibleBranch) ||
    !!userScope ||
    (!cashierBranchId && !account?.store?.all_branches);
  const branches = getAccountBranches(account?.store);
  const branchName = branches.find(({ id }) => id === visibleBranch)?.name.trim().toLowerCase();
  const uniqueBranchName = branchName && branches.filter(({ name }) => name.trim().toLowerCase() === branchName).length === 1;
  const visibleSales = visibleBranch && visibleBranch !== "all"
    ? sales.filter((sale) => {
        if (sale.branchId) return sale.branchId === visibleBranch;
        return allowUnknownBranch || (uniqueBranchName && sale.store?.trim().toLowerCase() === branchName);
      })
    : sales;
  const availableStores = branches.map(
    ({ id, name }) => ({ value: id, label: name }),
  );
  const cashiers = (users.data ?? [])
    .filter((user) => user.is_cashier)
    .map((user) => ({ value: user.user_id, label: userDisplayName(user) }));
  if (account?.account_id && cashierMode && !cashiers.some(({ value }) => value === account.account_id)) {
    cashiers.push({ value: account.account_id, label: account.account_fullname || account.account_username });
  }
  const chips = salesFilterChips(filters, products, availableStores, cashiers, paymentOptions).filter(
    (chip) => !hideStore || chip.key !== "store",
  );
  const hasChips = chips.length > 0;
  const hasQuery = search.trim() !== "" || hasChips;
  const missingBranch = !!account && !isAdmin && !branchId;
  const summary = !missingBranch && transactions.isSuccess && sales.length === visibleSales.length
    ? transactions.data.summary
    : undefined;
  const toolbar = (
    <>
      <div className="page-gutter flex h-9 gap-2">
        <Input
          type="search"
          aria-label={searchLabel}
          placeholder={`${searchLabel}...`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
        <SalesFilterDrawer
          filters={filters}
          stores={availableStores}
          hideCashier={!!userScope}
          hideStore={hideStore}
          cashiers={cashiers}
          cashiersLoading={users.isLoading && !cashiers.length}
          paymentOptions={paymentOptions}
          paymentMethods={paymentMethods}
          onSave={setFilters}
        />
      </div>
      {hasChips && (
        <div
          role="group"
          aria-label="Filter penjualan aktif"
          className="page-gutter mt-3 flex h-11 items-start gap-2 overflow-x-auto overflow-y-hidden [scrollbar-width:thin]"
        >
          {chips.map(({ key, label }) => (
            <Button
              key={key}
              type="button"
              variant="secondary"
              size="sm"
              className="rounded-full"
              aria-label={`Hapus filter ${label}`}
              onClick={() =>
                setFilters((current) => ({
                  ...current,
                  [key]: key === "dateRange" ? undefined : "all",
                }))
              }
            >
              {label}
              <X aria-hidden="true" />
            </Button>
          ))}
        </div>
      )}
    </>
  );
  return (
    <>
      {userScope && (
        <CollapsiblePageHeader title="Detail pengguna" backTo="/users">
          {toolbar}
        </CollapsiblePageHeader>
      )}
      {!userScope && (
        <header className="sales-toolbar sticky top-0 z-20 w-full border-b bg-background pt-[env(safe-area-inset-top)] pb-3">
          <div className="page-gutter flex h-12 items-center gap-2">
            <h1 className="flex-1 text-lg font-semibold">{title}</h1>
            {isCashierTransactions && <CashSessionControl presentation="popover" />}
          </div>
          {toolbar}
        </header>
      )}
      <main
        id="main-content"
        className={cn(
          "page-gutter min-w-0 flex-1 pb-6",
          userScope && hasChips && "pt-[calc(165px+env(safe-area-inset-top)+1rem)]",
          userScope && !hasChips && "pt-[calc(109px+env(safe-area-inset-top)+1rem)]",
          !userScope && "pt-4",
        )}
      >
        {userCard}
        <Tabs.Root
          defaultValue="transactions"
          className={cn(userScope && "mt-5")}
        >
          {userScope && (
            <Tabs.List
              aria-label="Informasi pengguna"
              className="mb-4 flex border-b"
            >
              <Tabs.Tab
                value="transactions"
                className="flex-1 border-b-2 border-transparent px-4 py-3 text-sm font-medium text-muted-foreground outline-none data-active:border-ring data-active:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                Transaksi
              </Tabs.Tab>
              <Tabs.Tab
                value="summary"
                className="flex-1 border-b-2 border-transparent px-4 py-3 text-sm font-medium text-muted-foreground outline-none data-active:border-ring data-active:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                Summary
              </Tabs.Tab>
            </Tabs.List>
          )}
          {missingBranch && (
            <p
              role="status"
              className="py-12 text-center text-sm text-muted-foreground"
            >
              Cabang akun belum tersedia.
            </p>
          )}
          {!missingBranch && transactions.isPending && (
            <SkeletonGroup label="Memuat penjualan" className="space-y-4">
              {userScope ? (
                <>
                  <Tabs.Panel value="summary"><SalesSummarySkeleton /></Tabs.Panel>
                  <Tabs.Panel value="transactions"><SkeletonRows rows={4} /></Tabs.Panel>
                </>
              ) : (
                <>
                  <SalesSummarySkeleton />
                  <SkeletonRows rows={4} />
                </>
              )}
            </SkeletonGroup>
          )}
          {!missingBranch && transactions.isError && (
            <div role="alert" className="space-y-3 py-16 text-center">
              <p className="text-sm">
                Gagal memuat penjualan. Silakan coba lagi.
              </p>
              <Button
                type="button"
                variant="outline"
                loading={transactions.isFetching}
                onClick={() => void transactions.refetch()}
              >
                Coba lagi
              </Button>
            </div>
          )}
          {!missingBranch && transactions.isSuccess && userScope && (
            <>
              <Tabs.Panel value="summary" className="flow-panel">
                <SalesSummaryCards sales={visibleSales} summary={summary} />
              </Tabs.Panel>
              <Tabs.Panel value="transactions" className="flow-panel">
                <SalesTransactionList sales={visibleSales} />
                {!visibleSales.length && (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    Tidak ada transaksi untuk pengguna dan filter ini.
                  </p>
                )}
              </Tabs.Panel>
            </>
          )}
          {!missingBranch && transactions.isSuccess && !userScope && (
            <>
              <SalesSummaryCards sales={visibleSales} summary={summary} />
              <SalesTransactionList sales={visibleSales} />
              {visibleSales.length === 0 && (
                <div className="py-16 text-center">
                  <h2 className="text-sm font-medium">
                    {hasQuery
                      ? "Penjualan tidak ditemukan"
                      : "Belum ada penjualan"}
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {hasQuery
                      ? "Coba pencarian atau filter lain."
                      : "Transaksi penjualan akan tampil di sini."}
                  </p>
                  {hasQuery && (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-4"
                      onClick={() => {
                        setSearch("");
                        setFilters({ ...defaultSalesFilters });
                      }}
                    >
                      Reset pencarian
                    </Button>
                  )}
                </div>
              )}
            </>
          )}
        </Tabs.Root>
      </main>
    </>
  );
}
