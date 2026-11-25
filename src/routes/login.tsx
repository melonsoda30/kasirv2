import { useState } from "react";
import { toast } from "sonner";
import type { FormEvent } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Check, Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  getAuthSession,
  safeRedirect,
  useAuthStore,
} from "@/features/auth/auth-store";
import { login, loginError } from "@/features/auth/login";

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>) => ({
    redirect: safeRedirect(search.redirect),
  }),
  beforeLoad: ({ search }) => {
    if (getAuthSession())
      throw redirect({ href: safeRedirect(search.redirect), replace: true });
  },
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(false);
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState(false);
  const [logoUnavailable, setLogoUnavailable] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !username.trim() || !password) return;
    setBusy(true);
    try {
      const session = await login(username, password, remember);
      useAuthStore.getState().setSession(session, remember);
      setPassword("");
      await navigate({ href: safeRedirect(search.redirect), replace: true });
    } catch (cause) {
      toast.error(loginError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main
      id="main-content"
      className="page-gutter grid min-h-dvh place-items-center bg-background pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-[calc(env(safe-area-inset-bottom)+1.5rem)] text-foreground"
    >
      <div className="w-full max-w-sm">
        <div className="mb-[clamp(2.25rem,9dvh,4.5rem)] h-12 w-32 overflow-hidden">
          {logoUnavailable ? (
            <p className="text-4xl leading-12 font-bold tracking-tight text-link">
              YPOS
            </p>
          ) : (
            <img
              src="https://resto.youzanltd.com/logo.svg"
              alt="YPOS"
              className="size-full origin-left scale-[2.5] object-contain object-left"
              onError={() => setLogoUnavailable(true)}
            />
          )}
        </div>
        <header className="mb-5 space-y-2">
          <h1 className="text-[2rem] leading-tight font-bold tracking-tight text-link">
            <span lang="en" className="motion-safe:sr-only">
              Hello,
            </span>
            <span
              aria-hidden="true"
              className="hidden h-[1lh] overflow-hidden motion-safe:block"
            >
              <span className="block animate-[login-greeting_9s_ease-in-out_infinite] whitespace-nowrap">
                <span lang="en" className="block">
                  Hello,
                </span>
                <span lang="ja" className="block">
                  こんにちは,
                </span>
                <span lang="zh" className="block">
                  您好,
                </span>
                <span lang="en" className="block">
                  Hello,
                </span>
              </span>
            </span>
          </h1>
          <p className="text-sm text-muted-foreground">
            Masuk untuk mulai mengelola bisnis Anda hari ini.
          </p>
        </header>
        <form onSubmit={submit} className="space-y-4" aria-busy={busy}>
          <div className="space-y-2">
            <label htmlFor="username" className="block text-sm font-medium">
              Username
            </label>
            <div className="relative">
              <UserRound
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2.5 size-8 -translate-y-1/2 rounded-lg border border-border bg-card p-1.5 text-muted-foreground"
              />
              <Input
                id="username"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                required
                disabled={busy}
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Username"
                className="h-13 rounded-xl border-border bg-muted/50 pl-13"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="block text-sm font-medium">
              Password
            </label>
            <div className="relative">
              <LockKeyhole
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-2.5 size-8 -translate-y-1/2 rounded-lg border border-border bg-card p-1.5 text-muted-foreground"
              />
              <Input
                id="password"
                name="password"
                type={visible ? "text" : "password"}
                autoComplete="current-password"
                required
                disabled={busy}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="••••••••"
                className="h-13 rounded-xl border-border bg-muted/50 pr-12 pl-13"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-lg"
                disabled={busy}
                onClick={() => setVisible((value) => !value)}
                className="absolute top-1/2 right-1.5 size-10 -translate-y-1/2 text-muted-foreground"
                aria-label={
                  visible ? "Sembunyikan password" : "Tampilkan password"
                }
                aria-pressed={visible}
              >
                {visible ? (
                  <EyeOff aria-hidden="true" />
                ) : (
                  <Eye aria-hidden="true" />
                )}
              </Button>
            </div>
          </div>
          <label className="flex min-h-11 w-fit cursor-pointer items-center gap-2 text-sm has-disabled:cursor-not-allowed has-disabled:opacity-50">
            <span className="relative grid size-6 shrink-0 place-items-center">
              <input
                type="checkbox"
                name="rememberme"
                checked={remember}
                disabled={busy}
                onChange={(event) => setRemember(event.target.checked)}
                className="peer size-full cursor-inherit appearance-none rounded-md border border-muted-foreground/60 bg-card transition-colors checked:border-primary checked:bg-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring forced-colors:appearance-auto"
              />
              <Check
                aria-hidden="true"
                strokeWidth={3}
                className="pointer-events-none absolute size-4 text-primary-foreground opacity-0 peer-checked:opacity-100 forced-colors:hidden"
              />
            </span>
            Ingat saya
          </label>
          <Button
            type="submit"
            size="lg"
            loading={busy}
            disabled={!username.trim() || !password}
            className="w-full rounded-xl font-semibold"
          >
            {busy ? "Sedang masuk…" : "Login"}
          </Button>
        </form>
      </div>
    </main>
  );
}
