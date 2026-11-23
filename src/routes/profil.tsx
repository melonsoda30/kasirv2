import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import { PageLayout } from "../components/page-layout";
import {
  ArrowRight,
  ChevronRight,
  LockKeyhole,
  LogOut,
  Pencil,
  Clock,
  CreditCard,
  Percent,
  RotateCcwClock,
  Store,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SelectCombobox } from "@/components/select-combobox";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getCashierBranch,
  getCashierBranches,
  isAdminAccount,
  isCashierEventLevel,
  useAuthStore,
} from "@/features/auth/auth-store";
import { useCashSession } from "@/features/cash-session/cash-session-query";
import { API_BASE_URL } from "@/lib/api";
import { useId, useState } from "react";

export const Route = createFileRoute("/profil")({
  component: ProfilePage,
});

const accountMenus = [
  { label: "Ganti Password", icon: LockKeyhole, to: "/profil/ganti-password" },
  { label: "Users", icon: Users, to: "/users" },
] as const;

const menuRowClass =
  "flex min-h-13 w-full items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

function ProfileAction({
  to,
  onClick,
  icon: Icon,
  label,
  status,
}: ({ to: "/sesi-kas"; onClick?: never } | { to?: never; onClick: () => void }) & {
  icon: LucideIcon;
  label: string;
  status?: string;
}) {
  const className = "flex w-full items-center gap-3 border-t bg-primary/5 px-4 py-3 text-left transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
  const content = (
    <>
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="flex-1 text-sm font-medium">{label}</span>
      {status && (
        <span className="text-xs text-muted-foreground">{status}</span>
      )}
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </span>
    </>
  );
  if (onClick) {
    return <button type="button" className={className} onClick={onClick}>{content}</button>;
  }
  return <Link to={to} className={className}>{content}</Link>;
}

