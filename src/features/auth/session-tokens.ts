import type { Account, AuthSession } from "./auth-store";

export interface SessionTokenResponse {
  token?: string;
  expired?: number;
  access?: { token: string; expires_in: number; session_id: string };
  refresh?: { token: string; expires_in: number };
}

export function readSessionTokens(payload: SessionTokenResponse): Omit<AuthSession, "account" | "adminBranchId" | "cashierBranchId"> {
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
    remainingDays: typeof payload.expired === "number" && Number.isFinite(payload.expired) && payload.expired >= 0
      ? payload.expired
      : undefined,
    sessionId: access?.session_id,
    refresh: refresh && typeof refresh.token === "string" && refresh.token.trim() &&
      Number.isFinite(refreshLifetimeMs) && refreshLifetimeMs > 0
      ? { token: refresh.token, expiresAt: now + refreshLifetimeMs }
      : undefined,
  };
}

export interface AuthSessionResponse {
  status: string;
  msg?: string;
  message?: string;
  data?: SessionTokenResponse & {
    user: {
      id: string; img: string; username: string; fullname: string; email: string;
      phone: string; address: string; level: string; level_slug: string; role: string;
    };
    store: NonNullable<Account["store"]>;
  };
}

export function readAuthSession(response: AuthSessionResponse, fallback: string): AuthSession {
  const payload = response?.data;
  if (response?.status !== "success" || !payload ||
      typeof payload.user?.username !== "string" || !payload.user.username ||
      typeof payload.user.id !== "string" || !payload.user.id ||
      typeof payload.store?.id !== "string" || !payload.store.id) {
    throw new Error(response?.msg || response?.message || fallback);
  }
  const { user, store } = payload;
  const account: Account = {
    account_id: user.id, account_img: user.img || "", account_username: user.username,
    account_fullname: user.fullname || "", account_email: user.email || "",
    account_phone: user.phone || "", account_address: user.address || "",
    account_level: user.level, account_role: user.role,
    event_id: store.id, event_location: store.name, event_level: user.level_slug,
    event_shift: "", store,
  };
  return { account, ...readSessionTokens(payload) };
}
