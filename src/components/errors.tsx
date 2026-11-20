import type { ComponentProps } from 'react'
import { cn } from 'cn'
import { getErrorMessages } from '@/lib/error-messages'

export function Errors({ errors, className, ...props }: ComponentProps<'p'> & {
  errors: readonly unknown[]
}) {
  const messages = getErrorMessages(errors)
  if (!messages.length) return null
  return (
    <p role="alert" className={cn('text-xs text-destructive', className)} {...props}>
      {messages.join(' ')}
    </p>
  )
}
