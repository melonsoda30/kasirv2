import { isAxiosError } from 'axios'
import { z } from 'zod'
import { getBranchFilterId } from '@/features/auth/auth-store'
import { isEmptyListResponse, request } from '@/lib/api'

const amount = z.coerce.number().finite()
const text = z.string().nullish().transform((value) => value ?? '')
const identifier = z.union([z.string(), z.number()]).transform(String)
const sessionSchema = z.object({
  session_id: z.string().min(1),
  status: z.enum(['open', 'closed']),
  user_name: text,
  branch_id: text,
  shift_title: text,
  shift_date: text,
  shift_start: text,
  shift_end: text,
  opened_at: text,
  closed_at: text,
  opening_cash: amount,
  closing_cash: amount.nullish(),
  cash_in: amount,
  expected_cash: amount,
  omzet: amount,
  pending_count: amount.default(0),
  pending_ids: z.array(z.string()).default([]),
  handover_to_name: text,
  handover_to_user: identifier.nullish(),
  handover_amount: amount.nullish(),
  handover_from_user_name: text,
  handover_mismatch: amount.nullish(),
  notes: text,
  close_type: text,
  close_notes: text,
  closed_by_name: text,
  difference_exceeded: z.boolean().optional(),
})
export type CashSession = z.output<typeof sessionSchema>

const shiftSchema = z.object({ code: z.string(), title: z.string(), start_time: text, end_time: text })
const currentSchema = z.object({
  mode: z.enum(['none', 'shift']),
  use_session: z.boolean(),
  session: sessionSchema.nullish().transform((session) => session ?? null),
  selectable: z.array(shiftSchema).default([]),
  shift_list: z.array(shiftSchema).default([]),
  cash_tolerance: amount.default(0),
})
export type CurrentCashSession = z.output<typeof currentSchema>

const responseSchema = z.object({ status: z.string(), msg: z.string().optional(), data: z.unknown(), warning: z.string().nullish(), pending_ids: z.array(z.string()).optional() })
const pendingIdsSchema = z.object({ pending_ids: z.array(z.string()).optional(), data: z.object({ pending_ids: z.array(z.string()).optional() }).nullish() })

export function formatShiftMessage(message: string) {
  return message.replace(/\bsesi\s+kas\b/gi, (term) => term[0] === 's' ? 'shift' : 'Shift')
}

export class CashSessionError extends Error {
  readonly status?: number
  readonly pendingIds: string[]

  constructor(message: string, status?: number, pendingIds: string[] = []) {
    super(formatShiftMessage(message))
    this.status = status
    this.pendingIds = pendingIds
  }
}

async function shiftRequest<T>(action: string, schema: z.ZodType<T>, options: {
  fields?: Record<string, string>; filters?: Record<string, string>; signal?: AbortSignal;
  emptyData?: T;
} = {}) {
  const { fields, filters, signal, emptyData } = options
  try {
    const raw = await request<unknown>({
      url: '/transaction/shift.php', method: fields ? 'POST' : 'GET', signal,
      params: { action, ...filters }, data: fields && new URLSearchParams(fields),
    })
    if (emptyData !== undefined && isEmptyListResponse(raw)) return { data: emptyData, warning: undefined }
    const response = responseSchema.safeParse(raw)
    if (response.success && response.data.status !== 'success') {
      const pending = pendingIdsSchema.safeParse(raw)
      throw new CashSessionError(response.data.msg || 'Permintaan shift gagal.', undefined,
        pending.data?.pending_ids ?? pending.data?.data?.pending_ids)
    }
    const parsed = schema.safeParse(response.data?.data)
    if (!response.success || !parsed.success) throw new CashSessionError('Format data shift tidak valid.')
    const warning = response.data.warning
    return { data: parsed.data, warning: warning && formatShiftMessage(warning) }
  } catch (error) {
    if (isAxiosError<{ msg?: string }>(error) && error.response) {
      const { data, status } = error.response
      const pending = pendingIdsSchema.safeParse(data)
      throw new CashSessionError(data?.msg || 'Permintaan shift gagal.', status, pending.data?.pending_ids ?? pending.data?.data?.pending_ids)
    }
    throw error
  }
}

export const fetchCurrentCashSession = (signal?: AbortSignal) =>
  shiftRequest('current_session', currentSchema, { signal }).then(({ data }) => data)
export const fetchHandoverCandidates = (signal?: AbortSignal) =>
  shiftRequest('handover_candidates', z.array(z.object({ id: identifier, fullname: z.string() })), { signal, emptyData: [] }).then(({ data }) => data)
export const fetchPendingHandovers = (signal?: AbortSignal) =>
  shiftRequest('handover_pending', z.array(sessionSchema), { signal, emptyData: [] }).then(({ data }) => data)
export const openCashSession = (fields: { shift_code: string; opening_cash: string; notes: string; handover_session_id?: string }) =>
  shiftRequest('open_session', sessionSchema, { fields })
export const closeCashSession = (fields: { session_id: string; closing_cash: string; close_notes: string }, force = false) =>
  shiftRequest(force ? 'force_close_session' : 'close_session', sessionSchema, { fields })
export const handoverCashSession = (fields: { session_id: string; to_user: string; amount: string; notes: string }) =>
  shiftRequest('handover', z.object({ carry_over_note: text }), { fields })

const cashSessionList = z.object({ sessions: z.array(sessionSchema), count: amount.optional() })
  .refine(({ sessions, count }) => sessions.length === 0 || count !== undefined)
  .transform(({ sessions, count }) => ({ sessions, count: count ?? 0 }))

export const fetchCashSessions = ({ branch_id, ...filters }: Record<string, string>, signal?: AbortSignal) => {
  const branchId = getBranchFilterId(branch_id)
  return shiftRequest('list_session', cashSessionList, {
    filters: { ...filters, ...(branchId && { branch_id: branchId }) },
    signal,
    emptyData: { sessions: [], count: 0 },
  }).then(({ data }) => data)
}

const reportTransactionSchema = z.object({
  id_trx: identifier,
  date: text,
  total: amount,
  payment_method: text,
  trx_payment: text,
  status: text,
}).transform(({ payment_method, trx_payment, ...transaction }) => ({
  ...transaction,
  payment_method: payment_method.trim() || trx_payment.trim(),
}))
export type CashSessionReportTransaction = z.output<typeof reportTransactionSchema>

export const fetchCashSessionReport = (sessionId: string, signal?: AbortSignal) =>
  shiftRequest('session_report', z.object({
    session: sessionSchema,
    transactions: z.array(reportTransactionSchema),
    by_method: z.array(z.object({ method: z.string(), count: amount, total: amount })),
  }), { filters: { session_id: sessionId }, signal }).then(({ data }) => data)

export { fetchCashSessionExport } from '@/features/reports/report-api'
