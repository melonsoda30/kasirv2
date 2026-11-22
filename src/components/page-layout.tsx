import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { LinkProps } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PageLayout({
  title,
  children,
  prevLink,
  prevSearch,
  headerAction,
}: {
  title?: string;
  children?: ReactNode;
  prevLink?: LinkProps['to'];
  prevSearch?: LinkProps['search'];
  headerAction?: ReactNode;
}) {
  return (
    <>
      {(title || prevLink || headerAction) && (
        <header className="px-4 pt-[env(safe-area-inset-top)]">
          <div className="flex min-h-12 items-center gap-2">
            {prevLink && (
              <Button asChild variant="ghost" size="icon">
                <Link to={prevLink} search={prevSearch} aria-label="Kembali">
                  <ArrowLeft aria-hidden="true" />
                </Link>
              </Button>
            )}
            {title && <h1 className="text-lg font-semibold tracking-tight">{title}</h1>}
            {headerAction && <div className="ml-auto">{headerAction}</div>}
          </div>
        </header>
      )}
      <main id="main-content" className="min-w-0 flex-1 px-5 py-6">
        {children}
      </main>
    </>
  );
}
