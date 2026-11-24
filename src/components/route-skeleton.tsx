import { Skeleton, SkeletonGroup, SkeletonRows } from "@/components/ui/skeleton";

export function RouteSkeleton() {
  return (
    <main id="main-content" className="page-gutter w-full min-w-0 flex-1 py-4 sm:py-6">
      <SkeletonGroup label="Memuat halaman" className="space-y-4">
        <Skeleton className="h-6 w-40 max-w-full" />
        <SkeletonRows />
      </SkeletonGroup>
    </main>
  );
}
