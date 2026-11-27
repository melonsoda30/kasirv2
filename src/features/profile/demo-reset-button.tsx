import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import { RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { resetDemoData } from "./demo-reset-api";

function resetErrorMessage(error: Error) {
  if (isAxiosError<{ msg?: string }>(error)) {
    if (error.response?.status === 404) return "Reset data demo tidak tersedia di server ini.";
    if (!error.response) return "Server belum mengonfirmasi hasil reset. Periksa data sebelum mencoba lagi.";
    return error.response.data?.msg || "Gagal mereset data demo.";
  }
  return error.message;
}

export function DemoResetButton({ className }: { className: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const reset = useMutation({
    mutationFn: resetDemoData,
    meta: { toast: false },
    onSuccess: (applied) => {
      setOpen(false);
      if (!applied) return;
      void queryClient.resetQueries();
      toast.success("Data demo berhasil direset.");
    },
  });

  return (
    <Dialog open={open} onOpenChange={(next) => {
      if (reset.isPending) return;
      if (next) reset.reset();
      setOpen(next);
    }}>
      <DialogTrigger asChild>
        <button type="button" className={className}>
          <RotateCcw className="size-4 shrink-0" aria-hidden="true" />
          <span className="font-medium">Reset Data Demo</span>
        </button>
      </DialogTrigger>
      <DialogContent role="alertdialog" closeDisabled={reset.isPending}>
        <DialogHeader>
          <DialogTitle>Reset data demo?</DialogTitle>
          <DialogDescription>
            Seluruh produk, transaksi, dan riwayat shift akan dihapus. Cabang,
            kategori, dan pengaturan toko akan dikembalikan ke kondisi awal.
            Draft pesanan di perangkat ini juga akan dihapus. Akun tetap
            tersimpan. Perangkat lain harus login ulang.
          </DialogDescription>
        </DialogHeader>
        {reset.isError && (
          <DialogBody>
            <p role="alert" className="text-destructive">{resetErrorMessage(reset.error)}</p>
          </DialogBody>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={reset.isPending} onClick={() => setOpen(false)}>
            Batal
          </Button>
          <Button type="button" variant="destructive" loading={reset.isPending} onClick={() => reset.mutate()}>
            Reset data demo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
