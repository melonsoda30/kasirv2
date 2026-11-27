import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { Reorder, useDragControls } from "motion/react";
import { Button } from "@/components/ui/button";
import { buttonVariants } from "@/components/ui/button-variants";

export function OrderReorderItem({
  value,
  label,
  description,
  disabled,
  moveUp,
  moveDown,
}: {
  value: string | number;
  label: string;
  description: string;
  disabled: boolean;
  moveUp?: () => void;
  moveDown?: () => void;
}) {
  const controls = useDragControls();
  return (
    <Reorder.Item
      value={value}
      dragListener={false}
      dragControls={controls}
      aria-label={label}
      aria-disabled={disabled || undefined}
      className="relative flex items-center gap-2 bg-popover py-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
    >
      <div className="min-w-0 flex-1">
        <p className="break-words font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={disabled || !moveUp}
        aria-label={`Naikkan ${label}`}
        onClick={moveUp}
      >
        <ArrowUp aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={disabled || !moveDown}
        aria-label={`Turunkan ${label}`}
        onClick={moveDown}
      >
        <ArrowDown aria-hidden="true" />
      </Button>
      <span
        aria-hidden="true"
        className={buttonVariants({
          variant: "outline",
          size: "icon",
          className: "touch-none cursor-grab active:cursor-grabbing",
        })}
        data-vaul-no-drag=""
        onPointerDown={(event) => {
          if (!disabled) controls.start(event);
        }}
      >
        <GripVertical />
      </span>
    </Reorder.Item>
  );
}
