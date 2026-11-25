import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { LinkProps } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { AdminBranchSwitcher } from "@/features/auth/admin-branch-drawer";

export function PageLayout({
  title,
  children,
  prevLink,
  prevSearch,
  headerAction,
  branchSwitcher = <AdminBranchSwitcher />,
  wide = false,
}: {
  title?: string;
  children?: ReactNode;
  prevLink?: LinkProps['to'];
  prevSearch?: LinkProps['search'];
  headerAction?: ReactNode;
  branchSwitcher?: ReactNode;
  wide?: boolean;
}) {
  return (
    <>
      {(title || prevLink || headerAction) && (
        <header className="border-b bg-background pt-[env(safe-area-inset-top)]">
          <div className={cn("page-gutter mx-auto flex min-h-12 items-center gap-2", !wide && "max-w-[40rem]")}>
            {prevLink && (
              <Button asChild variant="ghost" size="icon">
                <Link to={prevLink} search={prevSearch} aria-label="Kembali">
                  <ArrowLeft aria-hidden="true" />
                </Link>
              </Button>
            )}
            {title && <h1 className="min-w-0 flex-1 text-lg font-semibold tracking-tight">{title}</h1>}
            {title && <div className="min-w-0 max-w-[45%] empty:hidden">{branchSwitcher}</div>}
            {headerAction && <div className="ml-auto shrink-0">{headerAction}</div>}
          </div>
        </header>
      )}
      <main id="main-content" className={cn("page-gutter mx-auto w-full min-w-0 flex-1 py-4 sm:py-6", !wide && "max-w-[40rem]")}>
        {children}
      </main>
    </>
  );
}
