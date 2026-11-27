import { useState } from "react";
import { ListSortDescending } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerTrigger,
  DrawerBody,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
export function ProductSortDrawer<Sort extends string>({
  options,
  sort,
  defaultSort,
  onSave,
  triggerClassName,
}: {
  options: readonly { value: Sort; label: string }[];
  sort: Sort;
  defaultSort: Sort;
  onSave: (sort: Sort) => void;
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(sort);
  const active = sort !== defaultSort;

  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(sort);
        setOpen(next);
      }}
    >
      <DrawerTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          type="button"
          aria-label={active ? "Urutkan produk, urutan aktif" : "Urutkan produk"}
          title="Urutkan produk"
          className={cn("relative", triggerClassName)}
        >
          <ListSortDescending aria-hidden="true" />
          {active && (
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-ring" />
          )}
        </Button>
      </DrawerTrigger>
      <DrawerContent aria-describedby={undefined}>
        <DrawerHeader>
          <DrawerTitle>Urutkan produk</DrawerTitle>
        </DrawerHeader>
        <DrawerBody>
          <div role="group" aria-label="Pilihan urutan" className="flex flex-wrap gap-2">
            {options.map(({ value, label }) => (
              <Button
                key={value}
                type="button"
                size="sm"
                className="w-fit rounded-full px-3"
                variant={draft === value ? "default" : "outline"}
                aria-pressed={draft === value}
                onClick={() => setDraft(value)}
              >
                {label}
              </Button>
            ))}
          </div>
        </DrawerBody>
        <DrawerFooter>
          <Button
            type="button"
            onClick={() => {
              onSave(draft);
              setOpen(false);
            }}
          >
            Simpan
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
