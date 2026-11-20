import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { InputNominal } from "@/components/input-nominal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SettingCard } from "@/features/settings/setting-card";
import { StoreSettingsPage } from "@/features/settings/store-settings-page";

export const Route = createFileRoute("/settings_/shift")({
  component: ShiftSettingsPage,
});

function ShiftSettingsPage() {
  return (
    <StoreSettingsPage title="Shift">
      {({ shift, cash_tolerance }, update) => (
        <div className="space-y-3">
          {!shift.length && (
            <p className="text-sm text-muted-foreground">
              Belum ada pengaturan shift.
            </p>
          )}
          {shift.map((item) => (
            <SettingCard
              key={item.code}
              title={item.title}
              active={item.is_active}
              editOnActivate
              summary={
                item.code === "none"
                  ? undefined
                  : item.start_time || item.end_time
                    ? `${item.start_time || "—"} – ${item.end_time || "—"}`
                    : "Jam shift belum diatur"
              }
              onSave={(active, values) =>
                update((current) => {
                  const shift = current.shift.map(
                    ({ start_time, end_time, ...entry }) => {
                      const selected = entry.code === item.code;
                      if (selected && values) {
                        start_time = String(values.get("start_time") ?? "");
                        end_time = String(values.get("end_time") ?? "");
                      }
                      const oppositeMode =
                        (item.code === "none") !== (entry.code === "none");
                      return {
                        ...entry,
                        is_active: selected
                          ? active
                          : active && oppositeMode
                            ? false
                            : entry.is_active,
                        ...(entry.code !== "none" && (start_time || end_time)
                          ? { start_time, end_time }
                          : {}),
                      };
                    },
                  );
                  if (!shift.some((entry) => entry.is_active))
                    throw new Error("Minimal satu shift harus aktif.");
                  return { shift };
                })
              }
            >
              {item.code !== "none" ? (
                <div className="space-y-3">
                  {shift.some(
                    (entry) => entry.code === "none" && entry.is_active,
                  ) && (
                    <p className="text-sm text-muted-foreground">
                      Mengaktifkan shift ini akan menonaktifkan Tanpa Shift.
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-3">
                    <label className="grid min-w-0 gap-2 text-sm">
                      Jam mulai
                      <Input
                        type="time"
                        name="start_time"
                        defaultValue={item.start_time?.padStart(5, "0")}
                        required
                      />
                    </label>
                    <label className="grid min-w-0 gap-2 text-sm">
                      Jam selesai
                      <Input
                        type="time"
                        name="end_time"
                        defaultValue={item.end_time?.padStart(5, "0")}
                        required
                      />
                    </label>
                  </div>
                </div>
              ) : !item.is_active && shift.some((entry) => entry.is_active) ? (
                <p className="text-sm text-muted-foreground">
                  Mengaktifkan Tanpa Shift akan menonaktifkan shift kerja yang
                  aktif.
                </p>
              ) : undefined}
            </SettingCard>
          ))}
          <CashToleranceForm
            key={cash_tolerance ?? 0}
            amount={cash_tolerance ?? 0}
            onSave={(value) => update(() => ({ cash_tolerance: value }))}
          />
        </div>
      )}
    </StoreSettingsPage>
  );
}

function CashToleranceForm({
  amount,
  onSave,
}: {
  amount: number;
  onSave: (value: number) => Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  const [nominal, setNominal] = useState(String(amount));

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const value = Number(nominal);
    if (!Number.isInteger(value) || value < 0 || value > 1_000_000) {
      toast.error("Toleransi selisih harus antara Rp0 dan Rp1.000.000.");
      return;
    }
    setPending(true);
    try {
      await onSave(value);
      toast.success("Toleransi selisih berhasil disimpan.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Gagal menyimpan toleransi selisih.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={save}
      className="grid gap-3 rounded-xl border bg-background p-4"
    >
      <label className="grid gap-2 text-sm">
        Toleransi Selisih (Rp)
        <InputNominal value={nominal} onValueChange={setNominal} disabled={pending} />
      </label>
      <Button type="submit" className="justify-self-end" disabled={pending}>
        {pending ? "Menyimpan..." : "Simpan toleransi"}
      </Button>
    </form>
  );
}
