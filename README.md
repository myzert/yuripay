# ⚡ YuriPay - Dual-Port Smart QRIS Gateway & Soundbox

Aplikasi payment gateway & kasir mandiri modern untuk **YuriDev** dengan antarmuka bergaya **Google Material Design 3 / Material You**, sistem **Dual-Port Terisolasi**, dokumentasi **OpenAPI 3.0 / Swagger UI**, proteksi **Idempotensi Anti-Duplikat saat Refresh**, notifikasi **HTTP Webhook 100% Format Midtrans**, dan **OP Redirect Link**.

---

## 🔐 Akun Login Admin Panel (Port 3000)
- **URL Login**: `http://localhost:3000/login`
- **Konfigurasi Akun**: Diatur melalui file `.env` (`ADMIN_EMAIL` & `ADMIN_PASSWORD`).
- Lihat file `.env.example` untuk panduan konfigurasi variabel lingkungan.

---

## 📜 Dokumentasi API & Swagger UI
- **Interactive Swagger UI**: [`http://localhost:3000/docs`](http://localhost:3000/docs) (atau `http://localhost:3001/docs`)
- **Raw OpenAPI Specification**: [`http://localhost:3000/swagger.json`](http://localhost:3000/swagger.json)
- Dilengkapi tombol coba API langsung (*Try it out*), skema payload Midtrans, dan dokumentasi model lengkap.

---

## 🌟 Fitur Baru & Keunggulan

### 1. 🚀 Link Redirect OP (Overpowered ala Midtrans)
Saat pembayaran selesai di halaman checkout (Port 3001), pelanggan otomatis dialihkan ke `redirect_url` toko Anda dengan membawa parameter status transaksi lengkap:
```
https://tokosaya.com/selesai?order_id=ORDER-8892&status_code=200&transaction_status=settlement&payment_type=qris&gross_amount=15101.00&payment_id=YURI-XXXX&transaction_id=TX-XXXX
```
Website toko tujuan dapat langsung membaca query param ini dan memberikan item / akun digital seketika!

### 2. 🧮 Aturan Offset / Kode Unik Cerdas
- **Pembelian kecil (Rp 50+ s/d < Rp 1.000)**: Offset cuma **+Rp 1 perak** (contoh: Rp 50 &rarr; Rp 51, Rp 500 &rarr; Rp 501) agar hemat & presisi.
- **Pembelian Rp 1.000 ke atas**: Offset acak antara **1 s/d 199 perak** (**tidak boleh lebih dari 200 perak**).

### 3. 🛡️ Idempotensi Anti-Duplikat (Aman Saat Refresh)
- Jika parameter `order_id` yang sama dikirim ulang (misal pengguna me-refresh browser atau retry pembayaran), YuriPay **tidak akan membuat transaksi baru** ataupun mengubah nominal unik.
- Tampilan QRIS pada kasir (Port 3000) tersimpan di `sessionStorage`, sehingga jika kasir merefresh browser, tampilan QRIS langsung pulih tanpa membuat transaksi baru.

### 4. 🔌 HTTP Webhook 100% Format Midtrans
- Format payload dan signature key identik dengan Midtrans:
  `signature_key = SHA512(order_id + status_code + gross_amount + ServerKey)`
- Semua sistem toko (Laravel, WHMCS, WooCommerce, Express.js) yang memakai handler notifikasi Midtrans bisa langsung menerima webhook dari YuriPay!

---

## 🚀 Menjalankan Server
```bash
npm start
```
- Dashboard Kasir & Admin: **`http://localhost:3000`**
- Customer Checkout Gateway: **`http://localhost:3001/pay/:id`**
- Swagger Documentation: **`http://localhost:3000/docs`**
