import { useId, useState } from "react";
import { format } from "date-fns";
import { FileText } from "lucide-react";
import type { DateRange } from "react-day-picker";
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
import { ReportDownloadButton } from "@/features/reports/report-download-button";
import { fetchCashSessionExport } from "./cash-session-api";

export function CashSessionExportDrawer() {
  const id = useId();
  const [draft, setDraft] = useState<DateRange>();

  return (
    <Drawer>
      <DrawerTrigger asChild>
        <Button type="button" variant="outline" size="sm" aria-label="Laporan tutup buku">
          <FileText aria-hidden="true" /> Laporan
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Laporan tutup buku</DrawerTitle>
          <DrawerDescription>Laporan mencakup semua cabang yang bisa diakses akun Anda.</DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          <div className="space-y-2">
            <label htmlFor={id} className="text-sm font-medium">Tanggal pembukaan shift</label>
            <DatePickerRange type="modal" id={id} value={draft} onChange={setDraft} />
          </div>
        </DrawerBody>
        <DrawerFooter>
          <ReportDownloadButton
            filename="laporan-tutup-buku.xlsx"
            loadRows={() => fetchCashSessionExport({
              startDate: draft?.from && format(draft.from, "yyyy-MM-dd"),
              endDate: draft?.to && format(draft.to, "yyyy-MM-dd"),
            })}
          />
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
