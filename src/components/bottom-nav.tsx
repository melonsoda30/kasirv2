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
import { isCashierEventLevel, useAuthStore } from "@/features/auth/auth-store";

const adminItems = [
  { to: "/", label: "Home", icon: House },
  { to: "/produk", label: "Produk", icon: Package },
  { to: "/penjualan", label: "Penjualan", icon: ShoppingBag },
  { to: "/stok", label: "Stok", icon: Boxes },
  { to: "/profil", label: "Profil", icon: UserRound },
] as const;

const cashierItems = [
  { to: "/stok", label: "Stok", icon: Boxes },
  { to: "/cart", label: "Antrean", icon: ListOrdered },
  { to: "/", label: "Order", icon: ClipboardList },
  { to: "/penjualan", label: "Transaksi", icon: ReceiptText },
  { to: "/profil", label: "Profil", icon: UserRound },
] as const;

export function BottomNav() {
  const eventLevel = useAuthStore(
    (state) => state.session?.account.event_level,
  );
  const items = isCashierEventLevel(eventLevel) ? cashierItems : adminItems;
  return (
    <nav
      aria-label="Menu utama"
      className="bottom-nav fixed inset-x-0 bottom-0 z-30 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]"
    >
      <div className="grid h-18 grid-cols-5">
        {items.map(({ to, label, icon: Icon }) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: to === "/" }}
            className="flex min-w-0 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors focus-visible:outline-2 focus-visible:-outline-offset-4 focus-visible:outline-zinc-900"
            activeProps={{ className: "text-zinc-950", "aria-current": "page" }}
            inactiveProps={{ className: "text-zinc-500 hover:text-zinc-900" }}
          >
            <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
            <span>{label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
