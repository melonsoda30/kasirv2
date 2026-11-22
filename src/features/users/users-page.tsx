import { useEffect, useState } from "react";
import { ArrowLeft, Plus, Search, SlidersHorizontal, UserRound } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerFooter,
} from "@/components/ui/drawer";
import { API_BASE_URL } from "@/lib/api";
import { useAuthStore } from "@/features/auth/auth-store";
import { canManageUsers, useUsers, userDisplayName, type UserRecord } from "./users-api";

interface UserFilters {
  status: string;
}
const defaultFilters: UserFilters = {
  status: "all",
};
const hasFilters = (filters: UserFilters) =>
  Object.values(filters).some((value) => value !== "all");

function UserFilterDrawer({
  filters,
  onSave,
}: {
  filters: UserFilters;
  onSave: (value: UserFilters) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(filters);
  const fields = [
    {
      key: "status",
      label: "Status",
      options: [
        { value: "active", label: "Aktif" },
        { value: "noactive", label: "Nonaktif" },
      ],
    },
  ] as const;
  return (
    <Drawer
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft({ ...filters });
        setOpen(next);
      }}
    >
      <DrawerTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="relative h-9 w-9"
          aria-label={
            hasFilters(filters) ? "Filter users, filter aktif" : "Filter users"
          }
        >
          <SlidersHorizontal aria-hidden="true" />
          {hasFilters(filters) && (
            <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-primary" />
          )}
        </Button>
      </DrawerTrigger>
      <DrawerContent className="product-drawer pb-[env(safe-area-inset-bottom)]">
        <DrawerHeader>
          <DrawerTitle>Filter Users</DrawerTitle>
        </DrawerHeader>
        <div className="min-h-0 space-y-5 overflow-y-auto px-4 pb-4">
          {fields.map(({ key, label, options }) => (
            <fieldset key={key} className="min-w-0 space-y-2">
              <legend className="mb-2 text-sm font-medium">{label}</legend>
              <div className="flex flex-wrap gap-2">
                {[{ value: "all", label: "Semua" }, ...options].map(
                  (option) => (
                    <Button
                      key={option.value}
                      type="button"
                      variant={
                        draft[key] === option.value ? "default" : "outline"
                      }
                      aria-pressed={draft[key] === option.value}
                      onClick={() =>
                        setDraft((current) => ({
                          ...current,
                          [key]: option.value,
                        }))
                      }
                    >
                      {option.label}
                    </Button>
                  ),
                )}
              </div>
            </fieldset>
          ))}
        </div>
        <DrawerFooter>
          <div
            className={cn("grid gap-2", hasFilters(draft) ? "grid-cols-2" : "grid-cols-1")}
          >
            {hasFilters(draft) && (
              <Button
                type="button"
                variant="outline"
                onClick={() => setDraft({ ...defaultFilters })}
              >
                Reset filter
              </Button>
            )}
            <Button
              type="button"
              onClick={() => {
                onSave({ ...draft });
                setOpen(false);
              }}
            >
              Simpan
            </Button>
          </div>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function UserCard({ user }: { user: UserRecord }) {
  const [failedImage, setFailedImage] = useState("");
  const image = user.user_foto
    ? new URL(user.user_foto, `${API_BASE_URL.replace(/\/$/, "")}/`).href
    : "";
  return (
    <article className="flex items-start gap-3 rounded-lg border bg-background p-4">
      <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted">
        {image && image !== failedImage ? (
          <img
            src={image}
            alt={`Foto ${userDisplayName(user)}`}
            loading="lazy"
            className="size-full object-cover"
            onError={() => setFailedImage(image)}
          />
        ) : (
          <UserRound
            className="size-6 text-muted-foreground"
            aria-hidden="true"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 break-words text-sm font-semibold">
            {userDisplayName(user)}
          </h2>
          <span
            className={cn(
              "shrink-0 rounded-md px-2 py-0.5 text-xs font-medium",
              user.user_status === "active" ? "bg-emerald-500/10 text-emerald-700" : "bg-muted text-muted-foreground",
            )}
          >
            {user.user_status === "active" ? "Aktif" : "Nonaktif"}
          </span>
        </div>
        <p className="mt-2 break-words text-xs text-muted-foreground">
          {user.user_store_name || user.user_store_id || "Belum ditetapkan ke toko"}
        </p>
        {user.is_cashier && (
          <span className="mt-2 inline-block rounded bg-secondary px-2 py-0.5 text-xs font-medium">
            Kasir
          </span>
        )}
      </div>
    </article>
  );
}

export function UsersPage() {
  const usersQuery = useUsers();
  const canManage = useAuthStore((state) => canManageUsers(state.session?.account));
  const [showTitle, setShowTitle] = useState(true);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ ...defaultFilters });
  useEffect(() => {
    let anchor = Math.max(0, window.scrollY);
    const onScroll = () => {
      const position = Math.max(0, window.scrollY);
      if (position <= 12) {
        setShowTitle(true);
        anchor = position;
        return;
      }
      if (Math.abs(position - anchor) < 8) return;
      setShowTitle(position < anchor);
      anchor = position;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const query = search.trim().toLocaleLowerCase("id-ID");
  const users = (usersQuery.data ?? []).filter(
    (user) =>
      (filters.status === "all" || user.user_status === filters.status) &&
      (!query ||
        [
          user.user_fullname,
          user.user_id,
          user.user_username,
          user.user_store_name,
          user.user_level,
        ].some((value) => value?.toLocaleLowerCase("id-ID").includes(query))),
  );
  return (
    <>
      <header className="users-toolbar fixed inset-x-0 top-0 z-20 border-b bg-background pt-[env(safe-area-inset-top)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]">
        <div
          className={cn(
            "grid transition-[grid-template-rows] duration-200 motion-reduce:transition-none",
            showTitle ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          )}
        >
          <div className="overflow-hidden" inert={!showTitle}>
            <div className="flex h-12 items-center gap-2 px-4">
              <Button asChild type="button" variant="ghost" size="icon">
                <Link to="/profil" aria-label="Kembali ke profil">
                  <ArrowLeft aria-hidden="true" />
                </Link>
              </Button>
              <h1 className="text-lg font-semibold tracking-tight">
                Users {usersQuery.isSuccess && `(${users.length})`}
              </h1>
            </div>
          </div>
        </div>
        <div className="flex gap-2 px-4 py-3">
          <Input
            type="search"
            aria-label="Cari users"
            placeholder="Cari nama, username, atau ID..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-9"
          />
          <UserFilterDrawer filters={filters} onSave={setFilters} />
          {canManage && (
            <Button asChild size="icon" className="size-9 shrink-0">
              <Link to="/users/tambah" aria-label="Tambah pengguna" title="Tambah pengguna">
                <Plus aria-hidden="true" />
              </Link>
            </Button>
          )}
        </div>
      </header>
      <main
        id="main-content"
        className="min-w-0 flex-1 px-4 pt-[calc(109px+env(safe-area-inset-top)+1rem)] pb-6"
      >
        {usersQuery.isPending && (
          <p role="status">Memuat daftar pengguna...</p>
        )}
        {!usersQuery.isPending && usersQuery.isError && (
          <div className="space-y-3">
            <p role="alert">Gagal memuat daftar pengguna.</p>
            <Button
              type="button"
              variant="outline"
              loading={usersQuery.isFetching}
              onClick={() => void usersQuery.refetch()}
            >
              Coba lagi
            </Button>
          </div>
        )}
        {usersQuery.isSuccess && users.length > 0 && (
          <ul className="space-y-3">
            {users.map((user) => (
              <li key={user.user_id}>
                <Link
                  to="/users/$userId"
                  params={{ userId: user.user_id }}
                  className="block rounded-lg outline-none transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Detail ${userDisplayName(user)}`}
                >
                  <UserCard user={user} />
                </Link>
              </li>
            ))}
          </ul>
        )}
        {!usersQuery.isPending && !usersQuery.isError && !users.length && (
          <div className="space-y-3 py-16 text-center">
            <Search
              className="mx-auto size-7 text-muted-foreground"
              aria-hidden="true"
            />
            <p className="text-sm text-muted-foreground">
              Pengguna tidak ditemukan. Coba pencarian atau filter lain.
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSearch("");
                setFilters({ ...defaultFilters });
              }}
            >
              Reset pencarian
            </Button>
          </div>
        )}
      </main>
    </>
  );
}
