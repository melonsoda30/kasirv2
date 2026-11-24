import { useId, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { SlidersHorizontal } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { cn } from "cn";
import { PageLayout } from "@/components/page-layout";
import { DatePickerRange } from "@/components/date-picker-range";
import { Button } from "@/components/ui/button";
import {
  Skeleton,
  SkeletonGroup,
  SkeletonRows,
} from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  Drawer,
  DrawerClose,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { InputNominal } from "@/components/input-nominal";
import {
  SelectCombobox,
  type ComboboxOption,
} from "@/components/select-combobox";
import { Textarea } from "@/components/ui/textarea";
import {
  getAccountBranches,
  isAdminAccount,
  useAuthStore,
} from "@/features/auth/auth-store";
import { fetchUsers, userDisplayName } from "@/features/users/users-api";
import { fetchTransactionDetail } from "@/features/sales/sales-api";
import { formatCurrency } from "@/lib/currency";
import {
  closeCashSession,
  fetchCashSessionReport,
  fetchCashSessions,
  type CashSession,
  type CashSessionReportTransaction,
} from "./cash-session-api";
import { CashSessionAmounts, CashSessionControl } from "./cash-session-control";
import {
  cashSessionScope,
  refreshCashSessionData,
  useCashSession,
} from "./cash-session-query";

const all = { value: "all", label: "Semua" };
interface CashSessionFilters {
  status: string;
  branch: string;
  cashier: string;
  shift: string;
  dateRange: DateRange | undefined;
}

const defaultFilters: CashSessionFilters = {
  status: "all",
  branch: "all",
  cashier: "all",
  shift: "all",
  dateRange: undefined,
};

function cashDifference(session: CashSession) {
  if (session.closing_cash == null) return undefined;
  const difference = session.closing_cash - session.expected_cash;
  if (difference === 0) return undefined;
  const label = difference < 0 ? "kurang" : "lebih";
  return `Uang ${label} ${formatCurrency(Math.abs(difference))}`;
}

function ShiftTransactionRow({ transaction, username }: {
  transaction: CashSessionReportTransaction;
  username?: string;
}) {
  const { id_trx, date, total, status, payment_method } = transaction;
  const needsMethod = !payment_method && status.trim().toLowerCase() !== "pending";
  const detail = useQuery({
    queryKey: ["transactions", "detail", username, id_trx],
    queryFn: ({ signal }) => fetchTransactionDetail(id_trx, signal),
    enabled: needsMethod && !!username,
    meta: { toast: false },
  });
  const method = payment_method || detail.data?.paymentMethod || "";
  const names: Record<string, string> = { cash: "Tunai", qris: "QRIS" };
  const methodLabel = names[method.toLowerCase()] ?? method;

  return (
    <li className="flex justify-between gap-2 py-2">
      <div className="min-w-0 break-words">
        {id_trx}
        <p className="text-xs text-muted-foreground">{date} ({status})</p>
      </div>
      <div className="flex min-w-0 flex-wrap items-baseline justify-end gap-x-1.5 text-right">
        {needsMethod && detail.isLoading && <Skeleton className="inline-block h-3 w-12 self-center" />}
        {methodLabel && <span className="wrap-anywhere text-xs text-muted-foreground">({methodLabel})</span>}
        <span className="shrink-0">{formatCurrency(total)}</span>
      </div>
    </li>
  );
}

function CashSessionFilterDrawer({
  filters,
  onSave,
  shifts,
  branches,
  cashiers,
  cashiersLoading,
}: {
  filters: CashSessionFilters;
  onSave: (filters: CashSessionFilters) => void;
  shifts: ComboboxOption[];
  branches?: ComboboxOption[];
  cashiers?: ComboboxOption[];
  cashiersLoading: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const fields = [
    {
      key: "status",
      label: "Status shift",
      options: [
        { value: "open", label: "Terbuka" },
        { value: "closed", label: "Selesai" },
      ],
    },
    { key: "shift", label: "Shift", options: shifts },
    { key: "branch", label: "Cabang", options: branches },
    { key: "cashier", label: "Kasir", options: cashiers },
  ] as const;
  const visibleFields = fields.filter(({ options }) => options !== undefined);
  const active =
    !!filters.dateRange?.from ||
    visibleFields.some(({ key }) => filters[key] !== "all");
  const hasDraftFilters =
    !!draft.dateRange?.from ||
    visibleFields.some(({ key }) => draft[key] !== "all");

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(filters);
        setOpen(next);
      }}
    >
      <DrawerTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="relative"
          aria-label={
            active ? "Filter riwayat, filter aktif" : "Filter riwayat"
          }
        >
          <SlidersHorizontal aria-hidden="true" />
          {active && (
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-ring" />
          )}
        </Button>
      </DrawerTrigger>
      <DrawerContent aria-describedby={undefined}>
        <DrawerHeader>
          <DrawerTitle>Filter riwayat shift</DrawerTitle>
        </DrawerHeader>
        <DrawerBody className="space-y-5">
          <div className="space-y-2">
            <label htmlFor={`${id}-date-range`} className="text-sm font-medium">
              Rentang tanggal
            </label>
            <DatePickerRange
              type="modal"
              id={`${id}-date-range`}
              value={draft.dateRange}
              onChange={(dateRange) =>
                setDraft((current) => ({ ...current, dateRange }))
              }
            />
          </div>
          {visibleFields.map(({ key, label, options }) => (
            <div key={key} className="space-y-2">
              <label htmlFor={`${id}-${key}`} className="text-sm font-medium">
                {label}
              </label>
              {key === "cashier" && cashiersLoading ? (
                <SkeletonGroup label="Memuat kasir">
                  <Skeleton className="h-10 w-full" />
                </SkeletonGroup>
              ) : (
                <SelectCombobox
                  id={`${id}-${key}`}
                  searchable={false}
                  options={[all, ...(options ?? [])]}
                  value={draft[key]}
                  onChange={(value) =>
                    setDraft({ ...draft, [key]: value || "all" })
                  }
                />
              )}
            </div>
          ))}
        </DrawerBody>
        <DrawerFooter>
          <div className={cn("grid gap-2", hasDraftFilters && "grid-cols-2")}>
            {hasDraftFilters && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setDraft(defaultFilters)}
              >
                Reset filter
              </Button>
            )}
            <Button
              type="button"
              onClick={() => {
                onSave(draft);
                setOpen(false);
              }}
            >
              Simpan
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

