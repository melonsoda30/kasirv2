import { Link } from "@tanstack/react-router";
import {
  House,
  Package,
  ShoppingBag,
  Boxes,
  UserRound,
  ClipboardList,
  ListOrdered,
  ReceiptText,
} from "lucide-react";
import { useAuthStore, usesCashierMode } from "@/features/auth/auth-store";
import { cn } from "@/lib/cn";

const adminItems = [
  { to: "/", label: "Home", icon: House },
  { to: "/produk", label: "Produk", icon: Package },
  { to: "/penjualan", label: "Penjualan", icon: ShoppingBag },
  { to: "/stok", label: "Stok", icon: Boxes },
  { to: "/profil", label: "Profil", icon: UserRound },
] as const;

const cashierItems = [
  // { to: "/stok", label: "Stok", icon: Boxes },
  { to: "/cart", label: "Antrean", icon: ListOrdered },
  { to: "/", label: "Order", icon: ClipboardList },
  { to: "/penjualan", label: "Transaksi", icon: ReceiptText },
  { to: "/profil", label: "Profil", icon: UserRound },
] as const;

export function BottomNav() {
  const cashierMode = useAuthStore((state) => usesCashierMode(state.session));
  const items = cashierMode ? cashierItems : adminItems;
  return (
    <nav
      aria-label="Menu utama"
      className="bottom-nav fixed inset-x-0 bottom-0 z-30 border-t bg-background pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
    >
      <div
        className={cn(
          "mx-auto grid h-18 max-w-xl",
          cashierMode ? "grid-cols-4" : "grid-cols-5",
        )}
      >
        {items.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === "/" }}
            className="group flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-foreground motion-reduce:transition-none"
            activeProps={{ className: "text-foreground", "aria-current": "page" }}
            inactiveProps={{ className: "text-muted-foreground hover:text-foreground" }}
          >
            <span className="grid h-8 w-12 place-items-center rounded-xl transition-colors group-aria-[current=page]:bg-muted group-hover:bg-muted/60 motion-reduce:transition-none">
              <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <span>{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
