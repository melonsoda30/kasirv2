import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { isAxiosError } from "axios";
import { toast } from "sonner";
import { Eye, EyeOff } from "lucide-react";
import { PageLayout } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { changePassword, verifyCurrentPassword } from "@/features/profile/profile-api";
import { useAuthStore } from "@/features/auth/auth-store";

export const Route = createFileRoute("/profil_/ganti-password")({
  component: ChangePasswordPage,
});

function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  disabled: boolean;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <div className="relative">
        <Input
          id={id}
          name={id}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          required
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="pr-12"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={disabled}
          className="absolute top-1/2 right-1 size-10 -translate-y-1/2"
          aria-label={
            visible
              ? `Sembunyikan ${label.toLowerCase()}`
              : `Tampilkan ${label.toLowerCase()}`
          }
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}
        </Button>
      </div>
    </div>
  );
}

function ChangePasswordPage() {
  const accountId = useAuthStore((state) => state.session?.account.account_id);
  return accountId ? <ChangePasswordForm key={accountId} /> : null;
}

function ChangePasswordForm() {
  const [step, setStep] = useState<"verify" | "change" | "done">("verify");
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (step === "change") {
      if (password.length < 8) {
        setError("Password baru minimal 8 karakter.");
        return;
      }
      if (password === current) {
        setError("Password baru harus berbeda dari password sekarang.");
        return;
      }
      if (password !== confirmation) {
        setError("Konfirmasi password baru tidak cocok.");
        return;
      }
    }
    setBusy(true);
    try {
      if (step === "verify") {
        await verifyCurrentPassword(current);
        setStep("change");
      } else {
        await changePassword(password);
        setCurrent("");
        setPassword("");
        setConfirmation("");
        setStep("done");
      }
      heading.current?.focus();
    } catch (cause) {
      const fallback = "Perubahan gagal. Silakan coba lagi.";
      let message = cause instanceof Error ? cause.message : fallback;
      if (isAxiosError<{ msg?: string }>(cause)) {
        message = cause.response?.data?.msg || fallback;
      }
      if (useAuthStore.getState().session) setError(message);
      else toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <PageLayout title="Ganti Password" prevLink="/profil">
      <div className="bento-surface space-y-5 p-4 sm:p-5">
        <div>
          <h2
            ref={heading}
            tabIndex={-1}
            className="font-semibold outline-none"
          >
            {step === "verify" && "Konfirmasi password sekarang"}
            {step === "change" && "Buat password baru"}
            {step === "done" && "Password berhasil diganti"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {step === "verify" && "Masukkan password sekarang untuk melanjutkan."}
            {step === "change" && "Gunakan minimal 8 karakter dan konfirmasi password baru Anda."}
            {step === "done" && "Gunakan password baru saat login berikutnya."}
          </p>
        </div>
        {step !== "done" && (
          <form key={step} onSubmit={submit} className="flow-panel space-y-4" aria-busy={busy}>
            {step === "verify" ? (
              <PasswordField
                key="current"
                id="current-password"
                label="Password sekarang"
                value={current}
                onChange={setCurrent}
                autoComplete="current-password"
                disabled={busy}
              />
            ) : (
              <>
                <PasswordField
                  key="new"
                  id="new-password"
                  label="Password baru"
                  value={password}
                  onChange={setPassword}
                  autoComplete="new-password"
                  disabled={busy}
                />
                <PasswordField
                  id="confirm-password"
                  label="Konfirmasi password baru"
                  value={confirmation}
                  onChange={setConfirmation}
                  autoComplete="new-password"
                  disabled={busy}
                />
              </>
            )}

            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <Button type="submit" loading={busy} className="w-full">
              {step === "verify" ? "Konfirmasi" : "Simpan password baru"}
            </Button>
            {step === "change" && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                className="w-full"
                onClick={() => {
                  setStep("verify");
                  setCurrent("");
                  setPassword("");
                  setConfirmation("");
                  setError("");
                }}
              >
                Konfirmasi ulang password sekarang
              </Button>
            )}
          </form>
        )}
        {step === "done" && (
          <Button asChild className="w-full">
            <Link to="/profil">Kembali ke profil</Link>
          </Button>
        )}
      </div>
    </PageLayout>
  );
}
