import { useState } from "react";
import { toast } from "sonner";
import type { FormEvent } from "react";
import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Eye, EyeOff } from "lucide-react";
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
      className="flex min-h-dvh items-center justify-center bg-background px-5 py-10"
    >
      <div className="w-full max-w-sm space-y-6">
        <form onSubmit={submit} className="space-y-4" aria-busy={busy}>
          <div className="space-y-2">
            <label htmlFor="username" className="text-sm font-medium">
              Username
            </label>
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
              className="h-11"
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={visible ? "text" : "password"}
                autoComplete="current-password"
                required
                disabled={busy}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 pr-11"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                disabled={busy}
                onClick={() => setVisible((value) => !value)}
                className="absolute top-1.5 right-1.5"
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
          <label className="flex min-h-10 items-center gap-2 text-sm">
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
            className="h-11 w-full"
          >
            Masuk
          </Button>
        </form>
      </div>
    </main>
  );
}
