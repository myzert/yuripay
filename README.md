# ⚡ YuriPay - Dual-Port Smart QRIS Gateway & Soundbox

<p align="center">
  <img src="https://raw.githubusercontent.com/myzert/yuripay/main/public/images/thank-you.webp" alt="YuriPay Anime Pop-Up" width="180" style="border-radius: 24px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);" />
</p>

<p align="center">
  <strong>Payment Gateway QRIS Dinamis Mandiri & Soundbox Realtime untuk Merchant GoBiz</strong><br>
  <em>Modern • Dual-Port Terisolasi • Format Webhook 100% Midtrans • Anti-Duplikat • OpenAPI 3.0</em>
</p>

<p align="center">
  <a href="#-fitur-unggulan"><img src="https://img.shields.io/badge/QRIS-Bank%20Indonesia%20Standard-red.svg?style=for-the-badge" alt="QRIS Standard" /></a>
  <a href="#-arsitektur-keamanan-dual-port"><img src="https://img.shields.io/badge/Security-Dual--Port%20Isolated-blue.svg?style=for-the-badge" alt="Dual Port" /></a>
  <a href="#-integrasi-webhook-100-identik-midtrans"><img src="https://img.shields.io/badge/Webhook-Midtrans%20SHA512-orange.svg?style=for-the-badge" alt="Midtrans Compatible" /></a>
  <a href="#-mengapa-yuripay-tidak-bisa-di-deploy-di-vercel--serverless"><img src="https://img.shields.io/badge/Runtime-Stateful%20Only%20(No%20Serverless)-critical.svg?style=for-the-badge" alt="Stateful Only" /></a>
  <a href="#-panduan-deployment-produksi"><img src="https://img.shields.io/badge/Docker-Ready-2496ED.svg?style=for-the-badge&logo=docker&logoColor=white" alt="Docker Ready" /></a>
</p>

---

