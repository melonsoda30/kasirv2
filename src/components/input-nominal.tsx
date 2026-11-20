import type { ComponentProps, Ref } from 'react'
import { NumericFormat } from 'react-number-format'
import { Input } from '@/components/ui/input'
import { nominalInputFormat } from '@/lib/currency'

export type InputNominalProps = Omit<ComponentProps<typeof Input>,
  'type' | 'value' | 'defaultValue' | 'onChange' | 'ref' | 'inputMode'
> & {
  value: string | number
  /** Receives the unformatted numeric string ("18000"), or "" when cleared. */
  onValueChange: (value: string) => void
  ref?: Ref<HTMLInputElement>
}

export function InputNominal({ value, onValueChange, ref, ...props }: InputNominalProps) {
  return (
    <NumericFormat
      {...props}
      {...nominalInputFormat}
      customInput={Input}
      getInputRef={ref}
      type="text"
      inputMode="numeric"
      value={value}
      valueIsNumericString
      onValueChange={(values, source) => {
        if (source.source === 'event') onValueChange(values.value)
      }}
    />
  )
}
