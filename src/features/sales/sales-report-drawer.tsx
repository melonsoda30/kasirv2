import { useMutation } from "@tanstack/react-query";
import { ExternalLink, FileText } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { fetchSalesHistoryExport, fetchSalesHistoryTable } from "@/features/reports/report-api";
import { ReportDownloadButton } from "@/features/reports/report-download-button";

export function SalesReportDrawer() {
  const report = useMutation({
    mutationFn: async ({ tab, status }: { tab: Window; status: HTMLParagraphElement }) => {
      const html = await fetchSalesHistoryTable();
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
    report.mutate({ tab, status });
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
        <DrawerFooter actions>
          <ReportDownloadButton filename="laporan-penjualan.xlsx" loadRows={fetchSalesHistoryExport} variant="outline" />
          <Button type="button" loading={report.isPending} onClick={viewReport}>
            <ExternalLink aria-hidden="true" /> Lihat
          </Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
