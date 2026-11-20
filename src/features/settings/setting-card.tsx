import { useState, type FormEvent, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";

export function SettingCard({
  title,
  active,
  summary,
  preview,
  onSave,
  children,
  editOnActivate = false,
  editWhenInactive = false,
  saveDisabled = false,
  onClose,
}: {
  title: string;
  active: boolean;
  summary?: string;
  preview?: ReactNode;
  onSave: (active: boolean, values?: FormData) => Promise<void>;
  children?: ReactNode;
  editOnActivate?: boolean;
  editWhenInactive?: boolean;
  saveDisabled?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function persist(nextActive: boolean, values?: FormData) {
    if (pending) return;
    setPending(true);
    try {
      await onSave(nextActive, values);
      setOpen(false);
      onClose?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan pengaturan.");
    } finally {
      setPending(false);
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saveDisabled) return;
    void persist(active || editOnActivate, new FormData(event.currentTarget));
  }

  function changeOpen(nextOpen: boolean) {
    if (pending) return;
    setOpen(nextOpen);
    if (!nextOpen) onClose?.();
  }

  return (
    <Drawer open={open} onOpenChange={changeOpen}>
      <div className={preview ? "overflow-hidden rounded-xl border bg-background" : undefined}>
        <DrawerTrigger asChild>
          <button
            type="button"
            className={`flex w-full cursor-pointer items-center gap-3 bg-background p-4 text-left text-sm hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${preview ? "border-b" : "rounded-xl border"}`}
          >
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">{title}</span>
              {active && summary && <span className="mt-1 block text-muted-foreground">{summary}</span>}
            </span>
            <span
              className={
                active ? "font-medium text-primary" : "text-muted-foreground"
              }
            >
              {active ? "Aktif" : "Nonaktif"}
            </span>
            <ChevronRight
              className="size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
          </button>
        </DrawerTrigger>
        {preview}
      </div>
      <DrawerContent
        aria-describedby={undefined}
        className="pb-[env(safe-area-inset-bottom)]"
      >
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>
        {(active || editOnActivate || editWhenInactive) && children ? (
          <form onSubmit={save} className="min-h-0 overflow-y-auto">
            <fieldset disabled={pending} className="min-w-0 px-4">{open && children}</fieldset>
            <DrawerFooter className="flex-row">
              {(active || editWhenInactive) && <Button
                type="button"
                variant="outline"
                className="flex-1"
                disabled={pending}
                onClick={() => void persist(!active)}
              >
                {active ? "Nonaktifkan" : "Aktifkan"}
              </Button>}
              <Button type="submit" className="flex-1" disabled={pending || saveDisabled}>
                {pending ? "Menyimpan..." : active || editWhenInactive ? "Simpan" : "Aktifkan"}
              </Button>
            </DrawerFooter>
          </form>
        ) : (
          <DrawerFooter>
            <Button type="button" disabled={pending} onClick={() => void persist(!active)}>
              {active ? "Nonaktifkan" : "Aktifkan"}
            </Button>
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );
}


