import { useMemo } from 'react'
import type { ComponentProps } from 'react'
import { cn } from 'cn'
import {
  Combobox, ComboboxInput, ComboboxContent, ComboboxEmpty, ComboboxList, ComboboxItem, ComboboxTrigger,
} from '@/components/ui/combobox'

export type ComboboxOption = string | { value: string; label: string; disabled?: boolean }

export type SelectComboboxProps = Omit<ComponentProps<typeof ComboboxInput>,
  'value' | 'defaultValue' | 'onChange' | 'disabled'
> & {
  options: readonly ComboboxOption[]
  value: string
  onChange: (value: string) => void
  disabled?: boolean
  /** Enable text search. Disable to open the options without a mobile keyboard. */
  searchable?: boolean
  invalid?: boolean
  emptyMessage?: string
}

/** A single select with optional search. Supports plain strings or separate labels and IDs. */
export function SelectCombobox({ options, value, onChange, disabled = false, invalid,
  searchable = true, emptyMessage = 'Tidak ditemukan.', ...inputProps }: SelectComboboxProps) {
  const items = useMemo(() => options.map((option) => typeof option === 'string' ? { value: option, label: option } : option), [options])
  const byValue = new Map(items.map((item) => [item.value, item]))
  return (
    <Combobox items={items} value={byValue.get(value) ?? null}
      key={String(searchable)}
      filter={searchable ? (item, query) => item.label.toLocaleLowerCase('id-ID').includes(query.trim().toLocaleLowerCase('id-ID')) : null}
      itemToStringLabel={(item) => item.label}
      itemToStringValue={(item) => item.value}
      isItemEqualToValue={(item, selected) => item.value === selected.value}
      disabled={disabled} onValueChange={(next) => onChange(next?.value ?? '')}>
      {searchable ? (
        <ComboboxInput {...inputProps} disabled={disabled} aria-invalid={invalid ?? inputProps['aria-invalid']} />
      ) : (
        <ComboboxTrigger
          id={inputProps.id}
          disabled={disabled}
          aria-label={inputProps['aria-label']}
          aria-labelledby={inputProps['aria-labelledby']}
          aria-describedby={inputProps['aria-describedby']}
          aria-invalid={invalid ?? inputProps['aria-invalid']}
          className={cn('flex h-8 w-full min-w-0 items-center justify-between gap-2 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 aria-invalid:border-destructive dark:bg-input/30', inputProps.className)}
        >
          <span className={cn('truncate', !value && 'text-muted-foreground')}>
            {byValue.get(value)?.label ?? (value || inputProps.placeholder)}
          </span>
        </ComboboxTrigger>
      )}
      <ComboboxContent>
        <ComboboxEmpty>{emptyMessage}</ComboboxEmpty>
        <ComboboxList>{(item: { value: string; label: string; disabled?: boolean }) => (
          <ComboboxItem key={item.value} value={item} disabled={item.disabled}>
            {item.label}
          </ComboboxItem>
        )}</ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
