import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import { PageLayout } from "../components/page-layout";
import {
  ArrowRight,
  ChevronRight,
  LockKeyhole,
  ListOrdered,
  LogOut,
  Pencil,
  Clock,
  CreditCard,
  Percent,
  Store,
  UserRound,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { isAdminAccount, isCashierEventLevel, useAuthStore } from "@/features/auth/auth-store";
import { useCashSession } from "@/features/cash-session/cash-session-query";
import { API_BASE_URL } from "@/lib/api";
import { useState } from "react";

export const Route = createFileRoute("/profil")({
  component: ProfilePage,
});

const accountMenus = [
  { label: "Ganti Password", icon: LockKeyhole, to: "/profil/ganti-password" },
  { label: "Antrean pesanan", icon: ListOrdered, to: "/cart" },
  { label: "Users", icon: Users, to: "/users" },
] as const;

const menuRowClass = "flex min-h-13 w-full items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring";

function ProfilePage() {
  const account = useAuthStore((state) => state.session?.account);
  const isCashier = isCashierEventLevel(account?.event_level);
  const isAdmin = isAdminAccount(account);
  const cashSession = useCashSession(isCashier || isAdmin);
  const visibleAccountMenus = accountMenus.filter(({ to }) => to === "/cart" ? isAdmin : !isCashier || to !== "/users");
  const navigate = useNavigate();
  const [imageFailed, setImageFailed] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const image = account?.account_img
    ? new URL(account.account_img, `${API_BASE_URL.replace(/\/$/, "")}/`).href
    : "";
  async function logout() {
    useAuthStore.getState().clearSession();
    await navigate({ to: "/login", search: { redirect: "/" }, replace: true });
  }
  return (
    <PageLayout title="Profil">
      <section
        aria-label="Profil pengguna"
        className="overflow-hidden rounded-xl border bg-background"
      >
        <div className="flex items-center gap-3 p-4">
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
            <Link to="/profil/edit"><Pencil aria-hidden="true" /></Link>
          </Button>
        </div>
        {!isCashier && (
          <Link
            to="/order"
            className="flex w-full items-center gap-3 border-t bg-primary/5 px-4 py-3 text-left transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <Store className="size-4 shrink-0" aria-hidden="true" />
            <span className="flex-1 text-sm font-medium">Buka Kasir</span>
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </span>
          </Link>
        )}
      </section>
      {cashSession.data?.use_session && (
        <Link to="/sesi-kas" className={cn(menuRowClass, "mt-4 rounded-xl border bg-background")}>
          <Clock className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1 font-medium">Shift</span>
          <span className="text-xs text-muted-foreground">{cashSession.data.session ? 'Aktif' : 'Belum dibuka'}</span>
          <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        </Link>
      )}
      <section aria-labelledby="profile-account-heading" className="mt-4">
        <h2
          id="profile-account-heading"
          className="mb-2 px-1 text-sm font-semibold text-muted-foreground"
        >
          {isCashier ? "Akun" : "Akun & Pengguna"}
        </h2>
        <ul className="divide-y overflow-hidden rounded-xl border bg-background">
          {visibleAccountMenus.map(({ label, icon: Icon, to }) => (
            <li key={to}>
              <Link to={to} className={menuRowClass}>
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="flex-1 font-medium">{label}</span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </section>
      {!isCashier && (
        <section aria-labelledby="profile-settings-heading" className="mt-4">
          <h2
            id="profile-settings-heading"
            className="mb-2 px-1 text-sm font-semibold text-muted-foreground"
          >
            Pengaturan Toko
          </h2>
          <ul className="divide-y overflow-hidden rounded-xl border bg-background">
            {([
              { label: "Toko", icon: Store, to: "/store" },
              { label: "Pembayaran & Biaya", icon: CreditCard, to: "/settings/pembayaran" },
              { label: "PPN", icon: Percent, to: "/settings/ppn" },
              { label: "Shift", icon: Clock, to: "/settings/shift" },
            ] as const).map(({ label, icon: Icon, to }) => (
              <li key={to}>
                <Link to={to} className={menuRowClass}>
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  <span className="flex-1 font-medium">{label}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <button
        type="button"
        onClick={() => { if (cashSession.data?.session) setConfirmLogout(true); else void logout(); }}
        className={cn(menuRowClass, "mt-4 rounded-xl border bg-background text-left text-destructive")}
      >
        <LogOut className="size-4 shrink-0" aria-hidden="true" />
        <span className="font-medium">Logout</span>
      </button>
      <Dialog open={confirmLogout} onOpenChange={setConfirmLogout}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Shift masih aktif</DialogTitle>
            <DialogDescription>Tutup buku jika Anda selesai bekerja. Jika keluar sekarang, shift tetap aktif saat Anda keluar.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Button asChild><Link to="/sesi-kas" search={{ close: true }} onClick={() => setConfirmLogout(false)}>Tutup buku</Link></Button>
            <Button type="button" variant="outline" onClick={() => void logout()}>Keluar tanpa menutup shift</Button>
          </div>
        </DialogContent>
      </Dialog>
    </PageLayout>
  );
}




