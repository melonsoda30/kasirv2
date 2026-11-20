import { useId, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { ImageInput, ImagePreview, type UploadStatus } from "@/components/image-input";
import { SelectCombobox } from "@/components/select-combobox";
import { Input } from "@/components/ui/input";
import { SettingCard } from "@/features/settings/setting-card";
import { StoreSettingsPage, type SaveStoreSettings } from "@/features/settings/store-settings-page";
import { paymentImageUrl, type StoreSettings } from "@/features/settings/store-settings-query";
import { formatCurrency } from "@/lib/currency";

export const Route = createFileRoute("/settings_/pembayaran")({
  component: PaymentSettingsPage,
});

type PaymentMethod = StoreSettings["payment"][number];
type PaymentFee = StoreSettings["fee"][number];

function formatFee(fee: PaymentFee) {
  return fee.fee_type === "percent" ? `${fee.fee.toLocaleString("id-ID")}%` : formatCurrency(fee.fee);
}

function PaymentSettingsPage() {
  return (
    <StoreSettingsPage title="Pembayaran & Biaya">
      {({ payment, fee }, update) => {
        if (!payment.length) {
          return <p className="text-sm text-muted-foreground">Belum ada metode pembayaran.</p>;
        }
        const feesByCode = new Map(fee.map((item) => [item.code, item]));

        return (
          <div className="space-y-3">
            {payment.map((method) => (
              <PaymentMethodCard
                key={method.code}
                method={method}
                linkedFee={method.fee_code ? feesByCode.get(method.fee_code) : undefined}
                update={update}
              />
            ))}
          </div>
        );
      }}
    </StoreSettingsPage>
  );
}

function PaymentMethodCard({ method, linkedFee, update }: {
  method: PaymentMethod;
  linkedFee?: PaymentFee;
  update: SaveStoreSettings;
}) {
  const hasQris = Boolean(method.image) || [method.code, method.title, method.type].some((value) => /qris/i.test(value));
  const feeSummary = linkedFee
    ? `Biaya ${linkedFee.title} (${formatFee(linkedFee)})${linkedFee.is_active === false ? " · Nonaktif" : ""}`
    : method.fee_code ? "Biaya tertaut tidak ditemukan" : undefined;

  const [image, setImage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadStatus>({ busy: false, error: "" });
  const [imageVersion, setImageVersion] = useState(0);
  const imageSource = paymentImageUrl(method.image);
  const imageUrl = imageSource ? new URL(imageSource) : null;
  if (imageVersion) imageUrl?.searchParams.set("v", String(imageVersion));
  const savedImage = imageUrl?.href ?? "";

  return (
    <SettingCard
      title={method.title}
      active={method.is_active}
      preview={savedImage ? <ImagePreview key={savedImage} src={savedImage} label="Gambar QRIS" /> : undefined}
      editWhenInactive={hasQris || !!linkedFee}
      saveDisabled={status.busy || Boolean(status.error)}
      onClose={() => {
        setImage("");
        setFile(null);
        setStatus({ busy: false, error: "" });
      }}
      summary={feeSummary}
      onSave={async (active, values) => {
        const upload = values && file ? { file, paymentCode: method.code } : undefined;
        const feeInput = values?.get("fee");
        const amount = typeof feeInput === "string" ? Number(feeInput) : undefined;
        const feeActive = values?.get("fee_status") === "true";
        if (amount !== undefined && (!Number.isFinite(amount) || amount < 0 || feeInput === "")) {
          throw new Error("Masukkan nilai biaya yang valid.");
        }
        await update((current) => {
          const currentMethod = current.payment.find(({ code }) => code === method.code);
          if (!currentMethod) throw new Error("Metode pembayaran sudah tidak tersedia.");

          const currentFee = current.fee.find(({ code }) => code === currentMethod.fee_code);
          if (amount !== undefined && (!currentFee || currentFee.code !== linkedFee?.code)) {
            throw new Error("Biaya tertaut berubah. Buka ulang pengaturan metode pembayaran.");
          }

          return {
            payment: current.payment.map((entry) => entry.code === currentMethod.code
              ? { ...entry, is_active: active }
              : entry),
            fee: current.fee.map((entry) => amount !== undefined && entry.code === currentFee?.code
              ? { ...entry, is_active: feeActive, fee: amount }
              : { ...entry, is_active: entry.is_active ?? true }),
          };
        }, upload);
        if (upload) setImageVersion(Date.now());
      }}
    >
      {(hasQris || linkedFee) && <div className="space-y-4">
        {linkedFee && (
          <>
            <FeeStatusCombobox initialValue={String(linkedFee.is_active ?? true)} />
            <label className="grid gap-2 text-sm">
              {linkedFee.fee_type === "percent" ? "Biaya (%)" : "Nominal biaya"}
              <Input name="fee" type="number" min={0} step="any" defaultValue={linkedFee.fee} required />
            </label>
          </>
        )}
        {hasQris && (
          <ImageInput
            id={`payment-image-${method.code}`}
            label="Gambar QRIS"
            value={image || savedImage}
            onChange={setImage}
            onFileChange={setFile}
            onStatusChange={setStatus}
            removable={file !== null}
            removeLabel="Batalkan pilihan"
          />
        )}
      </div>}
    </SettingCard>
  );
}

const feeStatusOptions = [
  { value: "true", label: "Aktif" },
  { value: "false", label: "Nonaktif" },
];

function FeeStatusCombobox({ initialValue }: { initialValue: string }) {
  const id = useId();
  const [value, setValue] = useState(initialValue);

  return (
    <div className="grid gap-2 text-sm">
      <label id={`${id}-label`} htmlFor={id}>Status biaya</label>
      <SelectCombobox id={id} aria-labelledby={`${id}-label`} options={feeStatusOptions}
        value={value} onChange={setValue} searchable={false} />
      <input type="hidden" name="fee_status" value={value} />
    </div>
  );
}
