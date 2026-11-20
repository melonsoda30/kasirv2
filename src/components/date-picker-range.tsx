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
}

export function DatePickerRange({
  id,
  type = "default",
  value,
  onChange,
  disabled = false,
  placeholder = "Semua tanggal",
}: DatePickerRangeProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  function handleOpenChange(next: boolean) {
    if (next) setDraft(value);
    setOpen(next);
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
        setDraft(next);
        if (next.from && next.to) {
          onChange(next);
          setOpen(false);
        }
      }}
    />
  );

  if (type === "modal")
    return (
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogTrigger asChild>{trigger}</DialogTrigger>
        <DialogContent
          showCloseButton={false}
          aria-describedby={undefined}
          className="max-h-[90dvh] overflow-y-auto sm:max-w-md"
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
              setDraft(undefined);
              onChange(undefined);
              setOpen(false);
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
