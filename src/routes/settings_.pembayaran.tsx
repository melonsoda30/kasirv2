import { useId, useRef, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  ImageInput,
  ImagePreview,
  type UploadStatus,
} from "@/components/image-input";
import { SelectCombobox } from "@/components/select-combobox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { AddPaymentMethod } from "@/features/settings/add-payment-method";
import { PaymentFeeBearerField } from "@/features/settings/payment-fee-bearer-field";
import { SettingCard } from "@/features/settings/setting-card";
import {
  StoreSettingsPage,
  type SaveStoreSettings,
} from "@/features/settings/store-settings-page";
import {
  isPaymentFeeBearer,
  paymentImageUrl,
  type StoreSettings,
} from "@/features/settings/store-settings-query";
import { formatCurrency } from "@/lib/currency";

export const Route = createFileRoute("/settings_/pembayaran")({
  component: PaymentSettingsPage,
});

type PaymentMethod = StoreSettings["payment"][number];

function formatFee(method: PaymentMethod) {
  return method.fee_type === "percent"
    ? `${method.fee.toLocaleString("id-ID")}%`
    : formatCurrency(method.fee);
}

function PaymentSettingsPage() {
  return (
    <StoreSettingsPage
      title="Pembayaran & Biaya"
      compactHeader
      allowEmptySettings
      headerAction={({ payment }, update) => (
        <AddPaymentMethod payment={payment} update={update} />
      )}
    >
      {({ payment }, update) => (
        <PaymentMethodList payment={payment} update={update} />
      )}
    </StoreSettingsPage>
  );
}

