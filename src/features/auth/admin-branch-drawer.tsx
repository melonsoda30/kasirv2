import { useId, useState } from "react";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { ChevronDown, Store } from "lucide-react";
import { toast } from "sonner";
import { SelectCombobox } from "@/components/select-combobox";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { getAdminBranch, getAdminBranches, getSuggestedAdminBranch, useAuthStore, type Account, type Branch } from "./auth-store";

export type AdminBranchChangeStatus = "dirty" | "busy" | undefined;

export function AdminBranchSelection({ account }: { account: Account }) {
  const navigate = useNavigate();
  const returnTo = useLocation({ select: (location) => location.href });
  return (
    <AdminBranchDrawer
      account={account}
      onLogout={() => {
        useAuthStore.getState().clearSession();
        void navigate({ to: "/login", search: { redirect: returnTo }, replace: true });
      }}
    />
  );
}

export function AdminBranchSwitcher({ getFormStatus, onApplied }: {
  getFormStatus?: () => AdminBranchChangeStatus;
  onApplied?: () => void;
} = {}) {
  const session = useAuthStore((state) => state.session);
  const active = getAdminBranch(session);
  if (!session || !active) return null;
  return <AdminBranchDrawer account={session.account} active={active} getFormStatus={getFormStatus} onApplied={onApplied} />;
}

function AdminBranchDrawer({ account, active, getFormStatus, onApplied, onLogout }: {
  account: Account;
  active?: Branch;
  getFormStatus?: () => AdminBranchChangeStatus;
  onApplied?: () => void;
  onLogout?: () => void;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(() => active?.id ?? getSuggestedAdminBranch(account)?.id ?? "");
  const [confirming, setConfirming] = useState(false);
  const branches = getAdminBranches(account);
  const selected = branches.find(({ id }) => id === draft);
  const canApply = !!selected && draft !== active?.id;

  function apply() {
    if (!canApply) return;
    const status = getFormStatus?.();
    if (status === "busy") {
      toast.info("Tunggu proses saat ini selesai sebelum mengganti cabang.");
      return;
    }
    if (status === "dirty" && !confirming) {
      setConfirming(true);
      return;
    }
    if (!useAuthStore.getState().setAdminBranch(draft)) {
      toast.error("Cabang tujuan sudah tidak tersedia.");
      return;
    }
    setOpen(false);
    onApplied?.();
  }

  return (
    <Drawer
      open={!active || open}
      dismissible={!!active}
      onOpenChange={(next) => {
        if (!active) return;
        if (next) {
          setDraft(active.id);
          setConfirming(false);
        }
        setOpen(next);
      }}
    >
      {active && (
        <DrawerTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="max-w-full min-w-0" aria-label={`Ganti cabang, cakupan aktif ${active.name}`} disabled={branches.length < 2}>
            <Store aria-hidden="true" />
            <span className="truncate">{active.name}</span>
            <ChevronDown aria-hidden="true" />
          </Button>
        </DrawerTrigger>
      )}
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>{confirming ? "Buang perubahan?" : active ? "Ganti cabang" : "Pilih cabang"}</DrawerTitle>
          {confirming && <DrawerDescription>Perubahan yang belum disimpan akan dibuang saat pindah ke {selected?.name}.</DrawerDescription>}
          {!confirming && active && <DrawerDescription>Cakupan aktif {active.name}</DrawerDescription>}
          {!active && <DrawerDescription>Pilih cabang untuk melanjutkan ke halaman admin.</DrawerDescription>}
        </DrawerHeader>
        {!confirming && (
          <DrawerBody>
            {branches.length > 0 && (
              <div className="space-y-2">
                <label htmlFor={id} className="font-medium">Cabang</label>
                <SelectCombobox
                  id={id}
                  options={branches.map(({ id, name }) => ({ value: id, label: name }))}
                  value={selected?.id ?? ""}
                  onChange={setDraft}
                  placeholder="Pilih cabang"
                />
              </div>
            )}
            {!branches.length && <p role="status" className="text-muted-foreground">Akun ini belum memiliki cabang yang tersedia.</p>}
          </DrawerBody>
        )}
        <DrawerFooter actions>
          {active && !confirming && (
            <DrawerClose asChild><Button type="button" variant="outline">Batal</Button></DrawerClose>
          )}
          {confirming && <Button type="button" variant="outline" onClick={() => setConfirming(false)}>Kembali</Button>}
          {!branches.length && onLogout && <Button type="button" variant="outline" onClick={onLogout}>Keluar</Button>}
          {!!branches.length && (
            <Button type="button" variant={confirming ? "destructive" : "default"} disabled={!canApply} onClick={apply}>
              {confirming && "Buang dan pindah"}
              {!confirming && active && "Terapkan"}
              {!active && "Lanjutkan"}
            </Button>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
