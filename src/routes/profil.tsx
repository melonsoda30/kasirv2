import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import { toast } from "sonner";
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
import { SkeletonImage } from "@/components/ui/skeleton-image";
import { StatusBadge } from "@/components/ui/status-badge";
import { SelectCombobox } from "@/components/select-combobox";
import {
  Drawer,
  DrawerClose,
  DrawerBody,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  getCashierBranch,
  getCashierBranches,
  isAdminAccount,
  isAdminMode,
  isCashierEventLevel,
  useAuthStore,
} from "@/features/auth/auth-store";
import { useCashSession } from "@/features/cash-session/cash-session-query";
import { DemoResetButton } from "@/features/profile/demo-reset-button";
import { refreshStoredProfile } from "@/features/profile/profile-api";
import { profileImageUrl } from "@/features/profile/profile-image";
import { logoutSession } from "@/lib/api";
import { useEffect, useId, useState, type ReactNode } from "react";

export const Route = createFileRoute("/profil")({
  component: ProfilePage,
});

const accountMenus = [
  { label: "Ganti Password", icon: LockKeyhole, to: "/profil/ganti-password" },
  { label: "Pengguna", icon: Users, to: "/users" },
] as const;

const menuRowClass =
  "flex min-h-13 w-full items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

function ProfileAction({
  to,
  onClick,
  icon: Icon,
  label,
  status,
}: (
  { to: "/sesi-kas"; onClick?: never } | { to?: never; onClick: () => void }
) & {
  icon: LucideIcon;
  label: string;
  status?: ReactNode;
}) {
  const className =
    "flex w-full items-center gap-3 border-t bg-background px-4 py-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";
  const content = (
    <>
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className="flex-1 text-sm font-medium">{label}</span>
      {status && (
        <span className="text-xs text-muted-foreground">{status}</span>
      )}
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground">
        <ArrowRight className="size-3.5" aria-hidden="true" />
      </span>
    </>
  );
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick}>
        {content}
      </button>
    );
  }
  return (
    <Link to={to} className={className}>
      {content}
    </Link>
  );
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
  const shiftActive = cashSession.data?.session?.status === "open";
  const visibleAccountMenus = accountMenus.filter(
    ({ to }) => !isCashier || to !== "/users",
  );
  const navigate = useNavigate();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [chooseBranch, setChooseBranch] = useState(false);
  const [branchId, setBranchId] = useState("");
  const branchInputId = useId();
  const image = profileImageUrl(account?.account_img, account?.account_img_version);
  useEffect(() => {
    void refreshStoredProfile()?.catch(() => undefined);
  }, []);
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
    try {
      await logoutSession();
    } catch {
      toast.error("Gagal mengakhiri sesi di server.");
    }
    await navigate({ to: "/login", search: { redirect: "/" }, replace: true });
  }
  return (
    <PageLayout title="Profil" wide={!isCashier}>
      <div
        className={cn(
          "grid items-start gap-4",
          !isCashier && "md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]",
        )}
      >
        <section
          aria-label="Profil pengguna"
          className="bento-surface col-span-full overflow-hidden"
        >
          <div className="flex items-center gap-3 p-4 sm:p-5">
            <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
              <SkeletonImage
                src={image}
                alt="Foto profil"
                className="size-full"
                fallback={
                  <UserRound
                    className="size-7 text-muted-foreground"
                    aria-label="Foto profil belum tersedia"
                  />
                }
              />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-semibold">
                {account?.account_fullname || account?.account_username}
              </p>
              <p className="mt-1 break-all text-sm text-muted-foreground">
                {account?.account_email || "-"}
              </p>
              {session?.remainingDays !== undefined && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Sesi berlaku {session.remainingDays} hari
                </p>
              )}
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
              status={
                shiftActive ? (
                  <StatusBadge tone="ready">Aktif</StatusBadge>
                ) : (
                  "Belum dibuka"
                )
              }
            />
          )}
        </section>
        <section
          aria-labelledby="profile-account-heading"
          className="bento-surface overflow-hidden"
        >
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
          <section
            aria-labelledby="profile-settings-heading"
            className="bento-surface overflow-hidden md:row-span-2"
          >
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
                  {
                    label: "Riwayat shift",
                    icon: RotateCcwClock,
                    to: "/sesi-kas",
                  },
                ] as const
              )
                .filter(({ to }) => to !== "/sesi-kas" || usesShift)
                .map(({ label, icon: Icon, to }) => (
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
        {(import.meta.env.DEV || import.meta.env.MODE === "staging" || import.meta.env.MODE === "demo") && isAdminMode(session) && (
          <DemoResetButton
            className={cn(
              menuRowClass,
              "bento-surface text-left text-destructive",
            )}
          />
        )}
        <button
          type="button"
          onClick={() => {
            if (!isAdmin && cashSession.data?.session) setConfirmLogout(true);
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
        <DrawerContent aria-describedby={undefined}>
          <DrawerHeader>
            <DrawerTitle>Pilih cabang kasir</DrawerTitle>
          </DrawerHeader>
          <DrawerBody className="space-y-2">
            <label htmlFor={branchInputId} className="font-medium">
              Cabang
            </label>
            <SelectCombobox
              id={branchInputId}
              placeholder="Pilih cabang"
              disabled={!branches.length}
              options={branches.map(({ id, name }) => ({
                value: id,
                label: name,
              }))}
              value={branchId}
              onChange={setBranchId}
            />
            {!branches.length && (
              <p className="text-muted-foreground">
                Belum ada cabang yang tersedia.
              </p>
            )}
          </DrawerBody>
          <DrawerFooter>
            <div className="modal-actions">
              <DrawerClose asChild>
                <Button type="button" variant="outline">
                  Batal
                </Button>
              </DrawerClose>
              <Button
                type="button"
                disabled={!branches.some(({ id }) => id === branchId)}
                onClick={openCashier}
              >
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
          <DialogFooter className="grid-cols-1!">
            <Button
              type="button"
              variant="outline"
              onClick={() => void logout()}
            >
              Keluar tanpa menutup shift
            </Button>
            <Button asChild>
              <Link
                to="/sesi-kas"
                search={{ close: true }}
                onClick={() => setConfirmLogout(false)}
              >
                Tutup buku
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}
