import type { Sale } from './sales-summary'

// Demo transactions only. Product IDs match the sample product catalog.
export const sampleSales: Sale[] = [
  {
    id: 'DEMO-20261117-006', occurredAt: '2026-11-17T14:35:00+07:00',
    store: 'Toko Utama', cashier: 'Kasir 1', paymentMethod: 'QRIS', status: 'complete',
    total: 58000, paid: 58000,
    items: [
      { productId: '1', title: 'Kopi Susu Gula Aren', quantity: 2, unitPrice: 18000 },
      { productId: '2', title: 'Croissant Butter', quantity: 1, unitPrice: 22000 },
    ],
    paymentProof: { url: '/demo-payment-proof.svg', name: 'Bukti pembayaran dummy', type: 'image' },
  },
  {
    id: 'DEMO-20261117-005', occurredAt: '2026-11-17T13:20:00+07:00',
    store: 'Cabang 1', cashier: 'Kasir 2', paymentMethod: 'Tunai', status: 'complete',
    total: 40000, paid: 50000,
    items: [
      { productId: '3', title: 'Matcha Latte', quantity: 1, unitPrice: 24000 },
      { productId: '4', title: 'Roti Panggang', quantity: 1, unitPrice: 16000 },
    ],
  },
  {
    id: 'DEMO-20261117-004', occurredAt: '2026-11-17T12:45:00+07:00',
    store: 'Toko Utama', cashier: 'Kasir 1', paymentMethod: 'QRIS', status: 'pending',
    total: 30000, paid: 0,
    items: [{ productId: '5', title: 'Cookies Cokelat', quantity: 2, unitPrice: 15000 }],
  },
  {
    id: 'DEMO-20261117-003', occurredAt: '2026-11-17T11:10:00+07:00',
    store: 'Cabang 1', cashier: 'Kasir 2', paymentMethod: 'Tunai', status: 'delete',
    total: 22000, paid: 0,
    items: [
      { productId: '7', title: 'Donat Gula', quantity: 1, unitPrice: 10000 },
      { productId: '6', title: 'Air Mineral', quantity: 2, unitPrice: 6000 },
    ],
  },
  {
    id: 'DEMO-20261116-002', occurredAt: '2026-11-16T16:30:00+07:00',
    store: 'Toko Utama', cashier: 'Kasir 2', paymentMethod: 'Tunai', status: 'complete',
    total: 85000, paid: 100000,
    items: [{ productId: '8', title: 'Kopi Biji Kemasan', quantity: 1, unitPrice: 85000 }],
  },
  {
    id: 'DEMO-20261116-001', occurredAt: '2026-11-16T09:15:00+07:00',
    store: 'Cabang 1', cashier: 'Kasir 1', paymentMethod: 'QRIS', status: 'pending',
    total: 42000, paid: 0,
    items: [
      { productId: '1', title: 'Kopi Susu Gula Aren', quantity: 1, unitPrice: 18000 },
      { productId: '3', title: 'Matcha Latte', quantity: 1, unitPrice: 24000 },
    ],
  },
]
