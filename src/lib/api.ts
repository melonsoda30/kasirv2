import axios from 'axios'
import type { AxiosRequestConfig, InternalAxiosRequestConfig } from 'axios'
import { getAuthSession, hasValidRefreshToken, useAuthStore, type AuthSession } from '../features/auth/auth-store'
import { readAuthSession, type AuthSessionResponse } from '../features/auth/session-tokens'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://kasirv2.dhcsupplement.co.id/API'
export const authUrl = '/login.php'

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  headers: { Accept: 'application/json' },
})

type AuthRequestConfig = InternalAxiosRequestConfig & { sessionVersion?: number; authRetried?: boolean }

let pendingRefresh: { version: number; token: string; promise: Promise<AuthSession> } | undefined

async function rotateSession(session: AuthSession, version: number, refreshToken: string) {
  const isCurrent = () => {
    const current = useAuthStore.getState()
    return current.sessionVersion === version && current.session?.token === session.token
  }
  const data = new FormData()
  data.set('action', 'refresh')
  data.set('refresh_token', refreshToken)
  let response: AuthSessionResponse
  try {
    response = await request<AuthSessionResponse>({ url: authUrl, method: 'POST', data })
  } catch (error) {
    if (axios.isAxiosError(error) && error.response?.status === 401 && isCurrent()) {
      useAuthStore.getState().clearSession()
    }
    throw error
  }

  try {
    const next = readAuthSession(response, 'Sesi gagal diperbarui. Silakan login kembali.')
    if (!next.refresh || !next.sessionId ||
      (session.sessionId && next.sessionId !== session.sessionId) ||
      (session.account.account_id && next.account.account_id !== session.account.account_id)) {
      throw new Error('Token sesi tidak valid dari server.')
    }
    if (isCurrent()) {
      const { account, ...tokens } = next
      useAuthStore.getState().replaceSessionTokens(session.token, tokens, account)
    }
    return next
  } catch (error) {
    if (isCurrent()) useAuthStore.getState().clearSession()
    throw error
  }
}

export function refreshAuthSession(force = false) {
  const { session, sessionVersion } = useAuthStore.getState()
  if (pendingRefresh?.version === sessionVersion && pendingRefresh.token === session?.token) return pendingRefresh.promise
  const current = getAuthSession()
  if (!current?.refresh || !hasValidRefreshToken(current) || (!force && current.expiresAt > Date.now())) return

  const promise = rotateSession(current, sessionVersion, current.refresh.token).finally(() => {
    if (pendingRefresh?.promise === promise) pendingRefresh = undefined
  })
  pendingRefresh = { version: sessionVersion, token: current.token, promise }
  return promise
}

export async function logoutSession() {
  const { session, sessionVersion, clearSession } = useAuthStore.getState()
  if (!session) return
  const refresh = pendingRefresh?.version === sessionVersion ? pendingRefresh.promise : undefined
  clearSession()
  // An in-flight refresh may have rotated the token before logout.
  const current = (await refresh?.catch(() => undefined)) ?? session
  const token = hasValidRefreshToken(current) ? current.refresh?.token : current.token
  const data = new FormData()
  data.set('action', 'logout')
  const response = await request<{ status?: string; msg?: string }>({
    url: authUrl, method: 'POST', data, headers: { Authorization: `Bearer ${token}` },
  })
  if (response?.status !== 'success') throw new Error(response?.msg || 'Gagal mengakhiri sesi di server.')
}

api.interceptors.request.use(async (config: AuthRequestConfig) => {
  if (config.url === authUrl) return config
  const { sessionVersion } = useAuthStore.getState()
  if (config.sessionVersion !== undefined && config.sessionVersion !== sessionVersion) throw new axios.CanceledError('Sesi berubah.')

  const refresh = refreshAuthSession()
  if (refresh) {
    try {
      await refresh
    } catch (error) {
      const current = getAuthSession()
      if (!current || current.expiresAt <= Date.now()) throw error
    }
    if (sessionVersion !== useAuthStore.getState().sessionVersion) throw new axios.CanceledError('Sesi berubah.')
  }
  const session = getAuthSession()
  if (session) {
    config.sessionVersion = sessionVersion
    config.headers.set('Authorization', `Bearer ${session.token}`)
  }
  else config.headers.delete('Authorization')
  return config
})

api.interceptors.response.use((response) => response, async (error: unknown) => {
  if (!axios.isAxiosError(error) || error.response?.status !== 401) throw error
  const config: AuthRequestConfig | undefined = error.config
  if (!config || config.url === authUrl || config.signal?.aborted) throw error

  const { session, sessionVersion, clearSession } = useAuthStore.getState()
  if (!session || config.sessionVersion !== sessionVersion) throw error
  const usedCurrentToken = config.headers.get('Authorization') === `Bearer ${session.token}`
  if (config.authRetried) {
    if (usedCurrentToken) clearSession()
    throw error
  }
  if (usedCurrentToken) {
    const refresh = refreshAuthSession(true)
    if (!refresh) {
      if (useAuthStore.getState().sessionVersion === sessionVersion) clearSession()
      throw error
    }
    await refresh
  }
  config.authRetried = true
  return api.request(config)
})

export function isEmptyListResponse(response: unknown) {
  if (Array.isArray(response)) return response.length === 0
  if (!response || typeof response !== 'object' || !('data' in response) ||
    !Array.isArray(response.data) || response.data.length !== 0) return false

  if (!('status' in response) || response.status === 'success') return true
  return 'msg' in response && typeof response.msg === 'string' &&
    /^(?:no data(?: yet)?|tidak ada data|belum ada data)[.!]?$/i.test(response.msg.trim())
}

/** Returns the response body. Axios errors retain their status and response. */
export async function request<TResponse, TBody = unknown>(
  config: AxiosRequestConfig<TBody>,
): Promise<TResponse> {
  const response = await api.request<TResponse>(config)
  return response.data
}
