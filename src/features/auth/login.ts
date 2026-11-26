import { isAxiosError } from 'axios'
import { authUrl, request } from '../../lib/api'
import { readAuthSession, type AuthSessionResponse } from './session-tokens'

export async function login(username: string, password: string) {
  const data = new FormData()
  data.set('action', 'login')
  data.set('username', username.trim())
  data.set('password', password)
  const response = await request<AuthSessionResponse>({ url: authUrl, method: 'POST', data })
  return readAuthSession(response, 'Login gagal. Periksa username dan password Anda.')
}

export function loginError(error: unknown) {
  if (isAxiosError(error)) {
    const data = error.response?.data
    const message = typeof data === 'string' ? data : data?.msg ?? data?.message
    if (typeof message === 'string') return message
    return error.response ? 'Login gagal. Periksa username dan password Anda.' : 'Tidak dapat terhubung ke server. Silakan coba lagi.'
  }
  return error instanceof Error ? error.message : 'Login gagal. Silakan coba lagi.'
}
