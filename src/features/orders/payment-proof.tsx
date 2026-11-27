import { useRef } from "react";
import { Camera, CircleAlert, ImagePlus, Maximize, TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { ImagePreview } from "@/components/image-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { DrawerClose, DrawerBody, DrawerFooter } from "@/components/ui/drawer";
import type { Sale } from "@/features/sales/sales-summary";
import { usePaymentProof } from "./use-payment-proof";

export function PaymentProofField({
  busy,
  selection,
  savedProof,
  saveError,
}: {
  busy: boolean;
  selection: ReturnType<typeof usePaymentProof>;
  savedProof?: Sale["paymentProof"];
  saveError?: string;
}) {
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const { proof, reading, error, select } = selection;
  const preview = proof?.preview ?? (savedProof?.type === "image" ? savedProof.url : undefined);
  const disabled = busy || reading;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={disabled}
          onClick={() => gallery.current?.click()}
        >
          <ImagePlus aria-hidden="true" /> Galeri
        </Button>
        <Button
          type="button"
          variant="outline"
          size="lg"
          disabled={disabled}
          onClick={() => camera.current?.click()}
        >
          <Camera aria-hidden="true" /> Kamera
        </Button>
        <input
          hidden
          ref={gallery}
          type="file"
          accept="image/*"
          aria-label="Pilih foto dari galeri"
          onChange={(event) => {
            void select(event.currentTarget.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
        <input
          hidden
          ref={camera}
          type="file"
          accept="image/*"
          capture="environment"
          aria-label="Ambil foto dari kamera"
          onChange={(event) => {
            void select(event.currentTarget.files?.[0]);
            event.currentTarget.value = "";
          }}
        />
      </div>
      {reading && (
        <SkeletonGroup label="Memuat pratinjau bukti pembayaran">
          <Skeleton className="h-52 w-full rounded-lg sm:h-64" />
        </SkeletonGroup>
      )}
      {!reading && preview && (
        <figure className="overflow-hidden rounded-lg border">
          <Dialog>
            <div className="relative">
              <ImagePreview
                src={preview}
                label="Pratinjau bukti pembayaran"
              />
              <DialogTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="absolute top-3 right-3" disabled={disabled}>
                  <Maximize aria-hidden="true" /> Lihat pratinjau
                </Button>
              </DialogTrigger>
            </div>
            <DialogContent wide className="sm:max-w-2xl" aria-describedby={undefined}>
              <DialogHeader>
                <DialogTitle>Pratinjau bukti pembayaran</DialogTitle>
              </DialogHeader>
              <DialogBody>
                <img
                  src={preview}
                  alt="Bukti pembayaran"
                  className="mx-auto block h-auto max-h-[65dvh] max-w-full rounded-lg object-contain"
                />
              </DialogBody>
            </DialogContent>
          </Dialog>
          {proof && (
            <figcaption className="flex items-start gap-2 border-t bg-warning px-3 py-2 text-sm text-warning-foreground">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 fill-warning-indicator text-status-icon-foreground" aria-hidden="true" />
              Periksa bukti pembayaran sebelum menyimpan.
            </figcaption>
          )}
        </figure>
      )}
      {!reading && !preview && savedProof && (
        <a href={savedProof.url} target="_blank" rel="noopener noreferrer" className="block text-link underline">
          {savedProof.name ?? "Buka bukti pembayaran"}
        </a>
      )}
      {(error || saveError) && (
        <p role="alert" className="flex items-start gap-2 text-destructive">
          <CircleAlert className="mt-0.5 size-4 shrink-0 fill-destructive-indicator text-status-icon-foreground" aria-hidden="true" />
          {error || saveError}
        </p>
      )}
    </div>
  );
}

export function PaymentProof({ busy, saveError, required, onFinish }: {
  busy: boolean;
  saveError: string;
  required: boolean;
  onFinish: (file?: File, preview?: string) => void;
}) {
  const selection = usePaymentProof();
  const { proof, reading } = selection;
  return (
    <>
      <DrawerBody className={cn("space-y-4", required && "payment-step-body")}>
        <PaymentProofField busy={busy} selection={selection} saveError={saveError} />
      </DrawerBody>
      <DrawerFooter>
        <div className="modal-actions">
          <DrawerClose asChild>
            <Button type="button" variant="outline" disabled={busy}>
              Batal
            </Button>
          </DrawerClose>
          <Button
            type="button"
            loading={busy}
            disabled={(required && !proof) || reading}
            onClick={() => onFinish(proof?.file, proof?.preview)}
          >
            Selesai
          </Button>
        </div>
      </DrawerFooter>
    </>
  );
}
