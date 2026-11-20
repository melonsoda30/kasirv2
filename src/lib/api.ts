import axios from 'axios'
import type { AxiosRequestConfig } from 'axios'
import { getAuthSession, useAuthStore } from '../features/auth/auth-store'

export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://kasirv2.dhcsupplement.co.id/API'

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15_000,
  headers: { Accept: 'application/json' },
})

api.interceptors.request.use((config) => {
  const session = getAuthSession()
  if (session && config.url !== '/login') config.headers.set('Authorization', `Bearer ${session.token}`)
  else config.headers.delete('Authorization')
  return config
})

api.interceptors.response.use((response) => response, (error: unknown) => {
  if (axios.isAxiosError(error) && error.response?.status === 401 && error.config?.url !== '/login') {
    const { session, clearSession } = useAuthStore.getState()
    if (session && error.config?.headers.get('Authorization') === `Bearer ${session.token}`) {
      clearSession()
    }
  }
  return Promise.reject(error)
})

/** Returns the response body. Axios errors retain their status and response. */
export async function request<TResponse, TBody = unknown>(
  config: AxiosRequestConfig<TBody>,
): Promise<TResponse> {
  const response = await api.request<TResponse>(config)
  return response.data
}
