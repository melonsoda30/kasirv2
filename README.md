# Kasir2

React + TypeScript + Vite, Tailwind CSS, Geist Variable, TanStack Query,
Axios, Lucide React, clsx, Zod, TanStack Form, dan Zustand.

```sh
npm ci
npm run dev
npm run build
npm run build-staging
npm run lint
```

Build staging membaca `.env.staging` dan menghasilkan bundle di `dist`.
Nilai awal `.env.staging` sama dengan `.env.example`.

Geist di-host lokal lewat Fontsource dan menjadi font utama. Tailwind aktif
melalui plugin Vite dan src/index.css. Ikon tersedia dari lucide-react.

## Routing

TanStack Router menggunakan file-based routing di `src/routes`:

- `__root.tsx`: root layout, context QueryClient, halaman 404 dan error.
- `index.tsx`: route `/`, menampilkan App yang sudah ada.
- `src/router.ts`: konfigurasi router, typed navigation, preload saat intent,
  dan scroll restoration.

Tambahkan file seperti `src/routes/products.tsx` dengan
`createFileRoute('/products')({ component: ProductsPage })`. Plugin Vite
menghasilkan `src/routeTree.gen.ts` otomatis ketika dev server berjalan.
Jangan edit file hasil generate. Jalankan `npm run routes:generate` untuk
generate manual; build menjalankannya sebelum pemeriksaan TypeScript.

Gunakan `Link` dan `useNavigate` dari `@tanstack/react-router` untuk navigasi.
Loader menerima QueryClient melalui `context.queryClient`, sehingga dapat
memakai `ensureQueryData` dengan cache yang sama dengan hook React Query.
Saat deploy SPA, arahkan request halaman ke `index.html` agar refresh URL
route bertingkat tetap berjalan.

## API

Salin .env.example menjadi .env.local dan sesuaikan VITE_API_BASE_URL.
Default /api. Backend belum tersedia. Variabel VITE_* publik, jangan isi secret.

- src/lib/api.ts: instance Axios dan request<TResponse, TBody>(), mengembalikan response body.
- src/lib/query-client.ts: QueryClient, terpasang melalui provider di main.tsx.
- src/hooks/use-api.ts: useApiQuery dan useApiMutation.
- src/lib/cn.ts: conditional class menggunakan clsx; tidak menyelesaikan konflik kelas Tailwind.

Contoh dalam komponen atau custom hook:

```tsx
import { useQueryClient } from '@tanstack/react-query'
import { useApiMutation, useApiQuery } from './hooks/use-api'

type Product = { id: string; name: string; price: number }
type CreateProduct = Omit<Product, 'id'>

function useProducts(search: string) {
  const client = useQueryClient()
  const products = useApiQuery<Product[]>(
    ['products', { search }],
    { url: '/products', params: { search } },
  )
  const createProduct = useApiMutation<Product, CreateProduct>(
    (data) => ({ url: '/products', method: 'POST', data }),
    {
      onSuccess: async () => {
        await client.invalidateQueries({ queryKey: ['products'] })
      },
    },
  )
  return { products, createProduct }
}
```

Sertakan semua parameter request dalam query key. Query meneruskan AbortSignal
ke Axios. Mutation tidak diulang otomatis; invalidasi cache ditentukan per fitur
melalui onSuccess. Error Axios dipertahankan, termasuk status dan response.
Generic response hanya memberi tipe TypeScript; gunakan Zod .parse() jika
response perlu divalidasi saat runtime.

## Toast

Sonner menjadi toast utama, dengan Toaster di root aplikasi. Query yang gagal
setelah retry menampilkan error. Mutation menampilkan toast sukses atau error.
Callback global cache tetap berjalan ketika hook memiliki callback sendiri.
Gunakan `import { toast } from 'sonner'` untuk notifikasi manual.

Kustomisasi melalui options hook React Query (termasuk useApiQuery/useApiMutation):

```tsx
// Options mutation
{ meta: { toast: { success: 'Produk berhasil ditambahkan', error: 'Gagal menambahkan produk' } } }
// Matikan semua toast untuk operasi ini
{ meta: { toast: false } }
// Matikan hanya toast sukses mutation
{ meta: { toast: { success: false } } }
```

## Form dan state

TanStack Form (useForm dari @tanstack/react-form) menerima schema Zod melalui
validators: { onChange: schema }. Zustand (create dari zustand) tersedia untuk
state antarkomponen. Store dan schema domain dibuat saat fitur diimplementasikan.

Referensi: [Tailwind Vite](https://tailwindcss.com/docs/installation/using-vite),
[TanStack Query](https://tanstack.com/query/latest/docs/framework/react/overview),
[Axios](https://axios-http.com/docs/instance).
