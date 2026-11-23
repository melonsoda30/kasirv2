import { Store } from "lucide-react";
import { PageLayout } from "@/components/page-layout";
import { Button } from "@/components/ui/button";
import { StoreBranches } from "./store-branches";
import { useStore, type AdminStore } from "./stores-api";

function StoreSummary({ store }: { store: AdminStore }) {
  return (
    <section
      aria-labelledby="store-heading"
      className="bento-surface flex items-start gap-3 p-4"
    >
      <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted">
        <Store className="size-6 text-muted-foreground" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h2 id="store-heading" className="min-w-0 text-base font-semibold">
            {store.store_name}
          </h2>
          {/* <span className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-medium ${active ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground"}`}>
            {active ? "Aktif" : "Nonaktif"}
          </span> */}
        </div>
        {/* <p className="mt-1 text-xs text-muted-foreground">{store.store_id}</p> */}
        {(store.store_address || store.store_city) && (
          <address className="mt-2 text-sm not-italic text-muted-foreground">
            {store.store_address && <div>{store.store_address}</div>}
            {store.store_city && <div>{store.store_city}</div>}
          </address>
        )}
      </div>
    </section>
  );
}

export function StoresPage() {
  const storeQuery = useStore();
  const store = storeQuery.data;

  return (
    <PageLayout title="Toko" prevLink="/profil">
      {storeQuery.isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          Memuat toko...
        </p>
      )}
      {storeQuery.isError && (
        <div className="mb-4 space-y-2">
          <p role="alert" className="text-sm text-destructive">
            {storeQuery.error.message}
          </p>
          <Button
            type="button"
            variant="outline"
            loading={storeQuery.isFetching}
            onClick={() => void storeQuery.refetch()}
          >
            Coba lagi
          </Button>
        </div>
      )}
      {store && (
        <>
          <StoreSummary store={store} />
          <StoreBranches
            key={store.store_id}
            storeId={store.store_id}
            branches={store.store_branch ?? []}
          />
        </>
      )}
      {storeQuery.isSuccess && store === null && (
        <p className="text-sm text-muted-foreground">
          Belum ada toko untuk akun ini.
        </p>
      )}
    </PageLayout>
  );
}
