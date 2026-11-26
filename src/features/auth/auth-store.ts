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
  adminBranchId?: string
  cashierBranchId?: string
  token: string
  expiresAt: number
  remainingDays?: number
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

export function isAdminMode(session: AuthSession | null) {
  return !!session && isAdminAccount(session.account) && !usesCashierMode(session)
}

const allBranches: Branch = { id: 'all', name: 'Semua cabang' }

export function getBranchFilterId(branchId?: string) {
  const id = branchId?.trim()
  return id && id !== allBranches.id ? id : undefined
}

export function getAdminBranches(account: Account) {
  const branches = getCashierBranches(account.store)
  const branchId = getBranchFilterId(account.store?.branch_id)
  if (!branches.length && branchId) branches.push({ id: branchId, name: branchId })
  return account.store?.all_branches === true ? [allBranches, ...branches] : branches
}

export function getAdminBranch(session: AuthSession | null) {
  if (!session?.adminBranchId || !isAdminMode(session)) return undefined
  return getAdminBranches(session.account).find(({ id }) => id === session.adminBranchId)
}

function adminBranchPreferenceKey(account: Account) {
  return `kasirv2.admin-branch:${JSON.stringify([account.account_id || account.account_username, account.store?.id ?? account.event_id])}`
}

export function getSuggestedAdminBranch(account: Account) {
  const branches = getAdminBranches(account)
  let previous: string | null = null
  try { previous = localStorage.getItem(adminBranchPreferenceKey(account)) } catch { /* Use the account default. */ }
  return branches.find(({ id }) => id === previous) ?? branches.find(({ id }) => id === account.store?.branch_id) ??
    (branches.length === 1 ? branches[0] : undefined)
}

const key = 'kasirv2.auth'

export function hasValidRefreshToken(session: AuthSession) {
  return typeof session.refresh?.token === 'string' && !!session.refresh.token && session.refresh.expiresAt > Date.now()
}

function readSession(): AuthSession | null {
  for (const storage of [sessionStorage, localStorage]) {
    try {
      const raw = storage.getItem(key)
      if (!raw) continue
      const session = JSON.parse(raw) as AuthSession
      if (typeof session.token === 'string' && session.token &&
          typeof session.expiresAt === 'number' && (session.expiresAt > Date.now() || hasValidRefreshToken(session)) &&
          typeof session.account?.account_username === 'string') return session
      storage.removeItem(key)
    } catch { /* An unavailable or invalid stored session requires login. */ }
  }
  return null
}

export const useAuthStore = create<{
  session: AuthSession | null
  sessionVersion: number
  setSession: (session: AuthSession, remember: boolean) => void
  setAdminBranch: (branchId: string) => boolean
  setCashierBranch: (branchId?: string) => boolean
  replaceSessionTokens: (previousToken: string, tokens: Omit<AuthSession, 'account' | 'adminBranchId' | 'cashierBranchId'>, account?: Account) => boolean
  clearSession: () => void
  updateAccount: (account: Partial<Account>) => void
}>((set, get) => ({
  session: readSession(),
  sessionVersion: 0,
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
    set(({ sessionVersion }) => ({ session, sessionVersion: sessionVersion + 1 }))
  },
  setAdminBranch: (branchId) => {
    const current = get().session
    if (!current || !isAdminMode(current) || !getAdminBranches(current.account).some(({ id }) => id === branchId)) return false
    const session = { ...current, adminBranchId: branchId }
    try {
      const storage = localStorage.getItem(key) ? localStorage : sessionStorage
      storage.setItem(key, JSON.stringify(session))
    } catch { /* Keep the selection in memory when session storage is unavailable. */ }
    try { localStorage.setItem(adminBranchPreferenceKey(current.account), branchId) } catch { /* Preferences are optional. */ }
    set({ session })
    return true
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
  replaceSessionTokens: (previousToken, tokens, account) => {
    const current = get().session
    if (!current || current.token !== previousToken) return false
    const session = { ...current, ...tokens, account: account ?? current.account }
    if (account) {
      const sameStore = (account.store?.id ?? account.event_id) === (current.account.store?.id ?? current.account.event_id)
      if (!sameStore || !isAdminAccount(account) || !getAdminBranches(account).some(({ id }) => id === session.adminBranchId)) {
        delete session.adminBranchId
      }
      if (!sameStore || !getCashierBranch(session)) delete session.cashierBranchId
    }
    const storage = localStorage.getItem(key) ? localStorage : sessionStorage
    storage.setItem(key, JSON.stringify(session))
    set({ session })
    return true
  },
  clearSession: () => {
    for (const storage of [localStorage, sessionStorage]) {
      try { storage.removeItem(key) } catch { /* Still clear the in-memory session. */ }
    }
    set(({ sessionVersion }) => ({ session: null, sessionVersion: sessionVersion + 1 }))
  },
}))

export function getAuthSession() {
  const { session, clearSession } = useAuthStore.getState()
  if (session && session.expiresAt <= Date.now() && !hasValidRefreshToken(session)) {
    clearSession()
    return null
  }
  return session
}

export function safeRedirect(value: unknown) {
  if (typeof value !== 'string' || !value.startsWith('/') ||
      value.startsWith('//') || [...value].some((character) => character <= ' ' || character === '\\')) return '/'
  try {
    const url = new URL(value, 'https://kasir.invalid')
    if (url.origin !== 'https://kasir.invalid' || url.pathname.replace(/\/+$/, '') === '/login') return '/'
    return `${url.pathname}${url.search}${url.hash}`
  } catch { return '/' }
}
