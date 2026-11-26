import { useId, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { format } from "date-fns";
import { ExternalLink, FileText } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { DatePickerRange } from "@/components/date-picker-range";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { fetchSalesHistoryExport, fetchSalesHistoryTable, type ReportDateFilters } from "@/features/reports/report-api";
import { ReportDownloadButton } from "@/features/reports/report-download-button";

export function SalesReportDrawer() {
  const dateId = useId();
  const [dateRange, setDateRange] = useState<DateRange>();
  const dates = {
    startDate: dateRange?.from && format(dateRange.from, "yyyy-MM-dd"),
    endDate: dateRange?.to && format(dateRange.to, "yyyy-MM-dd"),
  };
  const report = useMutation({
    mutationFn: async ({ tab, status, dates }: { tab: Window; status: HTMLParagraphElement; dates: ReportDateFilters }) => {
      const html = await fetchSalesHistoryTable(undefined, dates);
      if (tab.closed) return;

      const frame = status.ownerDocument.createElement("iframe");
      frame.title = "Tabel laporan penjualan";
      frame.setAttribute("sandbox", "");
      frame.referrerPolicy = "no-referrer";
      frame.style.cssText = "position:fixed;inset:0;width:100%;height:100%;border:0;background:white";
      frame.srcdoc = html;
      status.replaceWith(frame);
    },
    onError: (_, { status }) => {
      status.textContent = "Gagal memuat laporan penjualan. Coba buka kembali dari Penjualan.";
      toast.error("Gagal memuat laporan penjualan.");
    },
    gcTime: 0,
    meta: { toast: false },
  });

  function viewReport() {
    const tab = window.open("about:blank", "_blank");
    if (!tab) {
      toast.error("Izinkan pop-up untuk membuka laporan di tab baru.");
      return;
    }
    tab.opener = null;
    const page = tab.document;
    page.title = "Laporan penjualan";
    page.documentElement.lang = "id";
    const viewport = page.createElement("meta");
    viewport.name = "viewport";
    viewport.content = "width=device-width, initial-scale=1";
    page.head.append(viewport);
    const status = page.createElement("p");
    status.setAttribute("role", "status");
    status.textContent = "Memuat laporan penjualan…";
    page.body.replaceChildren(status);
    report.mutate({ tab, status, dates });
  }

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button type="button" variant="outline" size="sm" aria-label="Laporan penjualan">
          <FileText aria-hidden="true" /> Laporan
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Laporan penjualan</DrawerTitle>
          <DrawerDescription>Laporan transaksi selesai mencakup semua cabang yang bisa diakses akun Anda.</DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          <div className="space-y-2">
            <label htmlFor={dateId} className="text-sm font-medium">Tanggal transaksi</label>
            <DatePickerRange type="modal" id={dateId} value={dateRange} onChange={setDateRange} />
          </div>
        </DrawerBody>
        <DrawerFooter actions>
          <ReportDownloadButton filename="laporan-penjualan.xlsx" loadRows={() => fetchSalesHistoryExport(dates)} variant="outline" />
          <Button type="button" loading={report.isPending} onClick={viewReport}>
            <ExternalLink aria-hidden="true" /> Lihat
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
