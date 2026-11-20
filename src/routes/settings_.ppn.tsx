import { createFileRoute } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { SettingCard } from "@/features/settings/setting-card";
import { StoreSettingsPage } from "@/features/settings/store-settings-page";

export const Route = createFileRoute("/settings_/ppn")({ component: PpnSettingsPage });

function PpnSettingsPage() {
  return (
    <StoreSettingsPage title="PPN">
      {(data, update) => (
        <SettingCard
          title="PPN"
          active={data.ppn.is_active}
          summary={`Tarif ${data.ppn.value.toLocaleString("id-ID")}%`}
          onSave={(active, values) => update((current) => ({
            ppn: {
              ...current.ppn,
              is_active: active,
              value: values ? Number(values.get("value")) : current.ppn.value,
            },
          }))}
        >
          <label className="grid gap-2 text-sm">
            Tarif PPN (%)
            <Input type="number" min={0} max={100} step="any" name="value" defaultValue={data.ppn.value} required />
          </label>
        </SettingCard>
      )}
    </StoreSettingsPage>
  );
}
