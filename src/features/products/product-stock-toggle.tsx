import type { ComponentProps } from "react";
import { Check } from "lucide-react";

export function ProductStockToggle(props: Omit<ComponentProps<"input">, "type" | "className" | "children">) {
  return (
    <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-sm font-medium has-disabled:cursor-not-allowed has-disabled:opacity-50">
      <span className="relative grid size-6 shrink-0 place-items-center">
        <input
          {...props}
          type="checkbox"
          className="peer size-full cursor-inherit appearance-none rounded-md border border-muted-foreground/60 bg-card transition-colors checked:border-primary checked:bg-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring forced-colors:appearance-auto"
        />
        <Check
          aria-hidden="true"
          strokeWidth={3}
          className="pointer-events-none absolute size-4 text-primary-foreground opacity-0 peer-checked:opacity-100 forced-colors:hidden"
        />
      </span>
      Gunakan sistem stok
    </label>
  );
}
