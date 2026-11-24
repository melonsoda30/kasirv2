import { useState } from "react";
import { toast } from "sonner";
import type { FormEvent } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
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
      className="flex min-h-dvh flex-col bg-background px-6 pt-[calc(env(safe-area-inset-top)+2rem)] pb-[calc(env(safe-area-inset-bottom)+clamp(2rem,12dvh,5.5rem))] text-foreground"
    >
      <div className="mx-auto mt-auto w-full max-w-sm">
        <div className="mb-[clamp(2.25rem,9dvh,4.5rem)] h-12 w-32 overflow-hidden">
          {logoUnavailable ? (
            <p className="text-4xl leading-12 font-bold tracking-tight text-link">YPOS</p>
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
          <h1 className="text-[2rem] leading-tight font-bold tracking-tight text-link">Hello,</h1>
          <p className="text-sm text-muted-foreground">
            Masuk untuk mulai mengelola bisnis Anda hari ini.
          </p>
        </header>
        <form onSubmit={submit} className="space-y-4" aria-busy={busy}>
          <div className="space-y-1">
            <label htmlFor="username" className="block text-sm font-medium">
              Username
            </label>
            <div className="relative">
              <UserRound
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
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
                className="h-11 rounded-2xl border-border bg-card pl-9 shadow-xs"
              />
            </div>
          </div>
          <div className="space-y-1">
            <label htmlFor="password" className="block text-sm font-medium">
              Password
            </label>
            <div className="relative">
              <LockKeyhole
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
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
                className="h-11 rounded-2xl border-border bg-card pr-11 pl-9 shadow-xs"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={busy}
                onClick={() => setVisible((value) => !value)}
                className="absolute top-1/2 right-1.5 -translate-y-1/2 text-muted-foreground"
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
          <label className="flex min-h-6 w-fit items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="rememberme"
              checked={remember}
              disabled={busy}
              onChange={(event) => setRemember(event.target.checked)}
              className="size-4 accent-primary"
            />
            Ingat saya
          </label>
          <Button
            type="submit"
            loading={busy}
            disabled={!username.trim() || !password}
            className="w-full rounded-2xl shadow-sm"
          >
            Login
          </Button>
        </form>
      </div>
    </main>
  );
}
