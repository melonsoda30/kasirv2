import type { DateRange } from "react-day-picker";

const dateFormatter = new Intl.DateTimeFormat("id-ID", {
  day: "numeric",
  month: "short",
  year: "numeric",
});

export function formatDate(date: Date): string {
  return dateFormatter.format(date);
}

/** Start a new range, then complete it on the second date selection. */
export function selectRangeDate(
  range: DateRange | undefined,
  date: Date,
): DateRange {
  if (!range?.from || range.to) return { from: date, to: undefined };
  return date < range.from
    ? { from: date, to: range.from }
    : { from: range.from, to: date };
}

/** Calendar days use the browser's local date, without UTC date conversion. */
export function formatDateRange(range: DateRange | undefined): string {
  if (!range?.from) return "Semua tanggal";
  const start = dateFormatter.format(range.from);
  if (!range.to) return `${start} - Pilih tanggal selesai`;
  if (range.from.toDateString() === range.to.toDateString()) return start;
  return `${start} - ${dateFormatter.format(range.to)}`;
}
