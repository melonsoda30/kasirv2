export function getErrorMessages(errors: readonly unknown[]): string[] {
  return [...new Set(errors.flatMap((error) => {
    if (typeof error === 'string') return error ? [error] : []
    if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
      return error.message ? [error.message] : []
    }
    return []
  }))]
}