export function CashSessionPage({
  close,
  initialSessionId,
}: {
  close?: boolean;
  initialSessionId?: string;
}) {
  const account = useAuthStore((state) => state.session?.account);
  const current = useCashSession();
  const queryClient = useQueryClient();
  const admin = isAdminAccount(account);
  const branches = getAccountBranches(account?.store);
  const scope = cashSessionScope(account);
  const [appliedFilters, setAppliedFilters] = useState(defaultFilters);
  const [selected, setSelected] = useState(
    close ? undefined : initialSessionId,
  );
  const { status, branch, cashier, shift, dateRange } = appliedFilters;
  const filters = {
    status,
    shift,
    ...(dateRange?.from &&
      dateRange.to && {
        startDate: format(dateRange.from, "yyyy-MM-dd"),
        endDate: format(dateRange.to, "yyyy-MM-dd"),
      }),
    ...(admin && { branch_id: branch, user: cashier }),
  };
  const list = useQuery({
    queryKey: ["cash-session", "list", ...scope, filters],
    queryFn: ({ signal }) => fetchCashSessions(filters, signal),
    enabled: !!current.data?.use_session,
    meta: { toast: false },
  });
  const users = useQuery({
    queryKey: ["cash-session", "users", ...scope],
    queryFn: ({ signal }) => fetchUsers(signal),
    enabled: admin && !!current.data?.use_session,
    meta: { toast: false },
  });
  const report = useQuery({
    queryKey: ["cash-session", "report", ...scope, selected],
    queryFn: ({ signal }) => fetchCashSessionReport(selected!, signal),
    enabled: !!selected && !!current.data?.use_session,
    meta: { toast: false },
  });
  const [force, setForce] = useState(false);
  const forceFormId = useId();
  const detailDescriptionId = useId();
  const [closingCash, setClosingCash] = useState("");
  const [closeNotes, setCloseNotes] = useState("");
  const forceClose = useMutation({
    mutationFn: (id: string) =>
      closeCashSession(
        {
          session_id: id,
          closing_cash: closingCash,
          close_notes: closeNotes.trim(),
        },
        true,
      ),
    onSuccess: () => {
      setForce(false);
      toast.success("Shift ditutup.");
    },
    onSettled: () => {
      refreshCashSessionData(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    },
    meta: { toast: false },
  });

  const session = report.data?.session;
  const sessionDifference = session?.status === "closed" ? cashDifference(session) : undefined;
  const canForceClose = admin && session?.status === "open";
  const branchName = (id: string) =>
    branches.find((branch) => branch.id === id)?.name || id;

  return (
    <PageLayout title="Shift" prevLink={admin ? "/" : "/profil"}>
      <div className="space-y-4">
        <CashSessionControl
          returnToClose={close}
          closeSessionId={initialSessionId}
        />
        {current.data?.use_session === false && (
          <p className="text-sm text-muted-foreground">
            Toko ini menggunakan mode Tanpa Shift.
          </p>
        )}
        {current.data?.use_session && (
          <section className="space-y-3" aria-labelledby="cash-session-history">
            <div className="flex items-center justify-between gap-3">
              <h2 id="cash-session-history" className="font-semibold">
                Riwayat shift
              </h2>
              <CashSessionFilterDrawer
                filters={appliedFilters}
                onSave={setAppliedFilters}
                shifts={current.data.shift_list
                  .filter(({ code }) => code !== "none")
                  .map(({ code, title }) => ({ value: code, label: title }))}
                branches={
                  admin
                    ? branches.map(({ id, name }) => ({
                        value: id,
                        label: name,
                      }))
                    : undefined
                }
                cashiers={
                  admin
                    ? (users.data ?? []).map((user) => ({
                        value: user.user_id,
                        label: userDisplayName(user),
                      }))
                    : undefined
                }
                cashiersLoading={users.isLoading}
              />
            </div>
            {list.isPending && (
              <SkeletonGroup label="Memuat riwayat shift">
                <SkeletonRows rows={4} />
              </SkeletonGroup>
            )}
            {list.isError && (
              <div className="space-y-3 py-12 text-center">
                <p role="alert" className="text-sm text-destructive">
                  {list.error.message}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  loading={list.isFetching}
                  onClick={() => void list.refetch()}
                >
                  Coba lagi
                </Button>
              </div>
            )}
            {list.isSuccess && list.data.sessions.length > 0 && (
              <ul className="grid min-w-0 grid-cols-1 gap-2">
                {list.data.sessions.map((row) => (
                  <li key={row.session_id} className="min-w-0">
                    <button
                      type="button"
                      className="bento-surface w-full space-y-3 p-4 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setSelected(row.session_id)}
                    >
                      <span className="flex items-start justify-between gap-3">
                        <span className="min-w-0">
                          <span className="block break-words text-sm font-semibold">
                            Shift {row.shift_title}
                          </span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {row.shift_date}
                          </span>
                        </span>
                        <StatusBadge
                          tone={row.status === "open" ? "ready" : "neutral"}
                          className="max-w-[55%] shrink-0 wrap-anywhere text-right"
                        >
                          {row.status === "open" && "Terbuka"}
                          {row.status === "closed" && "Selesai"}
                          {row.status === "closed" && row.close_type === "force" && row.closed_by_name.trim() &&
                            ` (${row.closed_by_name.trim()})`}
                        </StatusBadge>
                      </span>
                      <span className="block text-sm font-medium tabular-nums">
                        {row.status === "closed" ? cashDifference(row) : formatCurrency(row.omzet)}
                      </span>
                      <span className="block break-words border-t pt-2 text-xs text-muted-foreground">
                        {row.user_name} ({branchName(row.branch_id)})
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {list.isSuccess && list.data.sessions.length === 0 && (
              <p className="py-16 text-center text-sm text-muted-foreground">
                Belum ada shift yang sesuai.
              </p>
            )}
          </section>
        )}
      </div>

      <Drawer
        open={!!selected && !!current.data?.use_session}
        dismissible={!forceClose.isPending}
        onOpenChange={(open) => {
          if (!open && !forceClose.isPending) {
            setSelected(undefined);
            setForce(false);
            forceClose.reset();
          }
        }}
      >
        <DrawerContent
          aria-describedby={session ? detailDescriptionId : undefined}
        >
          <DrawerHeader>
            <DrawerTitle>
              {force ? "Tutup paksa shift" : "Detail shift"}
            </DrawerTitle>
            {session && (
              <DrawerDescription id={detailDescriptionId}>
                {session.shift_title} ({session.shift_date})
              </DrawerDescription>
            )}
          </DrawerHeader>
          <DrawerBody className="space-y-4 text-sm">
            {report.isPending && (
              <SkeletonGroup label="Memuat detail shift">
                <SkeletonRows />
              </SkeletonGroup>
            )}
            {!report.isPending && report.isError && (
              <div className="space-y-2">
                <p role="alert" className="text-destructive">
                  {report.error.message}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  loading={report.isFetching}
                  onClick={() => void report.refetch()}
                >
                  Coba lagi
                </Button>
              </div>
            )}
            {!report.isPending && !report.isError && session && (
              <>
                <div className="space-y-1">
                  <p className="font-medium">
                    {session.user_name} ({branchName(session.branch_id)})
                  </p>
                  {/* <p className="break-all font-mono text-xs text-muted-foreground">
                    {session.session_id}
                  </p> */}
                </div>
                <CashSessionAmounts session={session} />
                {force ? (
                  <form
                    id={forceFormId}
                    className="space-y-3"
                    onSubmit={(event) => {
                      event.preventDefault();
                      if (
                        canForceClose &&
                        closeNotes.trim() &&
                        !forceClose.isPending
                      )
                        forceClose.mutate(session.session_id);
                    }}
                  >
                    <label className="grid gap-2 font-medium">
                      Uang tunai di laci (opsional)
                      <InputNominal
                        value={closingCash}
                        onValueChange={setClosingCash}
                        disabled={forceClose.isPending}
                      />
                    </label>
                    <label className="grid gap-2 font-medium">
                      Alasan penutupan
                      <Textarea
                        value={closeNotes}
                        onChange={(event) =>
                          setCloseNotes(event.currentTarget.value)
                        }
                        required
                        disabled={forceClose.isPending}
                      />
                    </label>
                    {forceClose.isError && (
                      <p role="alert" className="text-destructive">
                        {forceClose.error.message}
                      </p>
                    )}
                  </form>
                ) : (
                  <>
                    {session.status === "closed" && (sessionDifference || session.close_notes) && (
                      <div className="space-y-1">
                        {sessionDifference && (
                          <p>
                            {sessionDifference}
                            {session.difference_exceeded && " (di luar toleransi)"}
                          </p>
                        )}
                        {session.close_notes && (
                          <p className="whitespace-pre-wrap break-words">
                            {session.close_notes}
                          </p>
                        )}
                      </div>
                    )}
                    {!!report.data?.by_method.length && (
                      <div className="space-y-2">
                        <h3 className="font-semibold">Metode pembayaran</h3>
                        <ul className="">
                          {report.data.by_method.map(
                            ({ method, count, total }) => (
                              <li
                                key={method}
                                className="flex justify-between gap-2 py-1"
                              >
                                <span>
                                  {method} ({count})
                                </span>
                                <span>{formatCurrency(total)}</span>
                              </li>
                            ),
                          )}
                        </ul>
                      </div>
                    )}
                    {!!report.data?.transactions.length && (
                      <div className="space-y-2">
                        <h3 className="font-semibold">Transaksi</h3>
                        <ul className="divide-y">
                          {report.data.transactions.map((transaction) => (
                            <ShiftTransactionRow key={transaction.id_trx} transaction={transaction}
                              username={account?.account_username} />
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </DrawerBody>
          <DrawerFooter>
            {force && (
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={forceClose.isPending}
                  onClick={() => setForce(false)}
                >
                  Kembali
                </Button>
                <Button
                  type="submit"
                  form={forceFormId}
                  variant="destructive"
                  loading={forceClose.isPending}
                  disabled={
                    !canForceClose || !closeNotes.trim() || forceClose.isPending
                  }
                >
                  Tutup paksa
                </Button>
              </div>
            )}
            {!force && (
              <div className={cn("grid gap-2", canForceClose && "grid-cols-2")}>
                <DrawerClose asChild>
                  <Button type="button" variant="outline">
                    Tutup
                  </Button>
                </DrawerClose>
                {canForceClose && (
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => {
                      setClosingCash("");
                      setCloseNotes("");
                      forceClose.reset();
                      setForce(true);
                    }}
                  >
                    Tutup paksa
                  </Button>
                )}
              </div>
            )}
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </PageLayout>
  );
}
