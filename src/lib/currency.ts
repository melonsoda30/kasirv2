const nominalFormatter = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 0,
})

const currencyFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
})

/** Accepts an unformatted number or numeric string, e.g. 18000 or "18000". */
export function formatCurrency(value: number | string): string {
  return currencyFormatter.format(Number(value))
}

/** Rupiah amounts without the currency symbol; preserves an empty input. */
export function formatNominal(value: number | string): string {
  return value === '' ? '' : nominalFormatter.format(Number(value))
}

export const nominalInputFormat = {
  thousandSeparator: '.',
  decimalSeparator: ',',
  decimalScale: 0,
  allowNegative: false,
} as const
