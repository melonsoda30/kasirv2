import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { cn } from "cn";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatCurrency } from "@/lib/currency";
import type { DashboardChartData } from "./dashboard-api";

const compactCurrency = new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", notation: "compact", maximumFractionDigits: 1,
});
const colors = ["#003994", "#047857", "#b45309"];
const hexColor = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;

export function DashboardLineChart({ chart, description, stretch = false }: {
  chart: DashboardChartData;
  description: string;
  stretch?: boolean;
}) {
  const { labels, datasets } = chart;
  if (!labels.length || !datasets.some(({ data }) => data.length)) {
    return <p className="text-sm text-muted-foreground">Belum ada data harian.</p>;
  }

  const series = datasets.map((dataset, index) => ({
    ...dataset,
    key: `series-${index}`,
    label: dataset.label.trim(),
    color: dataset.borderColor && hexColor.test(dataset.borderColor)
      ? dataset.borderColor
      : colors[index % colors.length],
  }));
  const config: ChartConfig = Object.fromEntries(series.map(({ key, label, color }) => [key, { label, color }]));
  const rows = labels.map((date, index) => ({
    date,
    ...Object.fromEntries(series.map(({ key, data }) => [key, data[index]])),
  }));

  return (
    <ChartContainer config={config} role="group" aria-label={description}
      className={cn("aspect-auto h-48 w-full sm:h-56", stretch && "md:h-auto md:min-h-64 md:flex-1")}>
      <LineChart accessibilityLayer data={rows} margin={{ top: 8, right: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" axisLine={false} tickLine={false} tickMargin={8} minTickGap={16} interval="preserveStartEnd" />
        <YAxis axisLine={false} tickLine={false} tickMargin={4} width="auto" tickCount={5} tickFormatter={(value: number) => compactCurrency.format(value)} />
        <ChartTooltip content={<ChartTooltipContent
          formatter={(value, name) => (
            <div className="flex flex-1 items-center justify-between gap-4">
              <span className="text-muted-foreground">{name}</span>
              <span className="font-medium tabular-nums">{formatCurrency(Number(value))}</span>
            </div>
          )}
        />} />
        {series.map(({ key, label, borderWidth }) => (
          <Line key={key} dataKey={key} name={label} type="linear" stroke={`var(--color-${key})`}
            strokeWidth={Math.max(2, Math.min(4, borderWidth ?? 2))} dot={labels.length <= 12} />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
