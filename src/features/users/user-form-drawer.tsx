import { useState, type ReactElement } from "react";
import {
  Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle, DrawerTrigger,
} from "@/components/ui/drawer";
import { UserForm } from "./user-form";
import { useChangeUser, type UserRecord } from "./users-api";

export function UserFormDrawer({ user, children }: { user: UserRecord; children: ReactElement }) {
  const [open, setOpen] = useState(false);
  const change = useChangeUser();

  function close() {
    change.reset();
    setOpen(false);
  }

  return (
    <Drawer open={open} dismissible={!change.isPending} onOpenChange={(next) => {
      if (change.isPending) return;
      if (next) setOpen(true);
      else close();
    }}>
      <DrawerTrigger asChild>{children}</DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Edit pengguna</DrawerTitle>
          <DrawerDescription className="sr-only">Form data pengguna.</DrawerDescription>
        </DrawerHeader>
        {open && <UserForm user={user} change={change} close={close} />}
      </DrawerContent>
    </Drawer>
  );
}
