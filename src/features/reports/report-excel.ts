import type { SheetData } from "write-excel-file/universal";
import type { ReportRow } from "./report-api";

const numericColumns = new Set([
  "qty", "Subtotal", "Payment Fee", "Biaya Tambahan", "Discount", "Cash Amount",
  "Kembalian", "Total Penerimaan", "Modal Awal", "Cash Masuk", "Harapan (Sistem)",
  "Fisik", "Selisih", "Omzet", "Nominal Serah Terima",
]);

function cellValue(column: string, value: ReportRow[string]) {
  if (typeof value !== "string" || !numericColumns.has(column)) return value;
  const text = value.trim();
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(text) || text.replace(/\D/g, "").length > 15) return value;
  return Number(text);
}

export async function createReportWorkbook(rows: ReportRow[]) {
  const { default: writeExcelFile } = await import("write-excel-file/universal");
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const sheet: SheetData = [
    columns.map((value) => ({ value, fontWeight: "bold" })),
    ...rows.map((row) => columns.map((column) => {
      const value = Object.hasOwn(row, column) ? cellValue(column, row[column]) : null;
      return value === null ? null : { value };
    })),
  ];
  return writeExcelFile(sheet, {
    sheet: "Laporan",
    stickyRowsCount: 1,
    columns: columns.map((column) => ({ width: Math.min(36, Math.max(16, column.length + 4)) })),
  }).toBlob();
}

export async function downloadReportExcel(filename: string, rows: ReportRow[]) {
  const url = URL.createObjectURL(await createReportWorkbook(rows));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
