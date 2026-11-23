import { useRef, useState, type FormEvent } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import type { Branch } from "@/features/auth/auth-store";
import { useSaveBranch } from "./stores-api";

type BranchEditor =
  | { type: "add" }
  | { type: "edit"; branch: Branch }
  | { type: "delete"; branch: Branch };

export function StoreBranches({ storeId, branches }: { storeId: string; branches: Branch[] }) {
  const [editor, setEditor] = useState<BranchEditor | null>(null);
  const [validationError, setValidationError] = useState("");
  const addButton = useRef<HTMLButtonElement>(null);
  const actionButton = useRef<HTMLButtonElement>(null);
  const save = useSaveBranch(storeId);
  const editingBranch = editor?.type === "edit" ? editor.branch : null;
  const deletingBranch = editor?.type === "delete" ? editor.branch : null;
  const savingBranch = editor?.type === "add" || editor?.type === "edit";

  function openEditor(next: BranchEditor, trigger: HTMLButtonElement) {
    actionButton.current = trigger;
    save.reset();
    setValidationError("");
    setEditor(next);
  }

  function closeEditor() {
    if (!save.isPending) setEditor(null);
  }

  function restoreFocus(event: Event) {
    event.preventDefault();
    const trigger = actionButton.current;
    (trigger?.isConnected ? trigger : addButton.current)?.focus();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!savingBranch || save.isPending) return;

    const fields = new FormData(event.currentTarget);
    const name = String(fields.get("name") ?? "").trim();
    if (!name) {
      setValidationError("Isi nama cabang.");
      return;
    }

    setValidationError("");
    save.mutate(editingBranch
      ? { action: "edit_branch", branchId: editingBranch.id, name }
      : { action: "add_branch", name },
    { onSuccess: () => setEditor(null) });
  }

  return (
    <section className="mt-5" aria-labelledby="store-branches-heading">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 id="store-branches-heading" className="px-1 text-sm font-semibold text-muted-foreground">Cabang</h2>
        <Button ref={addButton} type="button" onClick={(event) => openEditor({ type: "add" }, event.currentTarget)}>
          <Plus aria-hidden="true" /> Tambah cabang
        </Button>
      </div>
      {branches.length ? (
        <ul className="bento-surface divide-y overflow-hidden">
          {branches.map((branch) => (
            <li key={branch.id} className="flex items-center gap-2 px-4 py-3">
              <p className="min-w-0 flex-1 text-sm font-medium">{branch.name}</p>
              <Button type="button" variant="outline" size="icon" className="shrink-0"
                aria-label={`Edit cabang ${branch.name}`}
                onClick={(event) => openEditor({ type: "edit", branch }, event.currentTarget)}>
                <Pencil aria-hidden="true" />
              </Button>
              <Button type="button" variant="ghost" size="icon" className="shrink-0 text-destructive hover:text-destructive"
                aria-label={`Hapus cabang ${branch.name}`}
                onClick={(event) => openEditor({ type: "delete", branch }, event.currentTarget)}>
                <Trash2 aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="bento-surface p-4 text-sm text-muted-foreground">Belum ada cabang.</p>
      )}

      <Drawer open={savingBranch} dismissible={!save.isPending} onOpenChange={(open) => { if (!open) closeEditor(); }}>
        <DrawerContent onCloseAutoFocus={restoreFocus} className="product-drawer pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
          <DrawerHeader className="shrink-0">
            <DrawerTitle>{editingBranch ? "Edit cabang" : "Tambah cabang"}</DrawerTitle>
            <DrawerDescription className="sr-only">Form pengelolaan cabang toko.</DrawerDescription>
          </DrawerHeader>
          <form key={editingBranch?.id ?? "new"} id="store-branch-form" onSubmit={submit} className="min-h-0 overflow-y-auto px-4 pb-4">
            <fieldset disabled={save.isPending} className="min-w-0 space-y-2">
              <label htmlFor="store-branch-name" className="block text-sm font-medium">Nama cabang</label>
              <Input id="store-branch-name" name="name" defaultValue={editingBranch?.name} required
                aria-invalid={!!validationError} onChange={() => setValidationError("")} />
            </fieldset>
            {(validationError || save.error) && (
              <p role="alert" className="mt-4 text-sm text-destructive">{validationError || save.error?.message}</p>
            )}
          </form>
          <DrawerFooter className="grid shrink-0 grid-cols-2 border-t">
            <Button type="button" variant="outline" disabled={save.isPending} onClick={closeEditor}>Batal</Button>
            <Button type="submit" form="store-branch-form" loading={save.isPending}>Simpan</Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      <Dialog open={!!deletingBranch} onOpenChange={(open) => { if (!open) closeEditor(); }}>
        <DialogContent showCloseButton={false} onCloseAutoFocus={restoreFocus}>
          <DialogHeader>
            <DialogTitle>Hapus cabang?</DialogTitle>
            <DialogDescription>Cabang {deletingBranch?.name} akan dihapus.</DialogDescription>
          </DialogHeader>
          {save.error && <p role="alert" className="text-sm text-destructive">{save.error.message}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={save.isPending} onClick={closeEditor}>Batal</Button>
            <Button type="button" variant="destructive" loading={save.isPending} onClick={() => {
              if (!deletingBranch || save.isPending) return;
              save.mutate({ action: "delete_branch", branchId: deletingBranch.id }, { onSuccess: () => setEditor(null) });
            }}>Hapus cabang</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
