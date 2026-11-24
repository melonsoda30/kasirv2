import type { ReactNode } from "react";
import { cn } from "cn";

const tones = {
  ready: { badge: "bg-ready text-ready-foreground", dot: "bg-ready-indicator" },
  success: { badge: "bg-success text-success-foreground", dot: "bg-success-indicator" },
  warning: { badge: "bg-warning text-warning-foreground", dot: "bg-warning-indicator" },
  danger: { badge: "bg-destructive-muted text-destructive", dot: "bg-destructive-indicator" },
  neutral: { badge: "bg-muted text-muted-foreground", dot: null },
};

export type StatusTone = keyof typeof tones;

export function StatusBadge({ tone, children, className }: {
  tone: StatusTone;
  children: ReactNode;
  className?: string;
}) {
  const { badge, dot } = tones[tone];

  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium", badge, className)}>
      {dot && <span aria-hidden="true" className={cn("size-2 shrink-0 rounded-full border border-current", dot)} />}
      {children}
    </span>
  );
}
