import { useState } from "react";
import { UserRoundCheck, UserRoundX } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { useChangeUser, userDisplayName, type UserRecord } from "./users-api";

export function UserStatusDialog({ user }: { user: UserRecord }) {
  const [open, setOpen] = useState(false);
  const change = useChangeUser();
  const deactivating = user.user_status === "active";
  const label = deactivating ? "Nonaktifkan" : "Aktifkan";
  const StatusIcon = deactivating ? UserRoundX : UserRoundCheck;
  const name = userDisplayName(user);

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (change.isPending) return;
      if (next) change.reset();
      setOpen(next);
    }}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="icon" aria-label={`${label} pengguna`} title={`${label} pengguna`}>
          <StatusIcon aria-hidden="true" />
        </Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{label} pengguna?</DialogTitle>
          <DialogDescription>
            {deactivating ? `${name} akan kehilangan akses login.` : `Akun ${name} akan diaktifkan kembali.`}
          </DialogDescription>
        </DialogHeader>
        {change.error && <p role="alert" className="text-sm text-destructive">{change.error.message}</p>}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={change.isPending} onClick={() => setOpen(false)}>Batal</Button>
          <Button type="button" variant={deactivating ? "destructive" : "default"} loading={change.isPending}
            onClick={() => {
              if (change.isPending) return;
              change.mutate({
                action: "status_user", userId: user.user_id, status: deactivating ? "noactive" : "active",
              }, { onSuccess: () => setOpen(false) });
            }}>
            {label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
