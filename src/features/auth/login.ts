import { isAxiosError } from 'axios'
import { request } from '../../lib/api'
import type { Account, AuthSession } from './auth-store'
import { readSessionTokens, type SessionTokenResponse } from './session-tokens'

interface LoginResponse {
  status: string
  msg?: string
  message?: string
  data?: SessionTokenResponse & {
    user: {
      id: string; img: string; username: string; fullname: string; email: string
      phone: string; address: string; level: string; level_slug: string; role: string
    }
    store: NonNullable<Account['store']>
  }
}

export async function login(username: string, password: string, remember: boolean): Promise<AuthSession> {
  const data = new FormData()
  data.set('action', 'login')
  data.set('username', username.trim())
  data.set('password', password)
  data.set('rememberme', remember ? '1' : '0')
  const response = await request<LoginResponse>({ url: '/login', method: 'POST', data })
  const payload = response?.data
  const token = payload?.access ? payload.access.token : payload?.token
  if (response?.status !== 'success' || !payload || typeof token !== 'string' || !token.trim() ||
      typeof payload.user?.username !== 'string' || !payload.user.username ||
      typeof payload.user.id !== 'string' || !payload.user.id ||
      typeof payload.store?.id !== 'string' || !payload.store.id) {
    throw new Error(response?.msg || response?.message || 'Login gagal. Periksa username dan password Anda.')
  }
  const { user, store } = payload
  const account: Account = {
    account_id: user.id, account_img: user.img || '', account_username: user.username,
    account_fullname: user.fullname || '', account_email: user.email || '',
    account_phone: user.phone || '', account_address: user.address || '',
    account_level: user.level, account_role: user.role,
    event_id: store.id, event_location: store.name, event_level: user.level_slug,
    event_shift: '', store,
  }
  return { account, ...readSessionTokens(payload) }
}

export function loginError(error: unknown) {
  if (isAxiosError(error)) {
    const message = error.response?.data?.msg ?? error.response?.data?.message
    if (typeof message === 'string') return message
    return error.response ? 'Login gagal. Periksa username dan password Anda.' : 'Tidak dapat terhubung ke server. Silakan coba lagi.'
  }
  return error instanceof Error ? error.message : 'Login gagal. Silakan coba lagi.'
}
