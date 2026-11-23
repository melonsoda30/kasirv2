import { useEffect } from "react";
import { useBlocker, type ShouldBlockFn } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useAuthStore } from "@/features/auth/auth-store";

const shouldBlockPaymentNavigation: ShouldBlockFn = ({ current, next }) =>
  !!useAuthStore.getState().session &&
  current.routeId === "/payment/$orderId" &&
  (next.routeId !== "/payment/$orderId" ||
    next.params.orderId !== current.params.orderId);

export function PaymentLeaveDialog({ busy, pending }: { busy: boolean; pending: boolean }) {
  const blocker = useBlocker({
    shouldBlockFn: shouldBlockPaymentNavigation,
    withResolver: true,
    enableBeforeUnload: true,
  });
  const reset = blocker.reset;
  const destination = pending ? "Antrean" : "Order";

  useEffect(() => {
    // Cancel a pending navigation if checkout is removed, for example after payment succeeds.
    return () => reset?.();
  }, [reset]);

  return (
    <Dialog
      open={blocker.status === "blocked"}
      onOpenChange={(open) => {
        if (!open) reset?.();
      }}
    >
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            {busy
              ? "Pembayaran sedang diproses"
              : "Tinggalkan halaman pembayaran?"}
          </DialogTitle>
          <DialogDescription>
            {busy
              ? "Tunggu sampai status pembayaran tersedia."
              : `Pesanan tetap ada di ${destination} dan bisa dibayar nanti.`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row">
          <Button type="button" variant="outline" onClick={reset}>
            {busy ? "Kembali ke pembayaran" : "Lanjut bayar"}
          </Button>
          {!busy && (
            <Button
              type="button"
              variant="destructive"
              onClick={blocker.proceed}
            >
              Tinggalkan
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
