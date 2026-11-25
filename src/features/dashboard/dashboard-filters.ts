import { addYears, format, parseISO } from "date-fns";
import type { DateRange } from "react-day-picker";
import { z } from "zod";
import type { Account } from "@/features/auth/auth-store";
import type { DashboardPeriodFilter, DashboardReportAction } from "./dashboard-api";

const savedFilter = z.discriminatedUnion("period", [
  z.object({ period: z.enum(["today", "week", "month", "year"]) }),
  z.object({ period: z.literal("range"), startDate: z.iso.date(), endDate: z.iso.date() }),
]);

export function dashboardFilterScope(account: Account) {
  return JSON.stringify([
    account.account_id || account.account_username,
    account.store?.id ?? account.event_id,
    account.store?.branch_id,
    account.store?.all_branches,
  ]);
}

export function dashboardPeriodFilter(period: DashboardPeriodFilter["period"], range: DateRange | undefined): DashboardPeriodFilter | null {
  if (period !== "range") return { period };
  if (!range?.from || !range.to || range.to < range.from || range.to > addYears(range.from, 10)) return null;
  return { period, startDate: format(range.from, "yyyy-MM-dd"), endDate: format(range.to, "yyyy-MM-dd") };
}

function filterStorageKey(account: Account, action: DashboardReportAction) {
  return `kasirv2.dashboard-period:${dashboardFilterScope(account)}:${action}`;
}

export function readDashboardFilter(account: Account, action: DashboardReportAction): {
  period: DashboardPeriodFilter["period"];
  dateRange?: DateRange;
} {
  try {
    let saved = localStorage.getItem(filterStorageKey(account, action));
    if (saved === null && action === "summary") {
      saved = localStorage.getItem(filterStorageKey(account, "total_earning"));
    }
    const parsed = savedFilter.safeParse(JSON.parse(saved ?? "null"));
    if (parsed.success) {
      const { data } = parsed;
      if (data.period !== "range") return { period: data.period };
      const dateRange = { from: parseISO(data.startDate), to: parseISO(data.endDate) };
      if (dashboardPeriodFilter(data.period, dateRange)) return { period: data.period, dateRange };
    }
  } catch {
    // An unavailable or invalid preference uses the default period.
  }
  return { period: "today" };
}

export function saveDashboardFilter(account: Account, action: DashboardReportAction, filter: DashboardPeriodFilter) {
  try {
    localStorage.setItem(filterStorageKey(account, action), JSON.stringify(filter));
  } catch {
    // Keep the preference for the current page if storage is unavailable.
  }
}
