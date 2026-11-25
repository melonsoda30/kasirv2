import { useId, useState } from "react";
import { SelectCombobox } from "@/components/select-combobox";
import type { PaymentFeeBearer } from "./store-settings-query";

const feeBearerOptions = [
  { value: "store", label: "Store" },
  { value: "customer", label: "Customer" },
];

export function PaymentFeeBearerField({ initialValue, disabled }: {
  initialValue?: PaymentFeeBearer | null;
  disabled?: boolean;
}) {
  const id = useId();
  const [value, setValue] = useState<string>(initialValue ?? "customer");

  return (
    <div className="grid gap-2 text-sm">
      <label id={`${id}-label`} htmlFor={id}>
        Penanggung biaya
      </label>
      <SelectCombobox
        id={id}
        aria-labelledby={`${id}-label`}
        options={feeBearerOptions}
        value={value}
        onChange={setValue}
        searchable={false}
        disabled={disabled}
      />
      <input type="hidden" name="fee_bearer" value={value} />
    </div>
  );
}
