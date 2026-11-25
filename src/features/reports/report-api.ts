import { z } from "zod";
import { isEmptyListResponse, request } from "@/lib/api";

const endpoint = "/download.php";
const reportRow = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));
const reportResponse = z.object({
  status: z.literal("success"),
  data: z.array(reportRow),
});
const reportError = z.object({ msg: z.string().trim().min(1) });

export type ReportRow = z.output<typeof reportRow>;

async function fetchReportRows(params: Record<string, string>, fallback: string) {
  const response = await request<unknown>({ url: endpoint, method: "GET", params });
  if (isEmptyListResponse(response)) return [];

  const parsed = reportResponse.safeParse(response);
  if (!parsed.success) throw new Error(reportError.safeParse(response).data?.msg || fallback);
  return parsed.data.data;
}

export function fetchSalesHistoryExport() {
  return fetchReportRows({ action: "export_history" }, "Gagal mengunduh laporan penjualan.");
}

export function fetchCashSessionExport({ startDate, endDate }: { startDate?: string; endDate?: string } = {}) {
  return fetchReportRows({
    action: "export_session",
    ...(startDate && { startDate }),
    ...(endDate && { endDate }),
  }, "Gagal mengunduh laporan shift.");
}

export async function fetchSalesHistoryTable(signal?: AbortSignal) {
  const html = await request<unknown>({
    url: endpoint,
    method: "GET",
    params: { action: "table_history" },
    headers: { Accept: "text/html" },
    responseType: "text",
    signal,
  });
  if (typeof html !== "string" || !html.trimStart().startsWith("<")) {
    throw new Error("Laporan penjualan tidak tersedia.");
  }
  return html;
}
