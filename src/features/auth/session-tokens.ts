import type { AuthSession } from "./auth-store";

export interface SessionTokenResponse {
  token?: string;
  expired?: number;
  access?: { token: string; expires_in: number; session_id: string };
  refresh?: { token: string; expires_in: number };
}

export function readSessionTokens(payload: SessionTokenResponse): Omit<AuthSession, "account" | "cashierBranchId"> {
  const { access, refresh } = payload;
  const token = access ? access.token : payload.token;
  if (typeof token !== "string" || !token.trim()) {
    throw new Error("Token sesi tidak valid dari server.");
  }
  const lifetimeMs = access ? access.expires_in * 1000 : Number(payload.expired) * 86_400_000;
  if (!Number.isFinite(lifetimeMs) || lifetimeMs <= 0) {
    throw new Error("Masa berlaku sesi tidak valid dari server.");
  }
  const now = Date.now();
  const refreshLifetimeMs = refresh ? refresh.expires_in * 1000 : 0;
  return {
    token,
    expiresAt: now + lifetimeMs,
    sessionId: access?.session_id,
    refresh: refresh && typeof refresh.token === "string" && refresh.token.trim() &&
      Number.isFinite(refreshLifetimeMs) && refreshLifetimeMs > 0
      ? { token: refresh.token, expiresAt: now + refreshLifetimeMs }
      : undefined,
  };
}
