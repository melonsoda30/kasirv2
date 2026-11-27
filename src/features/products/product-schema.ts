import { z } from 'zod'
import { discountTypes } from './sample-products'
import { getProductDiscountError } from './product-pricing'

export function isValidProductStock(stock: string) {
  return /^\d+$/.test(stock.trim()) && Number.isSafeInteger(Number(stock))
}

export const productSchema = z.object({
  category: z.string().trim().min(1, 'Kategori wajib diisi.'),
  store: z.string().min(1, 'Store wajib dipilih.'),
  title: z.string().trim().min(1, 'Nama produk wajib diisi.'),
  price: z.string().trim().min(1, 'Harga wajib diisi.').refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, 'Harga harus lebih dari 0.'),
  photo: z.string(),
  discount: z.string(),
  discountType: z.string().refine((value) => value === '' || discountTypes.includes(value), 'Pilih jenis diskon dari daftar.'),
  useStock: z.boolean(),
  stock: z.string().trim(),
  description: z.string(),
}).superRefine((value, context) => {
  const discountError = getProductDiscountError(value)
  if (discountError) {
    context.addIssue({ code: 'custom', path: ['discount'], message: discountError })
  }
  if (value.useStock && !isValidProductStock(value.stock)) {
    context.addIssue({ code: 'custom', path: ['stock'], message: 'Isi stok dengan bilangan bulat 0 atau lebih.' })
  }
})
