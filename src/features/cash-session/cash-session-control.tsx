import {
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
  type Ref,
} from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock, RotateCcwClock } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { SelectCombobox } from "@/components/select-combobox";
import { InputNominal } from "@/components/input-nominal";
import { getCashierBranch, useAuthStore } from "@/features/auth/auth-store";
import { formatCurrency } from "@/lib/currency";
import {
  CashSessionError,
  closeCashSession,
  fetchHandoverCandidates,
  fetchPendingHandovers,
  formatShiftMessage,
  handoverCashSession,
  openCashSession,
  type CashSession,
} from "./cash-session-api";
import {
  cashSessionOptions,
  cashSessionScope,
  refreshCashSessionData,
  useCashSession,
} from "./cash-session-query";

type Step = "open" | "handover" | "close";
const titles: Record<Step, string> = {
  open: "Buka shift",
  handover: "Serah terima",
  close: "Tutup buku",
};
const formLabels = {
  open: { cash: "Uang tunai awal di laci", submit: "Buka shift" },
  handover: {
    cash: "Uang tunai yang diserahkan",
    submit: "Simpan serah terima",
  },
  close: { cash: "Uang tunai di laci", submit: "Konfirmasi tutup buku" },
};
const validCash = (value: string) =>
  value !== "" && Number.isSafeInteger(Number(value)) && Number(value) >= 0;

function formatCashDifference(difference: number) {
  if (difference === 0) return "Uang sesuai.";
  const label = difference < 0 ? "kurang" : "lebih";
  return `Uang ${label} ${formatCurrency(Math.abs(difference))}.`;
}

