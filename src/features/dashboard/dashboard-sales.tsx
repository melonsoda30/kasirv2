import { useId, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Package, UserRound, type LucideIcon } from "lucide-react";
import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";
import { SelectCombobox } from "@/components/select-combobox";
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart";
import { API_BASE_URL } from "@/lib/api";
import { formatCurrency, formatNominal } from "@/lib/currency";
import type { BestSalesData, TrendingProductsData } from "./dashboard-api";

const trendingConfig = {
  qty: { label: "Unit terjual", color: "#1d4ed8" },
} satisfies ChartConfig;

function imageUrl(path?: string | null) {
  if (!path) return "";
  try {
    const url = new URL(path, `${API_BASE_URL.replace(/\/$/, "")}/`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

function Thumbnail({ path, icon: Icon }: { path?: string | null; icon: LucideIcon }) {
  const [failed, setFailed] = useState("");
  const src = imageUrl(path);
  return (
    <div className="grid size-9 shrink-0 place-items-center overflow-hidden rounded-lg bg-muted">
      {src && failed !== src ? (
        <img src={src} alt="" loading="lazy" className="size-full object-cover" onError={() => setFailed(src)} />
      ) : <Icon className="size-4 text-muted-foreground" aria-hidden="true" />}
    </div>
  );
}

export function BestSales({ sales }: { sales: BestSalesData }) {
  if (!sales.length) return <p className="text-sm text-muted-foreground">Belum ada penjualan kasir.</p>;
  const ranked = [...sales].sort((first, second) => second.sales_earning - first.sales_earning).slice(0, 25);

  return (
    <ol className="divide-y">
      {ranked.map((sale, index) => (
        <li key={sale.sales_nip}>
          <Link
            to="/users/$userId"
            params={{ userId: sale.sales_nip }}
            className="flex min-h-14 items-center gap-3 rounded-lg py-2 text-sm hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
          >
            <span className="w-5 shrink-0 text-center text-xs tabular-nums text-muted-foreground">{index + 1}</span>
            <Thumbnail path={sale.sales_foto} icon={UserRound} />
            <span className="min-w-0 flex-1 font-medium">{sale.sales_name}</span>
            <span className="max-w-[45%] text-right font-semibold tabular-nums">{formatCurrency(sale.sales_earning)}</span>
          </Link>
        </li>
      ))}
    </ol>
  );
}

export function TrendingProducts({ trending }: { trending: TrendingProductsData }) {
  const id = useId();
  const [selectedDay, setSelectedDay] = useState("");
  const options = trending.days.map((day) => ({ value: day, label: `Hari ${day}` })).reverse();
  const latestWithSales = options.find((_, index) => {
    const dayIndex = trending.days.length - index - 1;
    return trending.data.some(({ qtyPerDays }) => qtyPerDays[dayIndex] > 0);
  });
  const day = options.some(({ value }) => value === selectedDay) ? selectedDay : (latestWithSales ?? options[0])?.value;
  const dayIndex = day === undefined ? -1 : trending.days.indexOf(day);
  const products = trending.data
    .map(({ product_name: name, product_img: photo, qtyPerDays }) => ({ name, photo, qty: qtyPerDays[dayIndex] ?? 0 }))
    .filter(({ qty }) => qty > 0)
    .sort((first, second) => second.qty - first.qty);

  if (day === undefined) return <p className="text-sm text-muted-foreground">Belum ada data produk harian.</p>;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <label id={`${id}-label`} htmlFor={id} className="shrink-0 text-sm font-medium">Hari penjualan</label>
        <SelectCombobox id={id} aria-labelledby={`${id}-label`} options={options} value={day} onChange={setSelectedDay}
          searchable={false} className="w-32" />
      </div>
      {products.length ? (
        <ChartContainer config={trendingConfig} role="group" aria-label={`Grafik produk terlaris hari ${day}`}
          className="aspect-auto w-full" style={{ height: Math.max(64, products.length * 36 + 8) }}>
          <BarChart accessibilityLayer data={products} layout="vertical" margin={{ right: 44 }}>
            <XAxis type="number" hide />
            <YAxis dataKey="name" type="category" width={104} interval={0} axisLine={false} tickLine={false} tickMargin={6}
              tickFormatter={(name: string) => name.length > 15 ? `${name.slice(0, 14)}…` : name} />
            <ChartTooltip cursor={false} content={<ChartTooltipContent hideLabel
              formatter={(value, _name, item) => {
                const product = item.payload as (typeof products)[number];
                return (
                  <div className="flex items-center gap-2">
                    <Thumbnail path={product.photo} icon={Package} />
                    <div className="min-w-0">
                      <p className="font-medium">{product.name}</p>
                      <p className="text-muted-foreground">{formatNominal(Number(value))} unit</p>
                    </div>
                  </div>
                );
              }}
            />} />
            <Bar dataKey="qty" fill="var(--color-qty)" radius={4} maxBarSize={20}>
              <LabelList dataKey="qty" position="right" offset={6} className="fill-foreground text-xs"
                formatter={(value) => formatNominal(Number(value))} />
            </Bar>
          </BarChart>
        </ChartContainer>
      ) : <p className="text-sm text-muted-foreground">Belum ada produk terjual pada hari yang dipilih.</p>}
    </div>
  );
}
