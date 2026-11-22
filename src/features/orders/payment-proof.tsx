import { useRef, useState } from "react";
import { Camera, ImagePlus } from "lucide-react";
import { ImagePreview } from "@/components/image-input";
import { Button } from "@/components/ui/button";
import { DrawerClose, DrawerFooter } from "@/components/ui/drawer";
import { MAX_PAYMENT_PROOF_SIZE } from "./payment-details";

export function PaymentProof({
  busy,
  saveError,
  required,
  onFinish,
}: {
  busy: boolean;
  saveError: string;
  required: boolean;
  onFinish: (file?: File) => void;
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
    if (!file.type.startsWith("image/") || file.size > MAX_PAYMENT_PROOF_SIZE) {
      setError("Pilih gambar berukuran maksimal 5 MB.");
      return;
    }

    setReading(true);
    try {
      const preview = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const image = new Image();
      image.src = preview;
      await image.decode();
      setProof({ file, preview });
    } catch {
      setError("Gambar gagal dibaca. Pilih atau ambil foto lain.");
    } finally {
      setReading(false);
    }
  }

  const disabled = busy || reading;
  return (
    <>
      <div className="min-h-0 space-y-4 overflow-y-auto px-4 pb-4">
        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => gallery.current?.click()}
          >
            <ImagePlus aria-hidden="true" /> Galeri
          </Button>
          <Button
            type="button"
            variant="outline"
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
        {reading && <p role="status">Memuat pratinjau…</p>}
        {proof && (
          <div className="overflow-hidden rounded-lg border">
            <ImagePreview
              src={proof.preview}
              label="Pratinjau bukti pembayaran"
            />
          </div>
        )}
        {(error || saveError) && (
          <p role="alert" className="text-destructive">
            {error || saveError}
          </p>
        )}
      </div>
      <DrawerFooter className="shrink-0 border-t">
        <div className="grid grid-cols-2 gap-2">
          <DrawerClose asChild>
            <Button type="button" variant="outline" disabled={busy}>
              Batal
            </Button>
          </DrawerClose>
          <Button
            type="button"
            loading={busy}
            disabled={(required && !proof) || reading}
            onClick={() => onFinish(proof?.file)}
          >
            Selesai
          </Button>
        </div>
      </DrawerFooter>
    </>
  );
}
