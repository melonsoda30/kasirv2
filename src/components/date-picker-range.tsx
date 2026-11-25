import { useState } from "react";
import type { CSSProperties } from "react";
import { CalendarDays } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { id as indonesia } from "react-day-picker/locale";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { formatDate, formatDateRange, selectRangeDate } from "@/lib/date";

export interface DatePickerRangeProps {
  id?: string;
  type?: "modal" | "default";
  value: DateRange | undefined;
  onChange: (value: DateRange | undefined) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Control the modal externally. In this mode, id refers to the opener. */
  dialog?: { open: boolean; onOpenChange: (open: boolean) => void };
}

export function DatePickerRange({
  id,
  type = "default",
  value,
  onChange,
  disabled = false,
  placeholder = "Semua tanggal",
  dialog,
}: DatePickerRangeProps) {
  const [internalOpen, setOpen] = useState(false);
  const [pendingRange, setPendingRange] = useState<DateRange>();
  const controlledDialog = type === "modal" ? dialog : undefined;
  const open = controlledDialog?.open ?? internalOpen;
  const draft = pendingRange ?? value;

  function handleOpenChange(next: boolean) {
    setPendingRange(undefined);
    if (controlledDialog) controlledDialog.onOpenChange(next);
    else setOpen(next);
  }

  const trigger = (
    <Button
      id={id}
      type="button"
      variant="outline"
      disabled={disabled}
      className="w-full justify-start font-normal"
    >
      <CalendarDays aria-hidden="true" />
      {value?.from ? formatDateRange(value) : placeholder}
    </Button>
  );

  const picker = (
    <Calendar
      mode="range"
      locale={indonesia}
      captionLayout="dropdown"
      selected={draft}
      defaultMonth={value?.from}
      numberOfMonths={1}
      className="mx-auto"
      style={
        type === "modal"
          ? ({
              "--cell-size": "clamp(2rem, calc((100vw - 5rem) / 7), 3rem)",
            } as CSSProperties)
          : undefined
      }
      onSelect={(_range, date) => {
        // DayPicker may fill both endpoints on the first click; require two selections.
        const next = selectRangeDate(draft, date);
        if (next.from && next.to) {
          onChange(next);
          handleOpenChange(false);
        } else {
          setPendingRange(next);
        }
      }}
    />
  );

  if (type === "modal")
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        {!controlledDialog && <DialogTrigger asChild>{trigger}</DialogTrigger>}
        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          className="max-h-[90dvh] overflow-y-auto sm:max-w-md"
          onCloseAutoFocus={controlledDialog && id ? (event) => {
            event.preventDefault();
            document.getElementById(id)?.focus();
          } : undefined}
        >
          <DialogTitle className="sr-only">Pilih rentang tanggal</DialogTitle>
          <dl
            aria-live="polite"
            className="grid grid-cols-2 gap-4 border-b pb-4"
          >
            <div className="space-y-1">
              <dt className="text-xs text-muted-foreground">Tanggal mulai</dt>
              <dd className="text-sm font-medium">
                {draft?.from ? formatDate(draft.from) : "Pilih tanggal"}
              </dd>
            </div>
            <div className="space-y-1">
              <dt className="text-xs text-muted-foreground">Tanggal selesai</dt>
              <dd className="text-sm font-medium">
                {draft?.to ? formatDate(draft.to) : "Pilih tanggal"}
              </dd>
            </div>
          </dl>
          {picker}
          <Button
            type="button"
            variant="outline"
            disabled={!draft?.from && !value?.from}
            onClick={() => {
              onChange(undefined);
              handleOpenChange(false);
            }}
          >
            Hapus
          </Button>
        </DialogContent>
      </Dialog>
    );

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        aria-label="Pilih rentang tanggal"
        className="w-auto max-w-[calc(100vw-2rem)] overflow-y-auto p-2"
      >
        {picker}
      </PopoverContent>
    </Popover>
  );
}
