import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import type { Account } from "@/features/auth/auth-store";
import { request } from "@/lib/api";

const amount = z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number());
const series = z.object({
  label: z.string(),
  data: z.array(amount),
  borderColor: z.string().optional(),
  borderWidth: z.number().positive().optional(),
});
const chart = z.object({ labels: z.array(z.string()), datasets: z.array(series) });

const schemas = {
  total_earning: chart.extend({
    today_earning: amount,
    yesterday_earning: amount,
    grow: z.string(),
  }),
  profit_statistic: chart,
  best_sales: z.array(z.object({
    sales_nip: z.string(),
    sales_foto: z.string().nullish(),
    sales_name: z.string(),
    sales_earning: amount,
  })),
  trending_product: z.object({
    days: z.array(z.string()),
    data: z.array(z.object({
      product_img: z.string().nullish(),
      product_name: z.string(),
      qtyPerDays: z.array(amount),
    })),
  }),
  session_summary: z.object({
    use_session: z.boolean(),
    mode: z.string(),
    date: z.string(),
    sessions: z.array(z.unknown()),
    count: amount,
    open_count: amount,
    total_omzet: amount,
    total_cash_in: amount,
    total_difference: amount,
    exceeded_count: amount,
    cash_tolerance: amount,
  }).or(z.object({ mode: z.literal("none"), use_session: z.literal(false) })),
};

type DashboardAction = keyof typeof schemas;
type DashboardData<A extends DashboardAction> = z.output<(typeof schemas)[A]>;
export type DashboardChartData = z.output<typeof chart>;
export type TrendingProductsData = DashboardData<"trending_product">;
export type BestSalesData = DashboardData<"best_sales">;
export type SessionSummaryData = DashboardData<"session_summary">;

export async function fetchDashboard<A extends DashboardAction>(action: A, signal?: AbortSignal): Promise<DashboardData<A>> {
  const response = await request<{ status?: string; msg?: string; data?: unknown } | unknown[] | null>({
    url: "/admin/dashboard",
    method: "GET",
    params: { action },
    signal,
  });
  let payload: unknown;
  if (action === "best_sales" && Array.isArray(response)) {
    payload = response;
  } else {
    if (!response || Array.isArray(response) || response.status !== "success") {
      throw new Error((!Array.isArray(response) && response?.msg) || "Gagal memuat data dashboard.");
    }
    payload = response.data;
  }

  const parsed = schemas[action].safeParse(payload);
  if (!parsed.success) throw new Error("Format data dashboard dari server tidak valid.");
  return parsed.data as DashboardData<A>;
}

export function useDashboardQuery<A extends DashboardAction>(action: A, account: Account) {
  return useQuery({
    queryKey: ["admin", "dashboard", account.account_id, account.store?.id ?? account.event_id, account.store?.branch_id, account.store?.all_branches, action],
    queryFn: ({ signal }) => fetchDashboard(action, signal),
    meta: { toast: false },
  });
}
