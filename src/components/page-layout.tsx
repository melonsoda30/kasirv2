import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import type { LinkProps } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";

export function PageLayout({
  title,
  children,
  prevLink,
  prevSearch,
  headerAction,
  wide = false,
}: {
  title?: string;
  children?: ReactNode;
  prevLink?: LinkProps['to'];
  prevSearch?: LinkProps['search'];
  headerAction?: ReactNode;
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
            {title && <h1 className="text-lg font-semibold tracking-tight">{title}</h1>}
            {headerAction && <div className="ml-auto">{headerAction}</div>}
          </div>
        </header>
      )}
      <main id="main-content" className={cn("page-gutter mx-auto w-full min-w-0 flex-1 py-4 sm:py-6", !wide && "max-w-[40rem]")}>
        {children}
      </main>
    </>
  );
}