function PaymentMethodList({
  payment,
  update,
}: {
  payment: PaymentMethod[];
  update: SaveStoreSettings;
}) {
  const [deleting, setDeleting] = useState<PaymentMethod | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const deleteTrigger = useRef<HTMLButtonElement | null>(null);
  const section = useRef<HTMLElement>(null);

  async function remove() {
    if (!deleting || pending) return;
    setPending(true);
    setError("");
    try {
      await update((current) => {
        const payment = current.payment.filter(
          ({ code }) => code !== deleting.code,
        );
        return payment.length === current.payment.length ? {} : { payment };
      });
      setDeleting(null);
      toast.success("Metode pembayaran dihapus.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Gagal menghapus metode pembayaran.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      ref={section}
      tabIndex={-1}
      aria-labelledby="payment-settings-title"
      className="space-y-3"
    >
      <h2 id="payment-settings-title" className="font-semibold">
        Metode pembayaran
      </h2>
      {!payment.length && (
        <p className="bento-surface p-4 text-sm text-muted-foreground">
          Belum ada metode pembayaran.
        </p>
      )}
      {payment.map((method) => (
        <PaymentMethodCard
          key={method.code}
          method={method}
          update={update}
          onDelete={(button) => {
            deleteTrigger.current = button;
            setError("");
            setDeleting(method);
          }}
        />
      ))}
      <Dialog
        open={!!deleting}
        onOpenChange={(open) => {
          if (!open && !pending) setDeleting(null);
        }}
      >
        <DialogContent
          role="alertdialog"
          closeDisabled={pending}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            const target = deleteTrigger.current?.isConnected
              ? deleteTrigger.current
              : section.current;
            target?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Hapus metode pembayaran?</DialogTitle>
            <DialogDescription>
              {deleting &&
                `${deleting.title} akan dihapus dari pengaturan pembayaran.`}
              {deleting?.code.toLowerCase() === "cash" &&
                " Kasir tetap menyediakan Tunai bawaan."}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <DialogBody>
              <p role="alert" className="text-destructive">{error}</p>
            </DialogBody>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={() => setDeleting(null)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="destructive"
              loading={pending}
              onClick={() => void remove()}
            >
              Hapus metode
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function PaymentMethodCard({
  method,
  update,
  onDelete,
}: {
  method: PaymentMethod;
  update: SaveStoreSettings;
  onDelete: (button: HTMLButtonElement) => void;
}) {
  const isCash = ["cash", "tunai"].includes(method.type.trim().toLowerCase());
  const hasQris =
    Boolean(method.image) ||
    [method.code, method.title, method.type].some((value) =>
      /qris/i.test(value),
    );
  const showFeeFields = !isCash || method.fee_active || method.fee > 0;
  const feeStatus = method.fee_active ? "" : ", nonaktif";
  const feeSummary = showFeeFields ? `Biaya ${formatFee(method)}${feeStatus}` : undefined;

  const [image, setImage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<UploadStatus>({
    busy: false,
    error: "",
  });
  const [imageVersion, setImageVersion] = useState(0);
  const imageSource = paymentImageUrl(method.image);
  const imageUrl = imageSource ? new URL(imageSource) : null;
  if (imageVersion) imageUrl?.searchParams.set("v", String(imageVersion));
  const savedImage = imageUrl?.href ?? "";

  return (
    <SettingCard
      title={method.title}
      active={method.is_active}
      preview={
        savedImage ? (
          <ImagePreview key={savedImage} src={savedImage} label="Gambar QRIS" />
        ) : undefined
      }
      actions={
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-destructive hover:text-destructive"
          aria-label={`Hapus ${method.title}`}
          onClick={(event) => onDelete(event.currentTarget)}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      }
      editWhenInactive
      saveDisabled={status.busy || Boolean(status.error)}
      onClose={() => {
        setImage("");
        setFile(null);
        setStatus({ busy: false, error: "" });
      }}
      summary={feeSummary}
      onSave={async (active, values) => {
        const title = values
          ? String(values.get("title") ?? "").trim()
          : undefined;
        if (title === "")
          throw new Error("Nama metode pembayaran wajib diisi.");
        const upload =
          values && file ? { file, paymentCode: method.code } : undefined;
        const feeChanges: Partial<Pick<PaymentMethod, "fee" | "fee_active" | "fee_bearer">> = {};
        if (values && showFeeFields) {
          const feeInput = values.get("fee");
          const amount = Number(feeInput);
          if (typeof feeInput !== "string" || !feeInput.trim() || !Number.isFinite(amount) || amount < 0) {
            throw new Error("Masukkan nilai biaya yang valid.");
          }
          const feeBearer = values.get("fee_bearer");
          if (!isCash && !isPaymentFeeBearer(feeBearer)) {
            throw new Error("Pilih penanggung biaya.");
          }
          const feeActive = values.get("fee_status") === "true";
          if (amount !== method.fee) feeChanges.fee = amount;
          if (feeActive !== method.fee_active) feeChanges.fee_active = feeActive;
          if (isPaymentFeeBearer(feeBearer) && feeBearer !== method.fee_bearer) {
            feeChanges.fee_bearer = feeBearer;
          }
        }
        await update((current) => {
          const currentMethod = current.payment.find(
            ({ code }) => code === method.code,
          );
          if (!currentMethod)
            throw new Error("Metode pembayaran sudah tidak tersedia.");

          return {
            payment: current.payment.map((entry) =>
              entry.code === currentMethod.code
                ? {
                    ...entry,
                    title: title ?? entry.title,
                    is_active: active,
                    ...feeChanges,
                  }
                : entry,
            ),
          };
        }, upload);
        if (upload) setImageVersion(Date.now());
      }}
    >
      <div className="space-y-4">
        <label className="grid gap-2 text-sm">
          Nama metode
          <Input name="title" defaultValue={method.title} required />
        </label>
        {showFeeFields && (
          <>
            <FeeStatusCombobox
              initialValue={String(method.fee_active)}
            />
            <label className="grid gap-2 text-sm">
              {method.fee_type === "percent" ? "Biaya (%)" : "Nominal biaya"}
              <Input
                name="fee"
                type="number"
                min={0}
                step="any"
                defaultValue={method.fee}
                required
              />
            </label>
          </>
        )}
        {!isCash && <PaymentFeeBearerField initialValue={method.fee_bearer} />}
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
      </div>
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
      <label id={`${id}-label`} htmlFor={id}>
        Status biaya
      </label>
      <SelectCombobox
        id={id}
        aria-labelledby={`${id}-label`}
        options={feeStatusOptions}
        value={value}
        onChange={setValue}
        searchable={false}
      />
      <input type="hidden" name="fee_status" value={value} />
    </div>
  );
}
