# Kasir2

- Ikuti gaya halaman yang sudah ada saat menambah atau mengubah halaman. Gunakan komponen bersama dan jadikan halaman terdekat dalam alur pengguna sebagai acuan untuk tipografi, jarak, daftar, tombol, dan drawer.
- Pada halaman Pembayaran, tampilkan Ringkasan Pembayaran dan tombol Bayar dalam panel yang tetap di bawah viewport. Sisakan ruang agar konten dapat digulir sepenuhnya. Sembunyikan navigasi bawah di halaman Pembayaran.
- Gunakan drawer Order sebagai acuan drawer Pembayaran. Pakai header bawaan, area isi yang dapat digulir, dan footer bergaris dengan tombol berukuran standar.

## Gaya penulisan kode

- Sebelum mengedit, lihat file yang dituju dan implementasi terdekat dalam fitur yang sama. Ikuti gaya yang dipakai di sana untuk indentasi, kutip, titik koma, urutan import, penamaan, dan pemenggalan JSX.
- Untuk file baru, gunakan file yang perannya sama dalam fitur terkait sebagai acuan. Ulangi pola yang sudah dipakai untuk akses API, query key, state, validasi, dan penanganan loading serta error.
- Pakai komponen, hook, dan utilitas yang sudah ada jika memenuhi kebutuhan. Pertahankan pola dan format baris di luar perubahan yang diminta. Lakukan perapian menyeluruh hanya saat diminta.
- Susun `className` bersyarat dengan `cn` dari `cn`. Letakkan kelas dasar sebagai argumen pertama dan kelas bersyarat sebagai argumen berikutnya. Hindari template literal untuk menggabungkan kelas yang bergantung pada kondisi.
- Hindari ternary di dalam ternary. Untuk beberapa kondisi JSX, beri nama kondisi jika perlu lalu tulis cabang terpisah seperti `isLoading && (...)` dan `isError && (...)`. Untuk memilih nilai dengan beberapa kondisi, gunakan `if` atau pemetaan yang mudah dibaca.
