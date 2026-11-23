import { create } from 'zustand'

export interface Branch {
  id: string
  name: string
}

export interface Account {
  account_img: string
  account_username: string
  account_fullname: string
  account_email: string
  account_phone: string
  account_address: string
  account_id: string
  account_level?: string
  account_role?: string
  store?: {
    id: string; name: string; city: string; address: string; all_branches: boolean
    branch_id?: string
    branches: Branch[] | { id: string; name: string[] }
  }
  event_id: string
  event_level: string
  event_location: string
  event_shift: string
}

export function getAccountBranches(store: Account['store']): Branch[] {
  const branches = store?.branches
  if (Array.isArray(branches)) return branches
  return (branches?.name ?? []).map((id) => ({ id, name: id }))
}

export function isAdminAccount(account: Account | undefined) {
  const role = account?.account_role?.trim().toLowerCase()
  if (role) return role === 'admin' || role === 'administrator'
  return (account?.event_level || account?.account_level || '').toLowerCase().includes('admin')
}

export function isCashierEventLevel(eventLevel: string | undefined) {
  return eventLevel?.trim().toLowerCase() === 'kasir'
}

export interface AuthSession {
  account: Account
  cashierBranchId?: string
  token: string
  expiresAt: number
  sessionId?: string
  refresh?: { token: string; expiresAt: number }
}

export function usesCashierMode(session: AuthSession | null) {
  return isCashierEventLevel(session?.account.event_level) || !!getCashierBranch(session)
}

export function getCashierBranches(store: Account['store']) {
  return getAccountBranches(store).filter(({ id }) =>
    id && id !== 'all' && (store?.all_branches || id === store?.branch_id))
}

export function getCashierBranch(session: AuthSession | null) {
  if (!session?.cashierBranchId || !isAdminAccount(session.account)) return undefined
  return getCashierBranches(session.account.store).find(({ id }) => id === session.cashierBranchId)
}

const key = 'kasirv2.auth'

function readSession(): AuthSession | null {
  for (const storage of [sessionStorage, localStorage]) {
    try {
      const raw = storage.getItem(key)
      if (!raw) continue
      const session = JSON.parse(raw) as AuthSession
      if (typeof session.token === 'string' && session.token &&
          typeof session.expiresAt === 'number' && session.expiresAt > Date.now() &&
          typeof session.account?.account_username === 'string') return session
      storage.removeItem(key)
    } catch { /* An unavailable or invalid stored session requires login. */ }
  }
  return null
}

export const useAuthStore = create<{
  session: AuthSession | null
  setSession: (session: AuthSession, remember: boolean) => void
  setCashierBranch: (branchId?: string) => boolean
  replaceSessionTokens: (previousToken: string, tokens: Omit<AuthSession, 'account' | 'cashierBranchId'>) => boolean
  clearSession: () => void
  updateAccount: (account: Partial<Account>) => void
}>((set, get) => ({
  session: readSession(),
  updateAccount: (account) => {
    const current = get().session
    if (!current) return
    const session = { ...current, account: { ...current.account, ...account } }
    const storage = localStorage.getItem(key) ? localStorage : sessionStorage
    storage.setItem(key, JSON.stringify(session))
    set({ session })
  },
  setSession: (session, remember) => {
    // Storage must succeed before treating login as complete.
    localStorage.removeItem(key)
    sessionStorage.removeItem(key)
    ;(remember ? localStorage : sessionStorage).setItem(key, JSON.stringify(session))
    set({ session })
  },
  setCashierBranch: (branchId) => {
    const current = get().session
    if (!current || !isAdminAccount(current.account)) return false
    const session = { ...current, cashierBranchId: branchId }
    if (branchId !== undefined && !getCashierBranch(session)) return false
    try {
      const storage = localStorage.getItem(key) ? localStorage : sessionStorage
      storage.setItem(key, JSON.stringify(session))
    } catch { /* Keep the current mode if storage is unavailable. */ }
    set({ session })
    return true
  },
  replaceSessionTokens: (previousToken, tokens) => {
    const { session, setSession } = get()
    if (!session || session.token !== previousToken) return false
    setSession({
      account: session.account,
      ...(session.cashierBranchId && { cashierBranchId: session.cashierBranchId }),
      ...tokens,
    }, !!localStorage.getItem(key))
    return true
  },
  clearSession: () => {
    for (const storage of [localStorage, sessionStorage]) {
      try { storage.removeItem(key) } catch { /* Still clear the in-memory session. */ }
    }
    set({ session: null })
  },
}))

export function getAuthSession() {
  const { session, clearSession } = useAuthStore.getState()
  if (session && session.expiresAt <= Date.now()) {
    clearSession()
    return null
  }
  return session
}

export function safeRedirect(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/') ||
      value.startsWith('//') || /[\\\u0000-\u0020]/.test(value)) return '/'
  try {
    const url = new URL(value, 'https://kasir.invalid')
    if (url.origin !== 'https://kasir.invalid' || url.pathname.replace(/\/+$/, '') === '/login') return '/'
    return `${url.pathname}${url.search}${url.hash}`
  } catch { return '/' }
}
