import { useState, type ComponentProps, type ReactNode } from "react";
import { cn } from "cn";
import { Skeleton } from "./skeleton";

export function SkeletonImage({ src, className, imageClassName = "size-full object-cover", pendingClassName, fallback, onLoad, onError, ...props }:
  Omit<ComponentProps<"img">, "src"> & {
    src?: string;
    imageClassName?: string;
    pendingClassName?: string;
    fallback?: ReactNode;
  }) {
  const [result, setResult] = useState<{ src: string; loaded: boolean }>();
  if (!src || (result?.src === src && !result.loaded)) return fallback ?? null;
  const pending = result?.src !== src;

  return (
    <span aria-busy={pending || undefined} className={cn("relative block w-full overflow-hidden", className, pending && "bg-card", pending && pendingClassName)}>
      {pending && <Skeleton className="pointer-events-none absolute inset-0 rounded-none" />}
      <img
        key={src}
        {...props}
        src={src}
        className={cn("block", imageClassName, pending && "invisible")}
        onLoad={(event) => {
          setResult({ src, loaded: true });
          onLoad?.(event);
        }}
        onError={(event) => {
          setResult({ src, loaded: false });
          onError?.(event);
        }}
      />
    </span>
  );
}
