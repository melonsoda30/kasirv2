import { useMutation } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import type { ReportRow } from "./report-api";
import { downloadReportExcel } from "./report-excel";

export function ReportDownloadButton({ filename, loadRows, variant }: {
  filename: string;
  loadRows: () => Promise<ReportRow[]>;
  variant?: "default" | "outline";
}) {
  const download = useMutation({
    mutationFn: async () => {
      const rows = await loadRows();
      if (!rows.length) {
        toast.info("Belum ada data laporan.");
        return;
      }
      await downloadReportExcel(filename, rows);
    },
    onError: (error) => {
      const message = isAxiosError<{ msg?: string }>(error)
        ? error.response?.data?.msg || "Gagal mengunduh laporan. Silakan coba lagi."
        : error.message;
      toast.error(message);
    },
    gcTime: 0,
    meta: { toast: false },
  });

  return (
    <Button type="button" variant={variant} loading={download.isPending} onClick={() => download.mutate()}>
      <Download aria-hidden="true" /> Unduh Excel
    </Button>
  );
}