export function CashSessionControl({
  returnToClose = false,
  closeSessionId,
  presentation = "panel",
  ref,
}: {
  presentation?: "panel" | "popover";
  returnToClose?: boolean;
  closeSessionId?: string;
  ref?: Ref<{ openMenu: () => void }>;
}) {
  const auth = useAuthStore((state) => state.session);
  const account = auth?.account;
  const branch = getCashierBranch(auth);
  const current = useCashSession();
  const queryClient = useQueryClient();
  const scope = cashSessionScope(account);
  const session = current.data?.session;
  const active =
    session?.status === "open" && (!branch || session.branch_id === branch.id)
      ? session
      : null;
  const canOpenAtBranch = !branch || account?.store?.branch_id === branch.id;
  const shiftName = active?.shift_title || "Shift aktif";
  const shiftHours =
    active?.shift_start && active.shift_end
      ? `${active.shift_start.slice(0, 5)}–${active.shift_end.slice(0, 5)}`
      : "";
  const canOpenShift = current.isSuccess && !active && canOpenAtBranch;
  const inPopover = presentation === "popover";
  const [popoverOpen, setPopoverOpen] = useState(false);
  const shifts = current.data?.selectable ?? [];
  const [step, setStep] = useState<Step | null>(() =>
    returnToClose ? "close" : null,
  );
  const [requestedCloseId, setRequestedCloseId] = useState(() =>
    returnToClose ? closeSessionId : undefined,
  );
  const [shiftCode, setShiftCode] = useState("");
  const [recipient, setRecipient] = useState("");
  const [handoverId, setHandoverId] = useState("");
  const [cash, setCash] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [closedAt, setClosedAt] = useState("");
  const [error, setError] = useState("");
  const [pendingIds, setPendingIds] = useState<string[]>([]);
  const saving = useRef(false);
  const openingDrawer = useRef(false);
  const popoverTrigger = useRef<HTMLButtonElement>(null);
  const formId = useId();
  const choiceId = useId();
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const incoming = useQuery({
    queryKey: ["cash-session", "incoming", ...scope],
    queryFn: ({ signal }) => fetchPendingHandovers(signal),
    enabled: !!current.data?.use_session && !active && canOpenAtBranch,
    meta: { toast: false },
  });
  const candidates = useQuery({
    queryKey: ["cash-session", "candidates", ...scope],
    queryFn: ({ signal }) => fetchHandoverCandidates(signal),
    enabled: step === "handover",
    meta: { toast: false },
  });
  function show(next: Step, incomingSession?: CashSession) {
    if (popoverOpen) {
      openingDrawer.current = true;
      setPopoverOpen(false);
    }
    setRequestedCloseId(undefined);
    setError("");
    setPendingIds([]);
    setNotes("");
    setRecipient("");
    setShiftCode("");
    setHandoverId(incomingSession?.session_id ?? "");
    setCash(incomingSession?.handover_amount?.toString() ?? "");
    setStep(next);
    if (next === "close") void current.refetch();
  }

  useImperativeHandle(ref, () => ({ openMenu: () => setPopoverOpen(true) }));

  const chosenShift =
    shifts.find(({ code }) => code === shiftCode) ??
    (shifts.length === 1 ? shifts[0] : undefined);
  const difference =
    active && validCash(cash) ? Number(cash) - active.expected_cash : undefined;
  const handedOver =
    !!active?.handover_to_user && active.handover_to_user !== "0";
  const unresolved = pendingIds.length
    ? pendingIds
    : (active?.pending_ids ?? []);
  const blockedClose =
    !handedOver && (unresolved.length > 0 || (active?.pending_count ?? 0) > 0);
  const noActiveForStep =
    step !== "open" &&
    (!active || (requestedCloseId && requestedCloseId !== active.session_id));
  const dialogStep = noActiveForStep ? null : step;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving.current || !validCash(cash)) return;
    if (step === "open" && (!chosenShift || !canOpenAtBranch)) return;
    if (
      step === "handover" &&
      (!active || !candidates.data?.some(({ id }) => id === recipient))
    )
      return;
    if (step === "close") {
      if (!active || blockedClose) return;
      if (difference !== undefined && difference < 0 && !notes.trim()) {
        setError("Isi alasan selisih uang tunai.");
        notesRef.current?.focus();
        return;
      }
    }

    saving.current = true;
    setBusy(true);
    setError("");
    const key = cashSessionOptions(account).queryKey;
    try {
      if (step === "open" && chosenShift) {
        const result = await openCashSession({
          shift_code: chosenShift.code,
          opening_cash: cash,
          notes: notes.trim(),
          ...(handoverId && { handover_session_id: handoverId }),
        });
        await queryClient.cancelQueries({ queryKey: key });
        queryClient.setQueryData(
          key,
          (previous) => previous && { ...previous, session: result.data },
        );
        if (result.warning) toast.warning(result.warning);
        else toast.success("Shift dibuka.");
        setClosedAt("");
        setStep(null);
      } else if (step === "close" && active) {
        const result = await closeCashSession({
          session_id: active.session_id,
          closing_cash: cash,
          close_notes: notes.trim(),
        });
        await queryClient.cancelQueries({ queryKey: key });
        queryClient.setQueryData(
          key,
          (previous) => previous && { ...previous, session: null },
        );
        const actualDifference =
          (result.data.closing_cash ?? Number(cash)) -
          result.data.expected_cash;
        setClosedAt(result.data.closed_at.slice(11, 16));
        toast.success("Shift ditutup.", {
          description: formatCashDifference(actualDifference),
        });
        setStep(null);
      } else if (step === "handover" && active) {
        const result = await handoverCashSession({
          session_id: active.session_id,
          to_user: recipient,
          amount: cash,
          notes: notes.trim(),
        });
        await queryClient.cancelQueries({ queryKey: key });
        queryClient.setQueryData(key, (previous) =>
          previous?.session
            ? {
                ...previous,
                session: {
                  ...previous.session,
                  handover_to_user: recipient,
                  handover_to_name:
                    candidates.data?.find(({ id }) => id === recipient)
                      ?.fullname ?? "",
                  handover_amount: Number(cash),
                },
              }
            : previous,
        );
        toast.success("Serah terima dicatat.", {
          description:
            formatShiftMessage(result.data.carry_over_note) || undefined,
        });
        show("close");
      }
      refreshCashSessionData(queryClient);
      void queryClient.invalidateQueries({ queryKey: ["transactions"] });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Permintaan shift gagal.";
      if (error instanceof CashSessionError && error.pendingIds.length)
        setPendingIds(error.pendingIds);
      if (
        error instanceof CashSessionError &&
        (error.status === 409 || (step === "close" && error.status === 403))
      ) {
        setStep(null);
        toast.error(message);
      } else {
        setError(message);
        if (step === "close" && /alasan/i.test(message))
          notesRef.current?.focus();
      }
      void current.refetch();
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  if (!current.isError && current.data?.use_session === false) return null;

  const status = (
    <>
      {current.isError && (
        <div className="space-y-2">
          <p role="alert">Status shift belum bisa diperiksa.</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={current.isFetching}
            onClick={() => void current.refetch()}
          >
            Coba lagi
          </Button>
        </div>
      )}
      {current.isPending && (
        <SkeletonGroup label="Memeriksa shift" className="space-y-2">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/2" />
        </SkeletonGroup>
      )}
      {current.isSuccess && active && (
        <div className="space-y-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
              <p className="min-w-0 break-words font-semibold">
                <span
                  aria-hidden="true"
                  className="mr-1.5 inline-block size-2 rounded-full border border-ready-foreground bg-ready-indicator align-middle"
                />
                {active.shift_title
                  ? `Shift ${active.shift_title} aktif`
                  : shiftName}
              </p>
              {shiftHours && (
                <p className="text-xs text-muted-foreground tabular-nums">
                  {shiftHours}
                </p>
              )}
            </div>
            {active.opened_at && (
              <p className="text-xs text-muted-foreground">
                Dibuka pukul {active.opened_at.slice(11, 16)}
              </p>
            )}
            {/* <p className="break-all text-xs text-muted-foreground">
              {active.session_id}
            </p> */}
          </div>
          <CashSessionAmounts session={active} />
          {active.pending_count > 0 && (
            <p className="text-muted-foreground">
              {active.pending_count} pesanan belum dibayar.
            </p>
          )}
          {handedOver && (
            <p className="text-muted-foreground">
              Serah terima dicatat untuk{" "}
              {active.handover_to_name || "kasir penerima"}. Lanjutkan tutup
              buku.
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={handedOver}
              onClick={() => show("handover")}
            >
              Serah terima
            </Button>
            <Button type="button" onClick={() => show("close")}>
              Tutup buku
            </Button>
          </div>
        </div>
      )}
      {current.isSuccess && !active && !canOpenAtBranch && (
        <p role="status" className="text-muted-foreground">
          Untuk membuka shift di {branch?.name}, gunakan akun yang terdaftar di
          cabang ini.
        </p>
      )}
      {canOpenShift && (
        <>
          <p className="font-semibold">
            {closedAt
              ? `Shift ditutup pukul ${closedAt}`
              : "Shift belum dibuka"}
          </p>
          {incoming.isPending && (
            <SkeletonGroup
              label="Memeriksa serah terima shift"
              className="space-y-2"
            >
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </SkeletonGroup>
          )}
          {incoming.data?.map((session) => (
            <div key={session.session_id} className="space-y-2">
              <p>
                Ada serah terima {formatCurrency(session.handover_amount ?? 0)}{" "}
                dari {session.handover_from_user_name || session.user_name}.
              </p>
              <Button
                className="w-full"
                type="button"
                onClick={() => show("open", session)}
              >
                Terima dan buka shift
              </Button>
            </div>
          ))}
          {!incoming.isPending && !incoming.data?.length && (
            <p className="text-muted-foreground">
              Buka shift untuk menerima pembayaran.
            </p>
          )}
          {!incoming.data?.length && (!inPopover || !incoming.isPending) && (
            <Button
              className="w-full"
              type="button"
              onClick={() => show("open")}
            >
              Buka shift
            </Button>
          )}
          {incoming.isError && (
            <Button
              variant="ghost"
              size="sm"
              loading={incoming.isFetching}
              onClick={() => void incoming.refetch()}
            >
              Periksa ulang serah terima
            </Button>
          )}
        </>
      )}
    </>
  );

  return (
    <>
      {inPopover ? (
        <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
          <PopoverTrigger asChild>
            <Button
              ref={popoverTrigger}
              type="button"
              variant={canOpenShift ? "default" : "outline"}
              size="sm"
              aria-label={
                active && shiftHours ? `${shiftName}, ${shiftHours}` : undefined
              }
            >
              <Clock
                className={cn(
                  active && "fill-ready-indicator text-status-icon-foreground",
                )}
                aria-hidden="true"
              />
              {!active && (canOpenShift ? "Buka shift" : "Shift")}
              {active && (
                <span
                  className="grid max-w-36 min-w-0 overflow-hidden text-left"
                  aria-hidden={!!shiftHours}
                >
                  <span
                    className={cn(
                      "col-start-1 row-start-1 truncate",
                      shiftHours &&
                        "motion-safe:animate-[shift-label_14s_ease-in-out_infinite]",
                    )}
                  >
                    {shiftName}
                  </span>
                  {shiftHours && (
                    <span className="col-start-1 row-start-1 hidden tabular-nums motion-safe:block motion-safe:animate-[shift-label_14s_ease-in-out_-7s_infinite]">
                      {shiftHours}
                    </span>
                  )}
                </span>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            aria-label="Shift"
            className="max-h-(--radix-popover-content-available-height) max-w-[calc(100vw-2rem)] overflow-y-auto p-3"
            onCloseAutoFocus={(event) => {
              if (openingDrawer.current) {
                event.preventDefault();
                openingDrawer.current = false;
              }
            }}
          >
            {status}
            {current.data?.use_session && (
              <Button
                asChild
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setPopoverOpen(false)}
              >
                <Link to="/sesi-kas">
                  <RotateCcwClock className="size-4" /> Riwayat shift
                </Link>
              </Button>
            )}
          </PopoverContent>
        </Popover>
      ) : (
        <section
          className="space-y-2 rounded-lg border bg-background p-4 text-sm"
          aria-label="Shift"
        >
          {status}
        </section>
      )}

      <Drawer
        open={!!dialogStep && !current.isError}
        dismissible={!busy}
        onOpenChange={(open) => {
          if (!open && !saving.current) setStep(null);
        }}
      >
        <DrawerContent
          aria-describedby={undefined}
          onCloseAutoFocus={
            inPopover
              ? (event) => {
                  event.preventDefault();
                  popoverTrigger.current?.focus();
                }
              : undefined
          }
        >
          {dialogStep && (
            <>
              <DrawerHeader>
                <DrawerTitle>{titles[dialogStep]}</DrawerTitle>
              </DrawerHeader>
              <form
                id={formId}
                className="drawer-body space-y-4"
                onSubmit={(event) => void submit(event)}
              >
                {active && dialogStep !== "open" && (
                  <CashSessionAmounts session={active} />
                )}
                {dialogStep === "open" && (
                  <>
                    <div className="space-y-2">
                      <label htmlFor={choiceId} className="font-medium">
                        Shift kerja
                      </label>
                      <SelectCombobox
                        id={choiceId}
                        searchable={false}
                        placeholder="Pilih shift"
                        disabled={busy}
                        options={shifts.map(
                          ({ code, title, start_time, end_time }) => ({
                            value: code,
                            label: `${title} (${start_time}–${end_time})`,
                          }),
                        )}
                        value={chosenShift?.code ?? ""}
                        onChange={setShiftCode}
                      />
                      {!shifts.length && (
                        <p className="text-muted-foreground">
                          Belum ada shift yang bisa dipilih.
                        </p>
                      )}
                      {chosenShift?.end_time &&
                        chosenShift.start_time > chosenShift.end_time && (
                          <p className="text-muted-foreground">
                            Shift ini lewat tengah malam.
                          </p>
                        )}
                    </div>
                  </>
                )}
                {dialogStep === "handover" && (
                  <div className="space-y-2">
                    <label htmlFor={choiceId} className="font-medium">
                      Kasir penerima
                    </label>
                    {candidates.isPending ? (
                      <SkeletonGroup label="Memuat kasir">
                        <Skeleton className="h-10 w-full" />
                      </SkeletonGroup>
                    ) : (
                      <SelectCombobox
                        id={choiceId}
                        searchable={false}
                        placeholder="Pilih kasir"
                        disabled={busy || !candidates.data?.length}
                        options={
                          candidates.data?.map(({ id, fullname }) => ({
                            value: id,
                            label: fullname,
                          })) ?? []
                        }
                        value={recipient}
                        onChange={setRecipient}
                      />
                    )}
                    {candidates.isError && (
                      <Button
                        type="button"
                        variant="outline"
                        loading={candidates.isFetching}
                        onClick={() => void candidates.refetch()}
                      >
                        Muat ulang daftar kasir
                      </Button>
                    )}
                    {candidates.data?.length === 0 && (
                      <p className="text-muted-foreground">
                        Belum ada kasir yang bisa menerima serah terima.
                      </p>
                    )}
                    {!!active?.pending_count && (
                      <p>
                        {active.pending_count} pesanan belum dibayar akan
                        dipindahkan saat penerima membuka shift.
                      </p>
                    )}
                  </div>
                )}
                {dialogStep === "close" && blockedClose && (
                  <div className="space-y-2 rounded-lg border p-3">
                    <p>
                      Selesaikan atau batalkan{" "}
                      {active?.pending_count || unresolved.length} pesanan yang
                      belum dibayar sebelum tutup buku.
                    </p>
                    {!!unresolved.length && (
                      <p className="break-words text-xs text-muted-foreground">
                        {unresolved.join(", ")}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" asChild>
                        <Link
                          to="/cart"
                          search={{ session: active?.session_id }}
                        >
                          Lihat pesanan
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        loading={current.isFetching}
                        onClick={() => {
                          void current.refetch().then(({ isSuccess }) => {
                            if (isSuccess) setPendingIds([]);
                          });
                        }}
                      >
                        Periksa lagi
                      </Button>
                    </div>
                  </div>
                )}
                <label className="grid gap-2 font-medium">
                  {formLabels[dialogStep].cash}
                  <InputNominal
                    value={cash}
                    onValueChange={setCash}
                    required
                    disabled={busy}
                  />
                </label>
                {dialogStep === "close" && difference !== undefined && (
                  <p
                    role="status"
                    className={cn(
                      difference < 0 && "text-destructive",
                      difference === 0 && "text-success-foreground",
                      difference > 0 && "text-blue-700 dark:text-blue-400",
                    )}
                  >
                    {formatCashDifference(difference)}
                    {Math.abs(difference) >
                      (current.data?.cash_tolerance ?? 0) &&
                      " Selisih di luar toleransi."}
                  </p>
                )}
                <label className="grid gap-2 font-medium">
                  {dialogStep === "close" &&
                  difference !== undefined &&
                  difference < 0
                    ? "Alasan selisih"
                    : "Catatan (opsional)"}
                  <Textarea
                    ref={notesRef}
                    value={notes}
                    onChange={(event) => setNotes(event.currentTarget.value)}
                    rows={2}
                    disabled={busy}
                  />
                </label>
                {error && (
                  <p role="alert" className="text-destructive">
                    {error}
                  </p>
                )}
              </form>
              <DrawerFooter>
                <div className="grid grid-cols-2 gap-2">
                  <DrawerClose asChild>
                    <Button type="button" variant="outline" disabled={busy}>
                      Batal
                    </Button>
                  </DrawerClose>
                  <Button
                    type="submit"
                    form={formId}
                    className="whitespace-normal"
                    loading={busy}
                    disabled={
                      busy ||
                      !validCash(cash) ||
                      (dialogStep === "open" && !chosenShift) ||
                      (dialogStep === "handover" && !recipient) ||
                      (dialogStep === "close" && blockedClose)
                    }
                  >
                    {formLabels[dialogStep].submit}
                  </Button>
                </div>
              </DrawerFooter>
            </>
          )}
        </DrawerContent>
      </Drawer>
    </>
  );
}

export function CashSessionAmounts({ session }: { session: CashSession }) {
  const rows = [
    ["Modal cash", session.opening_cash],
    ["Tunai masuk", session.cash_in],
    ["Saldo cash", session.expected_cash],
  ] as const;
  return (
    <div className="grid gap-2">
      <dl className="space-y-2 rounded-lg border p-3">
        {rows.map(([label, amount]) => (
          <div key={label} className="flex justify-between gap-3">
            <dt>{label}</dt>
            <dd className="shrink-0 font-medium tabular-nums">
              {formatCurrency(amount)}
            </dd>
          </div>
        ))}
      </dl>
      <dl className="flex justify-between gap-3 rounded-lg border p-3">
        <dt>Omzet</dt>
        <dd className="shrink-0 font-semibold tabular-nums">
          {formatCurrency(session.omzet)}
        </dd>
      </dl>
    </div>
  );
}
