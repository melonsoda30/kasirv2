import { useId, useRef, useState, type FormEvent } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { ImageInput, type UploadStatus } from "@/components/image-input";
import { SelectCombobox } from "@/components/select-combobox";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle, DrawerTrigger } from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import type { SaveStoreSettings } from "./store-settings-page";
import type { StoreSettings } from "./store-settings-query";

const paymentTypes = [
  { value: "cash", label: "Tunai" },
  { value: "qris", label: "QRIS" },
  { value: "edc", label: "Kartu / EDC" },
  { value: "transfer", label: "Transfer" },
];

const feeTypes = [
  { value: "percent", label: "Percent (%)" },
  { value: "fixed", label: "Fixed (Rp)" },
];

export function AddPaymentMethod({ payment, update }: {
  payment: StoreSettings["payment"];
  update: SaveStoreSettings;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const draftCodes = useRef({ suffix: "", cash: "cash" });
  const [name, setName] = useState("");
  const [type, setType] = useState("");
  const [feeType, setFeeType] = useState("percent");
  const [fee, setFee] = useState("");
  const [image, setImage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [upload, setUpload] = useState<UploadStatus>({ busy: false, error: "" });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const title = name.trim();
  const hasFee = type !== "" && type !== "cash";

  function changeOpen(next: boolean) {
    if (pending) return;
    if (next) {
      const suffix = Array.from(crypto.getRandomValues(new Uint32Array(2)), (value) => value.toString(36)).join("_");
      const hasCash = payment.some(({ code }) => code.toLowerCase() === "cash");
      draftCodes.current = { suffix, cash: hasCash ? `cash_${suffix}` : "cash" };
      setName("");
      setType("");
      setFeeType("percent");
      setFee("");
      setImage("");
      setFile(null);
      setUpload({ busy: false, error: "" });
      setError("");
    }
    setOpen(next);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || (type === "qris" && (upload.busy || upload.error))) return;
    if (!title || !paymentTypes.some(({ value }) => value === type)) {
      setError("Isi nama dan pilih jenis metode pembayaran.");
      return;
    }
    const amount = Number(fee);
    if (hasFee && (!fee.trim() || !Number.isFinite(amount) || amount < 0 || !feeTypes.some(({ value }) => value === feeType))) {
      setError("Pilih jenis biaya dan isi nilai biaya yang valid.");
      return;
    }

    const { cash, suffix } = draftCodes.current;
    const code = type === "cash" ? cash : `${type}_${suffix}`;
    const feeCode = hasFee ? `${title.toLowerCase().replace(/\s+/g, "_")}_${type}` : "";
    const qrisUpload = type === "qris" && file ? { file, paymentCode: code } : undefined;
    setError("");
    setPending(true);
    try {
      await update((current) => {
        if (current.payment.some((entry) => entry.code.toLowerCase() === code)) {
          throw new Error("Metode ini sudah tersedia. Buka ulang form sebelum menambah metode lain.");
        }
        const feeCodeUsed = current.fee.some(({ code }) => code.toLowerCase() === feeCode)
          || current.payment.some(({ fee_code }) => fee_code?.toLowerCase() === feeCode);
        if (feeCode && feeCodeUsed) {
          throw new Error("Nama ini sudah dipakai untuk jenis metode tersebut. Gunakan nama lain.");
        }
        return {
          payment: [...current.payment, { code, title, type, fee_code: feeCode || null, is_active: true }],
          ...(feeCode && {
            fee: [...current.fee, {
              code: feeCode,
              title,
              type,
              fee: amount,
              fee_type: feeType === "fixed" ? "flat" : "percent",
              is_active: true,
            }],
          }),
        };
      }, qrisUpload);
      toast.success("Metode pembayaran ditambahkan.");
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal menambah metode pembayaran.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Drawer open={open} dismissible={!pending} onOpenChange={changeOpen}>
      <DrawerTrigger asChild>
        <Button type="button" size="icon" className="size-9" aria-label="Tambah metode pembayaran" title="Tambah metode pembayaran">
          <Plus aria-hidden="true" />
        </Button>
      </DrawerTrigger>
      <DrawerContent>
        <DrawerHeader>
          <DrawerTitle>Tambah metode pembayaran</DrawerTitle>
          <DrawerDescription>Metode ini akan tersedia untuk kasir.</DrawerDescription>
        </DrawerHeader>
        {open && (
          <form id={id} onSubmit={submit} className="drawer-body space-y-4">
            <fieldset disabled={pending} className="min-w-0 space-y-4">
              <label className="grid gap-2 text-sm">
                Nama metode
                <Input name="title" value={name} onChange={(event) => setName(event.target.value)} required />
              </label>
              <div className="grid gap-2 text-sm">
                <label htmlFor={`${id}-type`}>Jenis metode</label>
                <SelectCombobox id={`${id}-type`} options={paymentTypes} value={type} onChange={setType}
                  placeholder="Pilih jenis metode" searchable={false} disabled={pending} />
              </div>
              {hasFee && (
                <>
                  <div className="grid gap-2 text-sm">
                    <label htmlFor={`${id}-fee-type`}>Jenis biaya</label>
                    <SelectCombobox id={`${id}-fee-type`} options={feeTypes} value={feeType} onChange={setFeeType}
                      searchable={false} disabled={pending} />
                  </div>
                  <label className="grid gap-2 text-sm">
                    Nilai biaya
                    <Input name="fee" type="number" min={0} step="any" value={fee}
                      onChange={(event) => setFee(event.target.value)} required />
                  </label>
                </>
              )}
              {type === "qris" && (
                <ImageInput id={`${id}-qris`} label="Gambar QRIS" value={image}
                  onChange={setImage} onFileChange={setFile} onStatusChange={setUpload} />
              )}
            </fieldset>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </form>
        )}
        <DrawerFooter className="grid grid-cols-2">
          <Button type="button" variant="outline" disabled={pending} onClick={() => changeOpen(false)}>Batal</Button>
          <Button type="submit" form={id} loading={pending} disabled={type === "qris" && (upload.busy || !!upload.error)}>Simpan</Button>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}
