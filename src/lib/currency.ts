const nominalFormatter = new Intl.NumberFormat('id-ID', {
  maximumFractionDigits: 0,
})

const currencyFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
})
const decimalCurrencyFormatter = new Intl.NumberFormat('id-ID', {
  style: 'currency', currency: 'IDR', minimumFractionDigits: 0, maximumFractionDigits: 2,
})

/** Accepts an unformatted number or numeric string, e.g. 18000 or "18000". */
export function formatCurrency(value: number | string, fractionDigits: 0 | 2 = 0): string {
  const formatter = fractionDigits === 2 ? decimalCurrencyFormatter : currencyFormatter
  return formatter.format(Number(value))
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
