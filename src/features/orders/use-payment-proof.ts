import { useRef, useState } from "react";
import Compressor from "compressorjs";
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

export function usePaymentProof() {
  const operation = useRef(0);
  const [proof, setProof] = useState<{ file: File; preview: string } | null>(null);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState("");

  function reset() {
    operation.current += 1;
    setProof(null);
    setReading(false);
    setError("");
  }

  async function select(file?: File) {
    if (!file) return;
    const current = ++operation.current;
    setProof(null);
    setError("");
    if (!file.type.startsWith("image/")) {
      setReading(false);
      setError("Pilih file gambar.");
      return;
    }

    setReading(true);
    try {
      const compressed = await compressProof(file);
      if (operation.current !== current) return;
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
      if (operation.current === current) setProof({ file: compressed, preview });
    } catch {
      if (operation.current === current) setError("Gambar gagal diproses. Pilih atau ambil foto lain.");
    } finally {
      if (operation.current === current) setReading(false);
    }
  }

  return { proof, reading, error, select, reset };
}
