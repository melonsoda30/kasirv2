import { useState } from "react";
import type { FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { PageLayout } from "@/components/page-layout";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { ImageInput, type UploadStatus } from "@/components/image-input";
import { useAuthStore } from "@/features/auth/auth-store";
import type { Account } from "@/features/auth/auth-store";
import { saveProfile } from "@/features/profile/profile-api";
import { API_BASE_URL } from "@/lib/api";

export const Route = createFileRoute("/profil_/edit")({
  component: EditProfilePage,
});

function EditProfilePage() {
  const account = useAuthStore((state) => state.session?.account);
  return account ? <EditProfileForm key={account.account_id} account={account} /> : null;
}

function EditProfileForm({ account }: { account: Account }) {
  const navigate = useNavigate();
  const initialValues = {
    username: account.account_username || "",
    fullname: account.account_fullname || "",
    email: account.account_email || "",
    phone: account.account_phone || "",
    address: account.account_address || "",
  };
  const [values, setValues] = useState(initialValues);
  const savedPhoto = account.account_img
    ? new URL(account.account_img, `${API_BASE_URL.replace(/\/$/, "")}/`).href
    : "";
  const [photo, setPhoto] = useState(savedPhoto);
  const [image, setImage] = useState<File | null>(null);
  const [upload, setUpload] = useState<UploadStatus>({
    busy: false,
    error: "",
  });
  const [busy, setBusy] = useState(false);
  const changedFields = (Object.keys(values) as (keyof typeof values)[]).filter(
    (key) => values[key].trim() !== initialValues[key].trim(),
  );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || upload.busy || upload.error || (!image && !changedFields.length)) return;
    if (!values.username.trim() || !values.fullname.trim()) {
      toast.error("Username dan nama lengkap wajib diisi.");
      return;
    }
    setBusy(true);
    try {
      const { profile, message } = await saveProfile({
        image,
        ...Object.fromEntries(changedFields.map((key) => [key, values[key]])),
      });
      const current = useAuthStore.getState().session;
      if (!current || current.account.account_id !== account.account_id) return;
      useAuthStore.getState().updateAccount({
        account_username: profile.username,
        account_fullname: profile.fullname,
        account_email: profile.email,
        account_phone: profile.phone,
        account_address: profile.address,
        account_img: profile.img,
      });
      toast.success(message || "Profil diperbarui.");
      await navigate({ to: "/profil" });
    } catch (cause) {
      let message = cause instanceof Error ? cause.message : "Gagal menyimpan profil.";
      if (isAxiosError<{ msg?: string }>(cause)) {
        message = cause.response?.data?.msg || "Gagal menyimpan profil. Silakan coba lagi.";
      }
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  const fields = [
    {
      key: "username",
      label: "Username",
      type: "text",
      autoComplete: "username",
      required: true,
    },
    {
      key: "fullname",
      label: "Nama lengkap",
      type: "text",
      autoComplete: "name",
      required: true,
    },
    {
      key: "email",
      label: "Email",
      type: "email",
      autoComplete: "email",
      required: false,
    },
    {
      key: "phone",
      label: "Nomor handphone",
      type: "tel",
      autoComplete: "tel",
      required: false,
    },
  ] as const;

  return (
    <PageLayout title="Edit Profil" prevLink="/profil">
      <form onSubmit={submit} aria-busy={busy}>
        <fieldset disabled={busy} className="min-w-0 space-y-5">
          <ImageInput
            id="profile-image"
            label="Foto profil"
            value={photo}
            onChange={(next) => setPhoto(next || savedPhoto)}
            onFileChange={setImage}
            onStatusChange={setUpload}
            removable={!!image}
            removeLabel="Batalkan foto baru"
          />
          {fields.map(({ key, label, type, autoComplete, required }) => (
            <div key={key} className="space-y-2">
              <label htmlFor={`profile-${key}`} className="text-sm font-medium">
                {label}
                {required && <span aria-hidden="true"> *</span>}
              </label>
              <Input
                id={`profile-${key}`}
                name={key}
                type={type}
                autoComplete={autoComplete}
                required={required}
                value={values[key]}
                onChange={(event) =>
                  setValues((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
              />
            </div>
          ))}
          <div className="space-y-2">
            <label htmlFor="profile-address" className="text-sm font-medium">
              Alamat
            </label>
            <Textarea
              id="profile-address"
              name="address"
              autoComplete="street-address"
              rows={3}
              value={values.address}
              onChange={(event) =>
                setValues((current) => ({
                  ...current,
                  address: event.target.value,
                }))
              }
            />
          </div>

          <Button
            type="submit"
            loading={busy}
            disabled={upload.busy || !!upload.error || (!image && !changedFields.length)}
            className="w-full"
          >
            Simpan
          </Button>
        </fieldset>
      </form>
    </PageLayout>
  );
}