## 📑 Daftar Isi
1. [Tentang YuriPay](#-tentang-yuripay)
2. [⚠️ PENTING: Mengapa TIDAK BISA di-deploy di Vercel / Serverless?](#-mengapa-yuripay-tidak-bisa-di-deploy-di-vercel--serverless)
3. [Fitur Unggulan](#-fitur-unggulan)
4. [Arsitektur Keamanan Dual-Port](#-arsitektur-keamanan-dual-port)
5. [Panduan Login GoBiz Merchant](#-panduan-login-gobiz-merchant)
6. [Panduan Instalasi & Menjalankan](#-panduan-instalasi--menjalankan)
7. [Panduan Deployment Produksi (VPS, Docker, PM2, Termux)](#-panduan-deployment-produksi)
8. [Konfigurasi Environment (.env)](#-konfigurasi-environment-env)
9. [Dokumentasi API & Integrasi Midtrans](#-dokumentasi-api--integrasi-midtrans)
10. [Dokumentasi Swagger UI](#-dokumentasi-swagger-ui)
11. [FAQ & Pemecahan Masalah](#-faq--pemecahan-masalah)
12. [Lisensi & Kontribusi](#-lisensi--kontribusi)

---

## 🌟 Tentang YuriPay

**YuriPay** adalah solusi payment gateway mandiri (*self-hosted*) berkinerja tinggi yang mengubah akun **GoBiz / GoFood Merchant** biasa menjadi gateway pembayaran QRIS otomatis sekelas perusahaan fintech:
- **Tanpa potongan biaya transaksi pihak ketiga** (0% fee gateway, hanya MDR resmi GoBiz).
- **Settlement realtime** langsung masuk ke saldo rekening bank terdaftar Anda.
- **Soundbox interaktif** dengan efek suara lucu (*Cute Arigato*) dan animasi pop-up ucapan terima kasih.
- **Kompatibilitas penuh dengan ekosistem Midtrans**: format notifikasi webhook HTTP POST dan kalkulasi `signature_key` (SHA-512) dibuat 100% identik sehingga toko online (WooCommerce, WHMCS, Laravel, Express) dapat langsung terhubung tanpa perlu merombak kode penerima webhook!

---

## ⚠️ MENGAPA YURIPAY TIDAK BISA DI-DEPLOY DI VERCEL / SERVERLESS?

> [!CAUTION]
> **YuriPay dirancang secara fundamental sebagai DAEMON STATEFUL dan TIDAK MENDUKUNG deployment di Vercel, Netlify, Cloudflare Workers, atau platform Serverless lainnya.**

Berikut adalah alasan teknis mengapa platform serverless akan gagal:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                   PERBANDINGAN ARSITEKTUR RUNTIME                            │
├────────────────────────────────────────┬─────────────────────────────────────┤
│ ❌ Serverless (Vercel / AWS Lambda)   │ ✔️ Stateful (VPS / Docker / PM2)    │
├────────────────────────────────────────┼─────────────────────────────────────┤
│ • Event loop dibekukan (freeze) saat   │ • Event loop berjalan terus menerus │
│   respons HTTP selesai dikirim.        │   24/7 tanpa henti.                 │
│ • Background Poller mati seketika!     │ • Poller mutasi GoPay aktif setiap  │
│                                        │   2.5 detik mendeteksi transfer.    │
│ • Filesystem bersifat ephemeral &      │ • Database SQLite WAL permanen di   │
│   read-only (database terhapus acak).  │   disk lokal, ACID compliant.       │
│ • Hanya bisa listen pada 1 port HTTP.  │ • Membuka Dual-Port simultan:       │
│                                        │   Port 3000 (Admin) + 3001 (Publik) │
│ • Sesi token memori reset setiap cold  │ • Cache sesi token in-memory tetap  │
│   start, memicu flood login OTP.       │   aktif, token auto-refresh aman.   │
└────────────────────────────────────────┴─────────────────────────────────────┘
```

### Rekomendasi Tempat Deploy:
1. **Linux VPS** (Ubuntu 22.04 / Debian 12 / AlmaLinux) dengan PM2 atau Systemd.
2. **Container Docker / Docker Compose** (DigitalOcean Droplet, Linode, Hetzner, AWS EC2, VPS IDCloudHost).
3. **PaaS Stateful** seperti **Railway**, **Coolify**, atau **Fly.io** (dengan Persistent Volume terpasang).
4. **Termux di Android** (Cocok untuk server kasir lokal hemat daya).

---

## ✨ Fitur Unggulan

### 1. 🧮 Aturan Offset / Kode Unik Cerdas (+1 Perak)
- **Nominal Kecil (Rp 50 s/d < Rp 1.000)**: Offset strictly **+Rp 1 perak** (contoh: Rp 50 &rarr; Rp 51, Rp 500 &rarr; Rp 501, Rp 75 &rarr; Rp 76) agar sangat presisi dan hemat bagi pelanggan.
- **Nominal Rp 1.000 ke atas**: Offset acak antara **1 s/d 199 perak** (**maksimal 200 perak**).
- **Pencegahan Tabrakan Unik**: Jika ada transaksi gantung pada nominal yang sama, sistem secara cerdas menaikkan offset berikutnya (+2, +3, dst.) sehingga mutasi tidak akan pernah tertukar antar pembeli!

### 2. 🛡️ Idempotensi Transaksi (Anti-Duplikat Saat Refresh)
- Pelanggan sering kali memuat ulang (*refresh*) browser saat halaman checkout sedang terbuka.
- YuriPay mendukung parameter `order_id`. Jika `order_id` yang sama dikirim ulang, sistem mengembalikan data tagihan yang sudah ada tanpa membuat tagihan baru atau mengubah nominal unik.
- Status pembayaran tersimpan permanen di SQLite: jika transaksi sudah dibayar, memuat ulang halaman `/pay/:id` **tetap menampilkan status LUNAS** beserta struk pembayaran resmi.

### 3. 🚀 OP Redirect Link (Overpowered ala Midtrans)
Setelah pembeli sukses membayar, YuriPay secara otomatis mengalihkan pembeli ke `redirect_url` toko Anda dengan membawa parameter lengkap status transaksi:
```
https://tokosaya.com/finish?order_id=ORD-9981&status_code=200&transaction_status=settlement&payment_type=qris&gross_amount=10001.00&payment_id=YURI-AB12CD&transaction_id=TX-892182
```
Aplikasi toko online Anda bisa langsung membaca query parameter tersebut dan mengaktifkan produk digital seketika!

### 4. 🔔 Webhook HTTP 100% Identik Midtrans
- Notifikasi status otomatis dikirimkan ke `webhook_url` toko Anda saat pembayaran diterima (`settlement`) atau kedaluwarsa (`expire`).
- Format signature SHA-512 identik dengan Midtrans:
  $$\text{signature\_key} = \text{SHA512}(\text{order\_id} + \text{status\_code} + \text{gross\_amount} + \text{ServerKey})$$

### 5. 🔊 Soundbox Realtime & Pop-up Anime
- Soundbox berbasis browser: memutar audio *"Cute Arigato"* saat transfer masuk.
- Pop-up modal selebrasi lucu karakter Marin Kitagawa dengan hujan konfeti (*Canvas Confetti*).
- Dilengkapi tombol kendali suara (Mute / Unmute) di bilah navigasi pelanggan.

### 6. 🔒 Keamanan Berlapis (Security Hardening)
- **Zero Fingerprinting**: Header `x-powered-by: Express` dinonaktifkan sepenuhnya.
- **Security Headers**: `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `X-XSS-Protection`, dan `Referrer-Policy`.
- **In-Memory Rate Limiting**: Perlindungan terhadap brute-force login admin (maks 10 percobaan per 5 menit) dan spam API pembuatan transaksi (maks 60 trx/menit).
- **Sanitasi Input Ketat**: Filter tag HTML berbahaya dan validasi URL skema HTTP/HTTPS.

---

## 🏰 Arsitektur Keamanan Dual-Port

YuriPay menggunakan dua server Express yang berjalan secara simultan pada port yang terisolasi:

```
                    ┌──────────────────────────────────────────────┐
                    │               INTERNET / CLIENT              │
                    └──────────────────────┬───────────────────────┘
                                           │
                    ┌──────────────────────┴───────────────────────┐
                    │      PORT FORWARDING / NGINX PROXY           │
                    └──────────────┬────────────────┬──────────────┘
                                   │                │
             [PORT 3000]           │                │          [PORT 3001]
             INTERNAL / ADMIN      │                │          CUSTOMER CHECKOUT
                                   │                │
    ┌──────────────────────────────▼───┐        ┌───▼──────────────────────────────┐
    │  📊 Dashboard Kasir & Admin      │        │  💳 Halaman Checkout (/pay/:id)  │
    │  🔐 Password & Session Guard     │        │  🌐 Public Create Payment API    │
    │  📜 Riwayat Mutasi GoBiz         │        │  ⚡ Public Polling Status        │
    │  📖 Swagger UI Docs (/docs)      │        │  🚫 TIDAK ADA AKSES KE ADMIN     │
    │  🛠️ Webhook Delivery Inspector   │        │  🚫 TIDAK ADA TOKEN / SESI GOBIZ │
    └──────────────────┬───────────────┘        └───┬──────────────────────────────┘
                       │                            │
                       └──────────────┬─────────────┘
                                      │
                       ┌──────────────▼─────────────┐
                       │   SQLite (WAL Mode) &      │
                       │   GoPay Polling Daemon     │
                       └──────────────┬─────────────┘
                                      │
                       ┌──────────────▼─────────────┐
                       │   GoBiz / GoPay API Cloud  │
                       └────────────────────────────┘
```

1. **Port 3000 (Admin Dashboard & Kasir)**:
   - Terproteksi login email & password (`ADMIN_EMAIL` & `ADMIN_PASSWORD`).
   - Menyediakan live feed mutasi, statistik omset harian, log pengiriman webhook, dan Swagger UI.
2. **Port 3001 (Customer Checkout Gateway)**:
   - Khusus diakses oleh pembeli umum untuk melihat QRIS dan melakukan pembayaran.
   - Bersih dari sesi admin, tidak dapat mengakses endpoint internal, dan bebas dari risiko kebocoran token GoBiz.

---

## 📱 Panduan Login GoBiz Merchant

YuriPay menyertakan CLI interaktif resmi untuk mendapatkan sesi token dari GoBiz:

### Langkah 1: Jalankan CLI Login
```bash
npm run login
```
*atau:*
```bash
node login.js
```

### Langkah 2: Masukkan Nomor HP Merchant
- Ketik nomor ponsel Anda yang terdaftar pada akun GoBiz / GoFood (contoh: `085119772671`).
- Sistem YuriPay akan menghubungi server resmi GoBiz untuk mengirimkan kode OTP.

### Langkah 3: Verifikasi Kode OTP (4 Digit)
- Buka SMS atau pesan WhatsApp dari Gojek / GoBiz.
- Masukkan 4 digit angka OTP yang diterima ke terminal.

### Langkah 4: Selesai!
- Sistem secara otomatis memverifikasi OTP, mengambil profil outlet merchant, dan menyimpan token ke dalam file:
  `📂 .GOPAY_SESI_JANGAN_DIHAPUS.json`
- YuriPay memiliki fitur **auto-refresh token**, sehingga sesi akan diperpanjang secara otomatis selama akun Anda aktif.

---

## 🚀 Panduan Instalasi & Menjalankan

### Persyaratan Sistem
- **Node.js**: Versi 18.x, 20.x, atau 22.x LTS
- **NPM**: Versi 9.x ke atas
- **Build Tools**: `python3`, `make`, `g++` (untuk kompilasi SQLite)

### 1. Kloning Repositori
```bash
git clone https://github.com/myzert/yuripay.git
cd yuripay
```

### 2. Instal Dependensi
```bash
npm install
```

### 3. Konfigurasi File Environment
Salin template konfigurasi `.env.example` menjadi `.env`:
```bash
cp .env.example .env
```
Buka file `.env` dan sesuaikan pengaturan toko serta kredensial admin.

### 4. Jalankan Server
```bash
npm start
```

Akses layanan di browser:
- **Kasir & Admin**: [http://localhost:3000](http://localhost:3000)
- **Customer Checkout**: [http://localhost:3001/pay/:id](http://localhost:3001)
- **Dokumentasi API Swagger**: [http://localhost:3000/docs](http://localhost:3000/docs)

---

## 🐳 Panduan Deployment Produksi

### Opsi A: Deployment dengan Docker & Docker Compose (Direkomendasikan)

1. Pastikan Docker dan Docker Compose telah terpasang di VPS Anda:
   ```bash
   docker --version
   docker compose version
   ```

2. Jalankan container di latar belakang:
   ```bash
   docker compose up -d --build
   ```

3. Cek status container dan log:
   ```bash
   docker compose ps
   docker compose logs -f
   ```

4. Menghentikan container:
   ```bash
   docker compose down
   ```

---

### Opsi B: Deployment dengan PM2 di Linux VPS (Ubuntu / Debian)

1. Pasang PM2 secara global:
   ```bash
   npm install -g pm2
   ```

2. Jalankan YuriPay menggunakan file konfigurasi ekosistem:
   ```bash
   pm2 start ecosystem.config.js
   ```

3. Simpan daftar proses agar otomatis menyala saat VPS reboot:
   ```bash
   pm2 save
   pm2 startup
   ```

4. Cek log realtime:
   ```bash
   pm2 logs yuripay-gateway
   ```

---

### Opsi C: Deployment di Termux (Android)

YuriPay sangat ringan dan dapat dijalankan langsung di HP Android bekas sebagai server kasir 24 jam:

1. Update paket Termux:
   ```bash
   pkg update && pkg upgrade -y
   pkg install nodejs git python make clang -y
   ```

2. Kloning dan instal:
   ```bash
   git clone https://github.com/myzert/yuripay.git
   cd yuripay
   npm install
   cp .env.example .env
   ```

3. Login GoBiz:
   ```bash
   npm run login
   ```

4. Jalankan server:
   ```bash
   npm start
   ```

---

## ⚙️ Konfigurasi Environment (.env)

| Variabel | Tipe | Contoh / Default | Deskripsi |
| :--- | :--- | :--- | :--- |
| `DASHBOARD_PORT` | Integer | `3000` | Port untuk Dashboard Kasir, Admin, dan Swagger UI. |
| `PAYMENT_PORT` | Integer | `3001` | Port publik untuk halaman checkout customer (`/pay/:id`). |
| `STORE_NAME` | String | `YuriDev` | Nama toko yang ditampilkan pada struk dan checkout. |
| `APP_NAME` | String | `YuriPay` | Nama aplikasi payment gateway. |
| `API_KEY` | String | `yuripay_live_secret_key` | Kunci otentikasi API / Server Key untuk verifikasi webhook. |
| `ADMIN_EMAIL` | String | `admin@example.com` | Email login panel admin kasir. |
| `ADMIN_PASSWORD` | String | `your_secure_password` | Kata sandi login panel admin kasir. |
| `SESSION_SECRET` | String | `random_string_secret` | Kunci enkripsi cookie sesi Express. |
| `GOPAY_MERCHANT_ID` | String | `G123456789` | ID Merchant GoBiz Anda. |
| `QRIS_STATIC` | String | `000201010211...63042A62` | String QRIS Statis resmi dari GoBiz / GoFood. |
| `MIN_NOMINAL` | Integer | `50` | Batas nominal pembayaran terkecil (Rupiah). |
| `TRANSACTION_TIMEOUT_MINUTES` | Integer | `10` | Durasi batas waktu pembayaran (menit). |

---

## 🔌 Dokumentasi API & Integrasi Midtrans

### 1. Membuat Transaksi Baru (Create Payment)

- **Endpoint**: `POST http://localhost:3001/api/create-payment` (atau Port 3000)
- **Headers**: `Content-Type: application/json`

#### Request Body:
```json
{
  "amount": 10000,
  "order_id": "INV-20261026-001",
  "custom_name": "Paket VIP Member 1 Bulan",
  "redirect_url": "https://tokosaya.com/pembayaran/sukses",
  "webhook_url": "https://tokosaya.com/api/midtrans-webhook",
  "use_unique_code": true
}
```

#### Response Sukses (HTTP 200):
```json
{
  "success": true,
  "data": {
    "payment_id": "YURI-X89KLA2",
    "order_id": "INV-20261026-001",
    "amount": 10087,
    "custom_name": "Paket VIP Member 1 Bulan",
    "payment_url": "http://localhost:3001/pay/YURI-X89KLA2",
    "qr_image": "data:image/png;base64,iVBORw0KGgoAAAANSUh...",
    "status": "PENDING",
    "redirect_url": "https://tokosaya.com/pembayaran/sukses",
    "webhook_url": "https://tokosaya.com/api/midtrans-webhook",
    "created_at": "2026-10-26T08:00:00.000Z",
    "expires_at": "2026-10-26T08:10:00.000Z",
    "paid_at": null
  }
}
```

---

### 2. Format Webhook HTTP POST (Midtrans Identical)

Saat pembayaran berhasil diselesaikan, YuriPay akan mengirimkan notifikasi HTTP POST ke `webhook_url` Anda dengan format payload berikut:

```json
{
  "transaction_time": "2026-10-26 15:05:22",
  "transaction_status": "settlement",
  "transaction_id": "TX-99812401",
  "status_message": "YuriPay payment settlement successfully verified",
  "status_code": "200",
  "signature_key": "d7a8f9c1b2e3...",
  "payment_type": "qris",
  "order_id": "INV-20261026-001",
  "merchant_id": "G538138242",
  "gross_amount": "10087.00",
  "currency": "IDR",
  "fraud_status": "accept"
}
```

#### Cara Verifikasi Signature di PHP:
```php
$json = file_get_contents('php://input');
$data = json_decode($json, true);

$orderId = $data['order_id'];
$statusCode = $data['status_code'];
$grossAmount = $data['gross_amount'];
$serverKey = 'yuripay_live_secret_key'; // Sesuai API_KEY di .env

$expectedSignature = hash('sha512', $orderId . $statusCode . $grossAmount . $serverKey);

if ($data['signature_key'] === $expectedSignature) {
    if ($data['transaction_status'] === 'settlement') {
        // Pembayaran LUNAS! Aktifkan pesanan customer.
    }
    http_response_code(200);
    echo json_encode(['status' => 'OK']);
} else {
    http_response_code(403);
    echo "Invalid Signature";
}
```

#### Cara Verifikasi Signature di Node.js:
```javascript
const crypto = require('crypto');

app.post('/api/midtrans-webhook', (req, res) => {
    const { order_id, status_code, gross_amount, signature_key, transaction_status } = req.body;
    const serverKey = process.env.API_KEY || 'yuripay_live_secret_key';

    const payload = `${order_id}${status_code}${gross_amount}${serverKey}`;
    const expectedSignature = crypto.createHash('sha512').update(payload).digest('hex');

    if (signature_key === expectedSignature) {
        if (transaction_status === 'settlement') {
            console.log(`[LUNAS] Pesanan ${order_id} berhasil diverifikasi!`);
        }
        return res.status(200).json({ status: 'OK' });
    }

    return res.status(403).json({ error: 'Invalid Signature' });
});
```

---

## 📖 Dokumentasi Swagger UI

YuriPay menyediakan dokumentasi interaktif berbasis spesifikasi **OpenAPI 3.0**:
- **Swagger UI**: Buka browser di [http://localhost:3000/docs](http://localhost:3000/docs) (atau port 3001).
- **Spesifikasi JSON**: [http://localhost:3000/swagger.json](http://localhost:3000/swagger.json).
- Anda dapat menguji seluruh endpoint secara langsung melalui fitur *"Try it out"* tanpa memerlukan Postman!

---

## ❓ FAQ & Pemecahan Masalah

<details>
<summary><strong>1. Berapa lama token sesi GoBiz bertahan?</strong></summary>
<p>Token sesi GoBiz bertahan sekitar 30 hari. YuriPay secara otomatis memperbarui token akses di latar belakang sebelum kedaluwarsa. Jika sesi terputus (misalnya logout dari aplikasi HP), cukup jalankan kembali <code>npm run login</code>.</p>
</details>

<details>
<summary><strong>2. Di mana saya bisa mendapatkan string QRIS_STATIC?</strong></summary>
<p>Buka aplikasi <strong>GoBiz</strong> di ponsel Anda &rarr; Pilih menu <strong>Lainnya / QRIS</strong> &rarr; Tampilkan Kode QR Toko Anda &rarr; Pindai menggunakan pembaca QR scanner biasa (misalnya Google Lens). Teks string yang muncul (diawali <code>000201010211...</code>) adalah kode QRIS Statis Anda.</p>
</details>

<details>
<summary><strong>3. Apakah saya bisa deploy di Vercel atau Netlify?</strong></summary>
<p><strong>Tidak bisa.</strong> Seperti yang dijelaskan pada bagian arsitektur di atas, YuriPay membutuhkan proses daemon jangka panjang untuk mengecek mutasi GoPay setiap detik dan menulis ke SQLite lokal. Gunakan VPS, Docker, PM2, atau Termux.</p>
</details>

<details>
<summary><strong>4. Mengapa nominal pembayaran bertambah Rp 1 perak?</strong></summary>
<p>Tambahan Rp 1 perak adalah <em>Kode Unik Dinamis</em>. Karena QRIS GoBiz menerima pembayaran dari ratusan bank & e-wallet tanpa nama akun pengirim yang seragam, kode unik ini memastikan bahwa transfer yang masuk tepat cocok dengan pesanan pelanggan secara otomatis 100%.</p>
</details>

---

## 📄 Lisensi & Kontribusi

Proyek ini dirilis di bawah lisensi terbuka [ISC License](LICENSE).

Kontribusi, pelaporan bug, dan saran fitur sangat kami hargai! Silakan buat **Pull Request** atau ajukan **Issue** di repositori GitHub kami:
👉 **[https://github.com/myzert/yuripay](https://github.com/myzert/yuripay)**

---

<p align="center">
  Dibuat dengan ❤️ untuk komunitas open source oleh <strong>YuriDev</strong>.
</p>
