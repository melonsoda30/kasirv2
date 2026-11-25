import { Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { cn } from "cn";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { formatCurrency } from "@/lib/currency";
import type { DashboardChartData } from "./dashboard-api";

const compactCurrency = new Intl.NumberFormat("id-ID", {
  style: "currency", currency: "IDR", notation: "compact", maximumFractionDigits: 1,
});
const colors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const hexColor = /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i;

export function DashboardChart({ chart, description, variant = "bar", stretch = false }: {
  chart: DashboardChartData;
  description: string;
  variant?: "bar" | "line";
  stretch?: boolean;
}) {
  const { labels, datasets } = chart;
  if (!labels.length || !datasets.length) {
    return <p className="text-sm text-muted-foreground">Belum ada data untuk periode ini.</p>;
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
    ...Object.fromEntries(series.map(({ key, data }) => [key, data[index] ?? 0])),
  }));
  const Chart = variant === "line" ? LineChart : BarChart;

  return (
    <ChartContainer config={config} role="group" aria-label={description}
      className={cn("aspect-auto h-48 w-full sm:h-56", stretch && "md:h-auto md:min-h-64 md:flex-1")}>
      <Chart accessibilityLayer data={rows} margin={{ top: 8, right: 20 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="date" axisLine={false} tickLine={false} tickMargin={8} minTickGap={16} interval="preserveStartEnd" />
        <YAxis axisLine={false} tickLine={false} tickMargin={4} width="auto" tickCount={5}
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
        {variant === "bar" && series.map(({ key, label }) => (
          <Bar key={key} dataKey={key} name={label} fill={`var(--color-${key})`} maxBarSize={32} />
        ))}
        {variant === "line" && series.map(({ key, label }) => (
          <Line key={key} dataKey={key} name={label} stroke={`var(--color-${key})`}
            strokeWidth={2} dot={rows.length === 1} />
        ))}
      </Chart>
    </ChartContainer>
  );
}
