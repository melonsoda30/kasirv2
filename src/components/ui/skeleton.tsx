import type { ReactNode } from "react";
import { cn } from "cn";

export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cn("block rounded-md bg-muted motion-safe:animate-pulse", className)} />;
}

export function SkeletonGroup({ label, className, children }: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div role="status" className={className}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function SkeletonRows({ rows = 3, media, className }: {
  rows?: number;
  media?: "avatar" | "thumbnail";
  className?: string;
}) {
  return (
    <div aria-hidden="true" className={cn("grid gap-2", className)}>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="bento-surface flex items-center gap-3 p-3">
          {media === "avatar" && <Skeleton className="size-12 shrink-0 rounded-full" />}
          {media === "thumbnail" && <Skeleton className="size-16 shrink-0" />}
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonFields({ rows = 2 }: { rows?: number }) {
  return (
    <div aria-hidden="true" className="grid gap-4">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="space-y-2">
          <Skeleton className="h-3 w-24 max-w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ))}
    </div>
  );
}

export function CatalogSkeleton({ label = "Memuat produk" }: { label?: string }) {
  return (
    <SkeletonGroup label={label}>
      <div aria-hidden="true" className="bento-catalog">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index} className="bento-surface overflow-hidden">
            <Skeleton className="aspect-square w-full rounded-none" />
            <div className="space-y-2 p-3">
              <Skeleton className="h-4 w-4/5" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          </div>
        ))}
      </div>
    </SkeletonGroup>
  );
}
