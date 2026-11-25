import { DrawerBody } from "@/components/ui/drawer";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatNominal } from "@/lib/currency";
import { formatDate } from "@/lib/date";
import type { StockRecord } from "./stock-api";
import { isLowStockQuantity } from "./product-stock";

type HistoryEntry = StockRecord["history"][number];

function historyTimestamp(at: string) {
  return at?.trim().replace(/^(\d{4}-\d{2}-\d{2}) /, "$1T") ?? "";
}

function StockHistoryRow({ entry, day }: { entry: HistoryEntry; day: string }) {
  const timestamp = historyTimestamp(entry.at);
  const time = day ? timestamp.slice(day.length + 1) : "";
  const actor = entry.by_name?.trim() || entry.by_username?.trim();
  const tone = entry.delta < 0 ? "warning" : "neutral";

  return (
    <li className="space-y-2 p-3 sm:px-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 space-y-0.5">
          <p className="break-words font-medium">{entry.type === "mutasi" ? "Perbarui stok" : entry.type}</p>
          {(time || actor || (!day && timestamp)) && (
            <div className="flex flex-wrap items-baseline gap-x-2 text-xs text-muted-foreground">
              {time && <time dateTime={timestamp} className="tabular-nums">{time}</time>}
              {!day && timestamp && <span>{timestamp}</span>}
              {actor && <span className="break-words">{actor}</span>}
            </div>
          )}
        </div>
        <StatusBadge tone={entry.delta > 0 ? "success" : tone} className="shrink-0 tabular-nums">
          {entry.delta > 0 && "+"}{formatNominal(entry.delta)}
        </StatusBadge>
      </div>
      <dl className="grid grid-cols-2 gap-3 rounded-lg bg-muted/60 px-3 py-2 tabular-nums">
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Sebelum</dt>
          <dd className="break-words font-medium">{formatNominal(entry.before)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-xs text-muted-foreground">Sesudah</dt>
          <dd className="break-words font-semibold">{formatNominal(entry.after)}</dd>
        </div>
      </dl>
      {entry.note?.trim() && <p className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{entry.note}</p>}
    </li>
  );
}

export function StockHistory({ item }: { item: StockRecord }) {
  const days = new Map<string, HistoryEntry[]>();
  const history = [...item.history].sort((first, second) => historyTimestamp(second.at).localeCompare(historyTimestamp(first.at)));
  for (const entry of history) {
    const timestamp = historyTimestamp(entry.at);
    const day = /^\d{4}-\d{2}-\d{2}(?=T|$)/.exec(timestamp)?.[0] ?? "";
    const key = day && !Number.isNaN(new Date(`${day}T00:00:00`).getTime()) ? day : "";
    const entries = days.get(key);
    if (entries) entries.push(entry);
    else days.set(key, [entry]);
  }

  return (
    <DrawerBody className="flow-panel space-y-4">
      <dl className="bento-surface space-y-1 p-3 sm:p-4">
        <dt className="text-xs text-muted-foreground">Stok saat ini</dt>
        <dd className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="break-words text-2xl font-semibold tracking-tight tabular-nums">{formatNominal(item.quantity)}</span>
            <span className="text-xs text-muted-foreground">unit</span>
          </span>
          {item.quantity <= 0 && <StatusBadge tone="danger">Habis</StatusBadge>}
          {isLowStockQuantity(item.quantity) && <StatusBadge tone="warning">Hampir habis</StatusBadge>}
        </dd>
      </dl>

      {days.size === 0 && (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-muted-foreground">Belum ada histori stok.</p>
      )}
      {[...days].map(([day, entries]) => (
        <section key={day} className="space-y-2">
          <h3 className="px-1 text-xs font-semibold text-muted-foreground">
            {day ? <time dateTime={day}>{formatDate(new Date(`${day}T00:00:00`))}</time> : "Tanggal tidak tersedia"}
          </h3>
          <ul className="bento-surface divide-y">
            {entries.map((entry, index) => (
              <StockHistoryRow key={JSON.stringify([entry.at, entry.by_id, index])} entry={entry} day={day} />
            ))}
          </ul>
        </section>
      ))}
    </DrawerBody>
  );
}