function ProfilePage() {
  const session = useAuthStore((state) => state.session);
  const account = session?.account;
  const isCashier = isCashierEventLevel(account?.event_level);
  const isAdmin = isAdminAccount(account);
  const cashierBranch = getCashierBranch(session);
  const branches = getCashierBranches(account?.store);
  const cashSession = useCashSession(isCashier || isAdmin);
  const usesShift = cashSession.data?.use_session === true;
  const shiftStatus = cashSession.data?.session ? "Aktif" : "Belum dibuka";
  const visibleAccountMenus = accountMenus.filter(({ to }) =>
    !isCashier || to !== "/users",
  );
  const navigate = useNavigate();
  const [imageFailed, setImageFailed] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [chooseBranch, setChooseBranch] = useState(false);
  const [branchId, setBranchId] = useState("");
  const branchInputId = useId();
  const image = account?.account_img
    ? new URL(account.account_img, `${API_BASE_URL.replace(/\/$/, "")}/`).href
    : "";
  function switchMode() {
    if (cashierBranch) {
      useAuthStore.getState().setCashierBranch();
      void navigate({ to: "/" });
      return;
    }
    setBranchId("");
    setChooseBranch(true);
  }
  function openCashier() {
    if (!useAuthStore.getState().setCashierBranch(branchId)) return;
    setChooseBranch(false);
    void navigate({ to: "/" });
  }
  async function logout() {
    useAuthStore.getState().clearSession();
    await navigate({ to: "/login", search: { redirect: "/" }, replace: true });
  }
  return (
    <PageLayout title="Profil" wide={!isCashier}>
      <div className={cn("grid items-start gap-4", !isCashier && "md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]")}>
        <section
          aria-label="Profil pengguna"
          className="bento-surface col-span-full overflow-hidden"
        >
          <div className="flex items-center gap-3 p-4 sm:p-5">
            <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
              {image && !imageFailed ? (
                <img
                  src={image}
                  alt="Foto profil"
                  className="size-full object-cover"
                  onError={() => setImageFailed(true)}
                />
              ) : (
                <UserRound
                  className="size-7 text-muted-foreground"
                  aria-label="Foto profil belum tersedia"
                />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold">
                {account?.account_fullname || account?.account_username}
              </p>
              <p className="mt-1 break-all text-sm text-muted-foreground">
                {account?.account_email || "-"}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="shrink-0"
              aria-label="Edit profil"
              title="Edit profil"
              asChild
            >
              <Link to="/profil/edit">
                <Pencil aria-hidden="true" />
              </Link>
            </Button>
          </div>
          {isAdmin && (
            <ProfileAction
              onClick={switchMode}
              icon={cashierBranch ? UserRound : Store}
              label={cashierBranch ? "Buka Admin" : "Buka Kasir"}
              status={cashierBranch?.name}
            />
          )}
          {isCashier && usesShift && (
            <ProfileAction
              to="/sesi-kas"
              icon={Clock}
              label="Shift"
              status={shiftStatus}
            />
          )}
        </section>
        <section aria-labelledby="profile-account-heading" className="bento-surface overflow-hidden">
          <h2
            id="profile-account-heading"
            className="border-b px-4 py-3 text-sm font-semibold"
          >
            {isCashier ? "Akun" : "Akun & Pengguna"}
          </h2>
          <ul className="divide-y">
            {visibleAccountMenus.map(({ label, icon: Icon, to }) => (
              <li key={to}>
                <Link to={to} className={menuRowClass}>
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1 font-medium">{label}</span>
                  <ChevronRight
                    className="size-4 shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                </Link>
              </li>
            ))}
          </ul>
        </section>
        {!isCashier && (
          <section aria-labelledby="profile-settings-heading" className="bento-surface overflow-hidden md:row-span-2">
            <h2
              id="profile-settings-heading"
              className="border-b px-4 py-3 text-sm font-semibold"
            >
              Pengaturan Toko
            </h2>
            <ul className="divide-y">
              {(
                [
                  { label: "Toko", icon: Store, to: "/store" },
                  {
                    label: "Pembayaran & Biaya",
                    icon: CreditCard,
                    to: "/settings/pembayaran",
                  },
                  { label: "PPN", icon: Percent, to: "/settings/ppn" },
                  { label: "Shift", icon: Clock, to: "/settings/shift" },
                  { label: "Riwayat shift", icon: RotateCcwClock, to: "/sesi-kas" },
                ] as const
              ).filter(
                ({ to }) => to !== "/sesi-kas" || usesShift,
              ).map(({ label, icon: Icon, to }) => (
                <li key={to}>
                  <Link to={to} className={menuRowClass}>
                    <Icon className="size-4 shrink-0" aria-hidden="true" />
                    <span className="flex-1 font-medium">{label}</span>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}
        <button
          type="button"
          onClick={() => {
            if (cashSession.data?.session) setConfirmLogout(true);
            else void logout();
          }}
          className={cn(
            menuRowClass,
            "bento-surface text-left text-destructive",
          )}
        >
          <LogOut className="size-4 shrink-0" aria-hidden="true" />
          <span className="font-medium">Logout</span>
        </button>
      </div>
      <Drawer open={chooseBranch} onOpenChange={setChooseBranch}>
        <DrawerContent className="product-drawer pb-[env(safe-area-inset-bottom)]" aria-describedby={undefined}>
          <DrawerHeader className="shrink-0">
            <DrawerTitle>Pilih cabang kasir</DrawerTitle>
          </DrawerHeader>
          <div className="min-h-0 space-y-2 overflow-y-auto px-4 pb-4">
            <label htmlFor={branchInputId} className="font-medium">Cabang</label>
            <SelectCombobox
              id={branchInputId}
              placeholder="Pilih cabang"
              disabled={!branches.length}
              options={branches.map(({ id, name }) => ({ value: id, label: name }))}
              value={branchId}
              onChange={setBranchId}
            />
            {!branches.length && <p className="text-muted-foreground">Belum ada cabang yang tersedia.</p>}
          </div>
          <DrawerFooter className="shrink-0 border-t">
            <div className="grid grid-cols-2 gap-2">
              <DrawerClose asChild>
                <Button type="button" variant="outline">Batal</Button>
              </DrawerClose>
              <Button type="button" disabled={!branches.some(({ id }) => id === branchId)} onClick={openCashier}>
                Buka Kasir
              </Button>
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
      <Dialog open={confirmLogout} onOpenChange={setConfirmLogout}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Shift masih aktif</DialogTitle>
            <DialogDescription>
              Tutup buku jika Anda selesai bekerja. Jika keluar sekarang, shift
              tetap aktif saat Anda keluar.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Button asChild>
              <Link
                to="/sesi-kas"
                search={{ close: true }}
                onClick={() => setConfirmLogout(false)}
              >
                Tutup buku
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => void logout()}
            >
              Keluar tanpa menutup shift
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
