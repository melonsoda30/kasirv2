import { useRef, useState } from "react";
import Compressor from "compressorjs";
import { Camera, CircleAlert, ImagePlus, Maximize, TriangleAlert } from "lucide-react";
import { cn } from "cn";
import { ImagePreview } from "@/components/image-input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton, SkeletonGroup } from "@/components/ui/skeleton";
import { DrawerClose, DrawerBody, DrawerFooter } from "@/components/ui/drawer";
import { MAX_PAYMENT_PROOF_SIZE } from "./payment-details";

const compressionSteps = [
  { maxSize: 1600, quality: 0.82 },
  { maxSize: 1440, quality: 0.72 },
  { maxSize: 1200, quality: 0.68 },
  { maxSize: 1000, quality: 0.62 },
  { maxSize: 800, quality: 0.58 },
  { maxSize: 600, quality: 0.5 },
  { maxSize: 400, quality: 0.48 },
  { maxSize: 256, quality: 0.42 },
];

async function compressProof(file: File) {
  if (file.size < MAX_PAYMENT_PROOF_SIZE) return file;

  for (const { maxSize, quality } of compressionSteps) {
    const result = await new Promise<Blob>((resolve, reject) => {
      new Compressor(file, {
        strict: false,
        mimeType: "image/jpeg",
        maxWidth: maxSize,
        maxHeight: maxSize,
        quality,
        success: resolve,
        error: reject,
      });
    });
    if (result.size > 0 && result.size < MAX_PAYMENT_PROOF_SIZE && result.type === "image/jpeg") {
      const name = file.name.replace(/\.[^.]+$/, "") || "bukti-pembayaran";
      return new File([result], `${name}.jpg`, { type: result.type });
    }
  }
}

export function PaymentProof({
  busy,
  saveError,
  required,
  onFinish,
}: {
  busy: boolean;
  saveError: string;
  required: boolean;
  onFinish: (file?: File, preview?: string) => void;
}) {
  const gallery = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [proof, setProof] = useState<{ file: File; preview: string } | null>(
    null,
  );
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");

  async function select(file?: File) {
    if (!file) return;
    setProof(null);
    setError("");
    if (!file.type.startsWith("image/")) {
      setError("Pilih file gambar.");
      return;
    }

    setReading(true);
    try {
      const compressed = await compressProof(file);
      if (!compressed) {
        setError("Gambar tidak dapat diperkecil hingga di bawah 100 KB. Pilih atau ambil foto lain.");
        return;
      }
      const preview = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(compressed);
      });
      const image = new Image();
      image.src = preview;
      await image.decode();
      setProof({ file: compressed, preview });
    } catch {
      setError("Gambar gagal diproses. Pilih atau ambil foto lain.");
    } finally {
      setReading(false);
    }
  }

  const disabled = busy || reading;
  return (
    <>
      <DrawerBody className={cn("space-y-4", required && "payment-step-body")}>
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
        {proof && (
          <figure className="overflow-hidden rounded-lg border">
            <Dialog>
              <div className="relative">
                <ImagePreview
                  src={proof.preview}
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
                    src={proof.preview}
                    alt="Bukti pembayaran yang dipilih"
                    className="mx-auto block h-auto max-h-[65dvh] max-w-full rounded-lg object-contain"
                  />
                </DialogBody>
              </DialogContent>
            </Dialog>
            <figcaption className="flex items-start gap-2 border-t bg-warning px-3 py-2 text-sm text-warning-foreground">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 fill-warning-indicator text-status-icon-foreground" aria-hidden="true" />
              Periksa bukti pembayaran sebelum menyimpan.
            </figcaption>
          </figure>
        )}
        {(error || saveError) && (
          <p role="alert" className="flex items-start gap-2 text-destructive">
            <CircleAlert className="mt-0.5 size-4 shrink-0 fill-destructive-indicator text-status-icon-foreground" aria-hidden="true" />
            {error || saveError}
          </p>
        )}
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
