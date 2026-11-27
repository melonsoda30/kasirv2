import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";

export function TransactionPagination({ fetching, loading, failed, loadMore, restart, itemLabel = "transaksi" }: {
  fetching: boolean;
  loading: boolean;
  failed: boolean;
  loadMore: () => void;
  restart?: () => void;
  itemLabel?: string;
}) {
  const footer = useRef<HTMLDivElement>(null);
  let buttonLabel = `Muat ${itemLabel} berikutnya`;
  if (failed) buttonLabel = "Coba lagi";
  if (restart) buttonLabel = "Muat dari awal";

  useEffect(() => {
    if (!footer.current || fetching || failed || typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    }, { rootMargin: "0px 0px 240px" });
    observer.observe(footer.current);
    return () => observer.disconnect();
  }, [fetching, failed, loadMore]);

  return (
    <div ref={footer} className="space-y-2 py-4 text-center">
      {failed && (
        <p role="alert" className="text-sm text-muted-foreground">
          {restart ? `Cursor tidak valid. Muat daftar ${itemLabel} dari awal.` : `Gagal memuat ${itemLabel} berikutnya.`}
        </p>
      )}
      <Button type="button" variant="outline" size="sm" disabled={fetching} loading={loading} onClick={restart ?? loadMore}>
        {buttonLabel}
      </Button>
    </div>
  );
}
