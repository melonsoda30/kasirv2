import { useId, useState } from "react";
import { Pencil, SquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  NestedDrawer,
} from "@/components/ui/drawer";
import { Textarea } from "@/components/ui/textarea";
import { useOrderStore, type OrderDraft } from "./order-store";

export function OrderNoteField({
  order,
  disabled,
  nested,
}: {
  order: OrderDraft;
  disabled?: boolean;
  nested?: boolean;
}) {
  const setOrderNote = useOrderStore((state) => state.setOrderNote);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const formId = useId();
  const note = order.note?.trim() ?? "";
  const NoteDrawer = nested ? NestedDrawer : Drawer;

  return (
    <NoteDrawer
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(note);
        setOpen(next);
      }}
    >
      {note ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">Catatan pesanan</p>
          <DrawerTrigger asChild>
            <Button
              type="button"
              variant="outline"
              disabled={disabled}
              aria-label="Edit catatan pesanan"
              className="w-full items-start justify-between px-3 text-left font-normal"
            >
              <span className="min-w-0 whitespace-pre-wrap break-words">
                {note}
              </span>
              <Pencil className="shrink-0" aria-hidden="true" />
            </Button>
          </DrawerTrigger>
        </div>
      ) : (
        <DrawerTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={disabled}
          >
            <SquareText aria-hidden="true" /> Tambah catatan
          </Button>
        </DrawerTrigger>
      )}
      <DrawerContent
        aria-describedby={undefined}
      >
        <DrawerHeader>
          <DrawerTitle>{note ? "Edit catatan" : "Tambah catatan"}</DrawerTitle>
        </DrawerHeader>
        <form
          id={formId}
          className="modal-body"
          onSubmit={(event) => {
            event.preventDefault();
            setOrderNote(order.id, draft.trim());
            setOpen(false);
          }}
        >
          <label className="grid gap-2 text-sm font-medium">
            Catatan pesanan
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.currentTarget.value)}
              rows={3}
            />
          </label>
        </form>
        <DrawerFooter>
          {note && (
            <Button type="button" variant="outline" className="text-destructive" onClick={() => {
              setOrderNote(order.id, '')
              setOpen(false)
            }}>
              Hapus catatan
            </Button>
          )}
          <div className="modal-actions">
            <DrawerClose asChild>
              <Button type="button" variant="outline">
                Batal
              </Button>
            </DrawerClose>
            <Button type="submit" form={formId}>
              Simpan
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </NoteDrawer>
  );
}
