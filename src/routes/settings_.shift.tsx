import { createFileRoute } from "@tanstack/react-router";
import { useId, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { InputNominal } from "@/components/input-nominal";
import { SelectCombobox } from "@/components/select-combobox";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import { SettingCard } from "@/features/settings/setting-card";
import { StoreSettingsPage, type SaveStoreSettings } from "@/features/settings/store-settings-page";
import type { StoreSettings } from "@/features/settings/store-settings-query";

type Shift = StoreSettings["shift"][number];

export const Route = createFileRoute("/settings_/shift")({
  component: ShiftSettingsPage,
});

function ShiftSettingsPage() {
  return (
    <StoreSettingsPage title="Shift">
      {(settings, update) => <ShiftSettings settings={settings} update={update} />}
    </StoreSettingsPage>
  );
}

function ShiftSettings({ settings, update }: { settings: StoreSettings; update: SaveStoreSettings }) {
  const { shift, cash_tolerance } = settings;
  const workShifts = shift.filter((item) => item.code !== "none");
  const noShift = shift.find((item) => item.code === "none");
  const usesShifts = !noShift?.is_active && workShifts.some((item) => item.is_active);

  function saveShift(code: string, active: boolean, values?: FormData) {
    return update((current) => {
      if (!current.shift.some((entry) => entry.code === code)) {
        throw new Error("Shift sudah tidak tersedia.");
      }
      const shift = current.shift.map(({ start_time, end_time, ...entry }) => {
        const selected = entry.code === code;
        if (selected && values) {
          start_time = String(values.get("start_time") ?? "");
          end_time = String(values.get("end_time") ?? "");
        }
        const oppositeMode = (code === "none") !== (entry.code === "none");
        return {
          ...entry,
          is_active: selected ? active : entry.is_active && !(active && oppositeMode),
          ...(entry.code !== "none" && (start_time || end_time)
            ? { start_time, end_time }
            : {}),
        };
      });
      if (!shift.some((entry) => entry.is_active)) {
        throw new Error("Minimal satu shift harus aktif.");
      }
      return { shift };
    });
  }

  if (!usesShifts) {
    if (!workShifts.length) {
      return <p className="text-sm text-muted-foreground">Belum ada jadwal shift.</p>;
    }

    return (
      <ActivateShiftCard
        shifts={workShifts}
        onSave={(code, values) => saveShift(code, true, values)}
      />
    );
  }

  return (
    <div className="space-y-3">
      {noShift && <NoShiftCard onSave={() => saveShift(noShift.code, true)} />}
      {workShifts.map((item) => (
        <SettingCard
          key={item.code}
          title={item.title}
          active={item.is_active}
          editOnActivate
          summary={shiftSchedule(item)}
          onSave={(active, values) => saveShift(item.code, active, values)}
        >
          <ShiftScheduleFields shift={item} />
        </SettingCard>
      ))}
      <CashToleranceForm
        key={cash_tolerance ?? 0}
        amount={cash_tolerance ?? 0}
        onSave={(value) => update(() => ({ cash_tolerance: value }))}
      />
    </div>
  );
}

function NoShiftCard({ onSave }: { onSave: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function activate() {
    if (pending) return;
    setPending(true);
    try {
      await onSave();
      setOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal mengubah mode shift.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="bento-surface flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="space-y-1">
        <h2 className="text-sm font-semibold">Mode Shift Aktif</h2>
        <p className="text-sm text-muted-foreground">
          Saat ini toko menggunakan mode shift. Jika beralih ke Tanpa Shift, kasir bisa menerima transaksi tanpa membuka shift.
        </p>
      </div>
      <Drawer
        open={open}
        onOpenChange={(nextOpen) => {
          if (!pending) setOpen(nextOpen);
        }}
      >
        <DrawerTrigger asChild>
          <Button size="sm" variant="outline">Ganti ke Tanpa Shift</Button>
        </DrawerTrigger>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>Ganti ke Tanpa Shift?</DrawerTitle>
            <DrawerDescription>Semua shift kerja akan dinonaktifkan.</DrawerDescription>
          </DrawerHeader>
          <DrawerFooter actions>
            <DrawerClose asChild>
              <Button type="button" variant="outline" disabled={pending}>Batal</Button>
            </DrawerClose>
            <Button type="button" loading={pending} onClick={() => void activate()}>
              Ganti ke Tanpa Shift
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </section>
  );
}

function ActivateShiftCard({
  shifts,
  onSave,
}: {
  shifts: Shift[];
  onSave: (code: string, values: FormData) => Promise<void>;
}) {
  const id = useId();
  const [code, setCode] = useState("");
  const selected = shifts.find((item) => item.code === code);

  return (
    <SettingCard
      title="Shift Kerja"
      active={false}
      editOnActivate
      saveDisabled={!selected}
      onClose={() => setCode("")}
      onSave={async (_, values) => {
        if (selected && values) await onSave(selected.code, values);
      }}
    >
      <div className="space-y-3">
        <div className="grid gap-2 text-sm">
          <label id={`${id}-label`} htmlFor={id}>Jadwal shift</label>
          <SelectCombobox
            id={id}
            aria-labelledby={`${id}-label`}
            options={shifts.map((item) => ({ value: item.code, label: item.title }))}
            value={code}
            onChange={setCode}
            placeholder="Pilih shift"
            searchable={false}
          />
        </div>
        {selected && <ShiftScheduleFields key={selected.code} shift={selected} />}
      </div>
    </SettingCard>
  );
}

function ShiftScheduleFields({ shift }: { shift: Shift }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <label className="grid min-w-0 gap-2 text-sm">
        Jam mulai
        <Input
          type="time"
          name="start_time"
          defaultValue={shift.start_time?.padStart(5, "0")}
          required
        />
      </label>
      <label className="grid min-w-0 gap-2 text-sm">
        Jam selesai
        <Input
          type="time"
          name="end_time"
          defaultValue={shift.end_time?.padStart(5, "0")}
          required
        />
      </label>
    </div>
  );
}

function shiftSchedule({ start_time, end_time }: Shift) {
  if (!start_time && !end_time) return "Jam shift belum diatur";
  const overnight = start_time && end_time && end_time < start_time;
  const suffix = overnight ? " (lewat tengah malam)" : "";
  return `${start_time || "—"} – ${end_time || "—"}${suffix}`;
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
      className="bento-surface grid gap-3 p-4"
    >
      <label className="grid gap-2 text-sm">
        <span className="font-semibold">Toleransi Selisih</span>
        <InputNominal
          value={nominal}
          onValueChange={setNominal}
          disabled={pending}
        />
      </label>
      <Button type="submit" className="justify-self-end" loading={pending}>
        Simpan toleransi
      </Button>
    </form>
  );
}
