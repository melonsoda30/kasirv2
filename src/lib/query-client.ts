import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query'
import { isAxiosError } from 'axios'
import { toast } from 'sonner'

interface ToastMeta extends Record<string, unknown> {
  toast?: false | { success?: string | false; error?: string | false }
}

declare module '@tanstack/react-query' {
  interface Register {
    queryMeta: ToastMeta
    mutationMeta: ToastMeta
  }
}

function errorMessage(error: unknown, fallback: string): string {
  if (isAxiosError<{ message?: unknown }>(error)) {
    const message = error.response?.data?.message
    if (typeof message === 'string' && message.trim()) return message
    if (!error.response) return 'Tidak dapat terhubung ke server. Silakan coba lagi.'
  }
  return fallback
}

function showError(error: unknown, meta: ToastMeta | undefined, fallback: string, id: string) {
  if (meta?.toast === false || meta?.toast?.error === false) return
  toast.error(meta?.toast?.error ?? errorMessage(error, fallback), { id })
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      showError(error, query.meta, 'Gagal memuat data.', `query:${query.queryHash}`)
    },
  }),
  mutationCache: new MutationCache({
    onSuccess: (_data, _variables, _context, mutation) => {
      const settings = mutation.meta?.toast
      if (settings === false || settings?.success === false) return
      toast.success(settings?.success ?? 'Perubahan berhasil disimpan.')
    },
    onError: (error, _variables, _context, mutation) => {
      showError(error, mutation.meta, 'Gagal menyimpan perubahan.', `mutation:${mutation.mutationId}`)
    },
  }),
  defaultOptions: {
    queries: { staleTime: 60_000, retry: 1 },
    mutations: { retry: false },
  },
})
