import { useId, useState, type FormEvent, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { cn } from "cn";
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
  actions,
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
  actions?: ReactNode;
  onSave: (active: boolean, values?: FormData) => Promise<void>;
  children?: ReactNode;
  editOnActivate?: boolean;
  editWhenInactive?: boolean;
  saveDisabled?: boolean;
  onClose?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const formId = useId();
  const [pendingAction, setPendingAction] = useState<"toggle" | "save" | null>(null);
  const pending = pendingAction !== null;
  const showEditor = (active || editOnActivate || editWhenInactive) && !!children;
  const saveLabel = active || editWhenInactive ? "Simpan" : "Aktifkan";

  async function persist(nextActive: boolean, values?: FormData) {
    if (pending) return;
    setPendingAction(values ? "save" : "toggle");
    try {
      await onSave(nextActive, values);
      setOpen(false);
      onClose?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menyimpan pengaturan.");
    } finally {
      setPendingAction(null);
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
      <div className={cn((preview || actions) && "bento-surface overflow-hidden")}>
        <div className={cn(actions && "flex items-center", preview && "border-b")}>
          <DrawerTrigger asChild>
            <button
              type="button"
              className={cn(
                "flex w-full min-w-0 cursor-pointer items-center gap-3 p-4 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                !preview && !actions && "bento-surface",
              )}
            >
              <span className="min-w-0 flex-1">
                <span className="block break-words font-semibold">{title}</span>
                {active && summary && <span className="mt-1 block text-muted-foreground">{summary}</span>}
              </span>
              <span className={cn(active ? "font-medium text-accent-foreground" : "text-muted-foreground")}>
                {active ? "Aktif" : "Nonaktif"}
              </span>
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
          </DrawerTrigger>
          {actions && <div className="shrink-0 pr-3">{actions}</div>}
        </div>
        {preview}
      </div>
      <DrawerContent aria-describedby={undefined}>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>
        {showEditor && (
          <>
            <form id={formId} onSubmit={save} className="modal-body">
              <fieldset disabled={pending} className="min-w-0">{open && children}</fieldset>
            </form>
            <DrawerFooter actions>
              {(active || editWhenInactive) && <Button
                type="button"
                variant="outline"
                disabled={pending}
                loading={pendingAction === "toggle"}
                onClick={() => void persist(!active)}
              >
                {active ? "Nonaktifkan" : "Aktifkan"}
              </Button>}
              <Button type="submit" form={formId} disabled={pending || saveDisabled} loading={pendingAction === "save"}>
                {saveLabel}
              </Button>
            </DrawerFooter>
          </>
        )}
        {!showEditor && (
          <DrawerFooter>
            <Button type="button" loading={pending} onClick={() => void persist(!active)}>
              {active ? "Nonaktifkan" : "Aktifkan"}
            </Button>
          </DrawerFooter>
        )}
      </DrawerContent>
    </Drawer>
  );
}


