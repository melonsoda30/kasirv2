import { z } from 'zod'
import { discountTypes } from './sample-products'

export const productSchema = z.object({
  category: z.string().trim().min(1, 'Kategori wajib diisi.'),
  store: z.string().min(1, 'Store wajib dipilih.'),
  title: z.string().trim().min(1, 'Nama produk wajib diisi.'),
  price: z.string().trim().min(1, 'Harga wajib diisi.').refine((value) => Number.isFinite(Number(value)) && Number(value) > 0, 'Harga harus lebih dari 0.'),
  photo: z.string(),
  discount: z.string().refine((value) => value === '' || (Number.isFinite(Number(value)) && Number(value) >= 0), 'Diskon tidak boleh negatif.'),
  discountType: z.string().refine((value) => value === '' || discountTypes.includes(value), 'Pilih jenis diskon dari daftar.'),
  description: z.string(),
}).superRefine((value, context) => {
  const discount = Number(value.discount)
  if (value.discountType === 'Persentase (%)' && discount > 100) {
    context.addIssue({ code: 'custom', path: ['discount'], message: 'Diskon persentase maksimal 100%.' })
  }
  if (value.discountType === 'Nominal' && discount > Number(value.price)) {
    context.addIssue({ code: 'custom', path: ['discount'], message: 'Diskon tidak boleh melebihi harga produk.' })
  }
})
