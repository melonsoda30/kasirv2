import { useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { z } from "zod";
import { getBranchFilterId, type Account } from "@/features/auth/auth-store";
import { isEmptyListResponse, request } from "@/lib/api";

const amount = z.union([z.number(), z.string().trim().min(1)]).pipe(z.coerce.number());
const series = z.object({
  label: z.string(),
  data: z.array(amount),
  backgroundColor: z.string().optional(),
  borderColor: z.string().optional(),
  borderWidth: z.number().positive().optional(),
});
const chart = z.object({ labels: z.array(z.string()), datasets: z.array(series) });
const periodValue = z.enum(["today", "week", "month", "year", "range"]);
const granularity = z.enum(["day", "month"]);
const periodMetadata = {
  period: periodValue,
  granularity,
  start_date: z.iso.date(),
  end_date: z.iso.date(),
};
const sessionSummary = z.object({
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
}).or(z.object({ mode: z.literal("none"), use_session: z.literal(false) }));

const metric = z.object({ value: amount, previous: amount, grow: z.string() });
const identifier = z.union([z.string(), z.number()]).transform(String);
const list = <T extends z.ZodType>(row: T) => z.object({ data: z.array(row) });
const summary = z.object({
  period: z.object({
    period: periodValue,
    start_date: z.iso.date(),
    end_date: z.iso.date(),
    previous_start_date: z.iso.date(),
    previous_end_date: z.iso.date(),
  }),
  kpi: z.object({ revenue: metric, trx_count: metric, items_sold: metric, aov: metric }).optional(),
  revenue: chart.extend({
    chart_start_date: z.iso.date(),
    chart_end_date: z.iso.date(),
    chart_granularity: granularity,
  }).optional(),
  top_product: list(z.object({
    product_id: identifier,
    product_name: z.string(),
    product_img: z.string().nullish(),
    branch_id: identifier.nullish(),
    branch_name: z.string().trim().nullish(),
    qty: amount,
    revenue: amount,
  })).optional(),
  top_kasir: list(z.object({
    user_id: identifier,
    name: z.string(),
    foto: z.string().nullish(),
    revenue: amount,
  })).optional(),
  top_branch: list(z.object({
    branch_id: identifier,
    branch_name: z.string(),
    revenue: amount,
    share: amount,
  })).optional(),
  payment_mix: list(z.object({
    method: z.string(),
    trx_count: amount,
    revenue: amount,
    fee_total: amount,
  })).optional(),
  peak_hour: list(z.object({
    hour: amount.pipe(z.number().int().min(0).max(23)),
    trx_count: amount,
    revenue: amount,
  })).optional(),
  category_mix: list(z.object({ category: z.string(), qty: amount, revenue: amount })).optional(),
  session_summary: sessionSummary.optional(),
  meta: z.object({
    available: z.array(z.string()),
    hidden: z.array(z.object({ key: z.string(), reason: z.string() })),
  }),
});

const schemas = {
  summary,
  total_earning: chart.extend({
    ...periodMetadata,
    previous_start_date: z.iso.date(),
    previous_end_date: z.iso.date(),
    current_earning: amount,
    previous_earning: amount,
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
    ...periodMetadata,
    data: z.array(z.object({
      product_img: z.string().nullish(),
      product_name: z.string(),
      qty: amount,
    })),
  }),
  session_summary: sessionSummary,
};

type DashboardAction = keyof typeof schemas;
export type DashboardReportAction = Exclude<DashboardAction, "session_summary">;
export type DashboardData<A extends DashboardAction> = z.output<(typeof schemas)[A]>;
export type DashboardPeriodFilter =
  | { period: "today" | "week" | "month" | "year" }
  | { period: "range"; startDate: string; endDate: string };
export type DashboardChartData = z.output<typeof chart>;
export type DashboardSummaryData = DashboardData<"summary">;
export type SessionSummaryData = DashboardData<"session_summary">;

const defaultPeriod: DashboardPeriodFilter = { period: "today" };

export async function fetchDashboard<A extends DashboardAction>(
  action: A,
  signal?: AbortSignal,
  filter = defaultPeriod,
  branchId?: string,
): Promise<DashboardData<A> | null> {
  const filterId = getBranchFilterId(branchId);
  const response = await request<{ status?: string; msg?: string; data?: unknown } | unknown[] | null>({
    url: "/admin/dashboard.php",
    method: "GET",
    params: {
      action,
      ...(action !== "session_summary" && filter),
      ...(filterId && { branch_id: filterId }),
    },
    signal,
  });
  let payload: unknown;
  if (isEmptyListResponse(response)) {
    if (action !== "best_sales") return null;
    payload = [];
  } else if (action === "best_sales" && Array.isArray(response)) {
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

export function useDashboardQuery<A extends DashboardAction>(
  action: A,
  account: Account,
  filter: DashboardPeriodFilter | null = defaultPeriod,
  branchId?: string,
) {
  const period = action === "session_summary" ? undefined : filter;
  return useQuery({
    queryKey: ["admin", "dashboard", account.account_id, account.store?.id ?? account.event_id, account.store?.branch_id, account.store?.all_branches, branchId, action, period],
    queryFn: ({ signal }) => fetchDashboard(action, signal, period ?? undefined, branchId),
    enabled: period !== null,
    retry: (failureCount, error) => failureCount < 1 && !(isAxiosError(error) && error.response?.status === 400),
    meta: { toast: false },
  });
}
