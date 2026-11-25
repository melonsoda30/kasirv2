import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { cn } from "cn";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatCurrency } from "@/lib/currency";
import type { DashboardChartData } from "./dashboard-api";

const compactCurrency = new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", notation: "compact", maximumFractionDigits: 1,
});
const colors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function DashboardChart({ chart, description, compact = false }: {
  chart: DashboardChartData;
  description: string;
  compact?: boolean;
}) {
  const { labels, datasets } = chart;
  if (!labels.length || !datasets.length) {
    return <p className="text-sm text-muted-foreground">Belum ada data untuk periode ini.</p>;
  }

  const series = datasets.map((dataset, index) => ({
    ...dataset,
    key: `series-${index}`,
    label: dataset.label.trim(),
    color: colors[(index + (compact ? 1 : 0)) % colors.length],
  }));
  const config: ChartConfig = Object.fromEntries(series.map(({ key, label, color }) => [key, { label, color }]));
  const rows = labels.map((date, index) => ({
    date,
    ...Object.fromEntries(series.map(({ key, data }) => [key, data[index] ?? 0])),
  }));
  return (
    <ChartContainer config={config} role="group" aria-label={description}
      className={cn("aspect-auto w-full", compact ? "h-28 sm:h-36" : "h-48 sm:h-60")}>
      <BarChart accessibilityLayer data={rows} margin={{ top: 8, right: compact ? 4 : 16, left: 0 }}>
        {!compact && <CartesianGrid vertical={false} />}
        <XAxis dataKey="date" axisLine={false} tickLine={false} tickMargin={8} minTickGap={16}
          interval={compact ? 2 : "preserveStartEnd"}
          tickFormatter={compact ? (hour: string) => hour.slice(0, 2) : undefined} />
        <YAxis hide={compact} axisLine={false} tickLine={false} tickMargin={4} width="auto" tickCount={5}
          tickFormatter={(value: number) => compactCurrency.format(value)} />
        <ChartTooltip content={<ChartTooltipContent
          formatter={(value, name, item) => (
            <div className="flex flex-1 items-center justify-between gap-4">
              <span className="flex items-center gap-2 text-muted-foreground">
                <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} aria-hidden="true" />
                {name}
              </span>
              <span className="font-medium tabular-nums">{formatCurrency(Number(value))}</span>
            </div>
          )}
        />} />
        {series.map(({ key, label }) => (
          <Bar key={key} dataKey={key} name={label} fill={`var(--color-${key})`}
            minPointSize={2} maxBarSize={compact ? 22 : 32} radius={[3, 3, 0, 0]} />
        ))}
      </BarChart>
    </ChartContainer>
  );
}
