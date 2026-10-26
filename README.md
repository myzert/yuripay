# ⚡ YURIPAY by myzert

<p align="center">
  <img src="https://raw.githubusercontent.com/myzert/yuripay/main/public/images/thank-you.webp" alt="YuriPay Banner" width="160" style="border-radius: 20px; box-shadow: 0 10px 25px rgba(0,0,0,0.15);" />
</p>

<p align="center">
  <strong>Enterprise Self-Hosted Dynamic QRIS Payment Gateway for GoBiz Merchants</strong><br>
  <em>Stateful High-Performance • Dual-Port Isolation • Midtrans SHA-512 Webhook • Idempotent • OpenAPI 3.0</em>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/YURIPAY-by%20myzert-0284c7?style=for-the-badge&logo=shield" alt="YuriPay by myzert" />
  <img src="https://img.shields.io/badge/QRIS-Bank%20Indonesia%20Standard-red?style=for-the-badge" alt="QRIS Standard" />
  <img src="https://img.shields.io/badge/Runtime-Stateful%20Only%20(VPS%20%7C%20cPanel%20%7C%20Docker)-success?style=for-the-badge" alt="Stateful Only" />
  <img src="https://img.shields.io/badge/Serverless-STRICTLY%20UNSUPPORTED-critical?style=for-the-badge" alt="No Serverless" />
  <img src="https://img.shields.io/badge/License-ISC-blue?style=for-the-badge" alt="ISC License" />
</p>

---

## ⚖️ PERNYATAAN PENOLAKAN & KEPATUHAN HUKUM (LEGAL DISCLAIMER)

> [!IMPORTANT]
> **PEMBERITAHUAN RESMI HUKUM:**
> 1. **Proyek Komunitas Mandiri (Unofficial Project)**: **YURIPAY** adalah perangkat lunak sumber terbuka (*open source*) independen yang dikembangkan oleh **myzert** untuk tujuan penelitian, edukasi, dan integrasi kasir mandiri (*self-hosted gateway*). Perangkat lunak ini **TIDAK berafiliasi, didukung, disponsori, atau disetujui secara resmi oleh PT GoTo Gojek Tokopedia Tbk (Gojek / GoPay / GoBiz), Bank Indonesia, maupun Asosiasi Sistem Pembayaran Indonesia (ASPI)**.
> 2. **Kepatuhan Pedagang (Merchant Compliance)**: Seluruh penggunaan API GoBiz dan pemrosesan dana operasional adalah tanggung jawab mutlak masing-masing pedagang (*merchant*) pemilik akun. Pengguna wajib mematuhi Syarat & Ketentuan Layanan GoBiz dan peraturan Bank Indonesia mengenai transaksi pembayaran QRIS (PADG No. 21/18/PADG/2019).
> 3. **Tanpa Jaminan (No Warranty)**: Perangkat lunak ini disediakan di bawah lisensi terbuka [ISC License](LICENSE) "sebagaimana adanya" (*as-is*) tanpa jaminan dalam bentuk apa pun, dan penulis dibebaskan dari segala bentuk tuntutan ganti rugi atau liabilitas operasional.

---

## 📑 Daftar Isi
1. [Ikhtisar Arsitektur](#-ikhtisar-arsitektur)
2. [⚠️ MENGAPA YURIPAY TIDAK BISA DI-DEPLOY DI VERCEL / SERVERLESS?](#-mengapa-yuripay-tidak-bisa-di-deploy-di-vercel--serverless)
3. [Fitur Utama Enterprise](#-fitur-utama-enterprise)
4. [Arsitektur Keamanan Dual-Port](#-arsitektur-keamanan-dual-port)
5. [Otentikasi Akun GoBiz Merchant](#-otentikasi-akun-gobiz-merchant)
6. [Panduan Deployment Produksi (VPS, cPanel, Docker, Termux)](#-panduan-deployment-produksi)
7. [Kustomisasi Logo & Identitas Merchant](#-kustomisasi-logo--identitas-merchant)
8. [Konfigurasi Environment (.env)](#-konfigurasi-environment-env)
9. [Spesifikasi API & Integrasi Midtrans](#-spesifikasi-api--integrasi-midtrans)
10. [Dokumentasi Swagger UI](#-dokumentasi-swagger-ui)
11. [Pertanyaan Umum (FAQ)](#-pertanyaan-umum-faq)
12. [Lisensi & Kontribusi](#-lisensi--kontribusi)

---

## 🏛️ Ikhtisar Arsitektur

**YURIPAY by myzert** menjembatani akun merchant **GoBiz** reguler menjadi payment gateway QRIS dinamis mandiri (*on-premise / self-hosted*) yang mampu memproses tagihan secara otomatis dalam hitungan detik tanpa biaya potongan gateway pihak ketiga (0% gateway fee).

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                                 ALUR TRANSAKSI YURIPAY                                 │
└────────────────────────────────────────────────────────────────────────────────────────┘

  [ Pelanggan Toko ]                                            [ Merchant Server / Store ]
          │                                                                  │
          │ 1. Buat Tagihan (POST /api/create-payment)                       │
          │◄─────────────────────────────────────────────────────────────────┤
          │                                                                  │
          ▼                                                                  │
  [ Halaman Checkout (/pay/:id) ]                                            │
  • QRIS Dinamis Otomatis                                                    │
  • Nominal Unik (+1 Perak)                                                  │
  • Mode: Default Chime / Anime                                              │
          │                                                                  │
          │ 2. Pembayaran via Bank / E-Wallet (BCA, GoPay, DANA, dll.)        │
          ▼                                                                  │
  [ GoPay / GoBiz Network ]                                                  │
          │                                                                  │
          │ 3. Settlement Masuk ke Rekening GoBiz                            │
          ▼                                                                  │
  [ YuriPay Background Daemon (Port 3000 & 3001) ]                           │
  • Poller Realtime (Setiap 2.5 Detik)                                       │
  • Pencocokan Presisi Nominal Unik & Timestamp                              │
  • Update Status SQLite -> LUNAS • TERVERIFIKASI                            │
          │                                                                  │
          ├─────────────────────────────────────────────────────────────────►│
          │ 4. Webhook HTTP POST (Midtrans SHA-512)                          │
          │                                                                  ▼
          │                                                      [ Pesanan Diproses Toko ]
          │ 5. Auto OP Redirect ke Website Toko                              │
          ▼                                                                  │
  [ Toko Selesai (https://tokosaya.com/finish?order_id=...&status_code=200) ]│
```

---

## ⚠️ MENGAPA YURIPAY TIDAK BISA DI-DEPLOY DI VERCEL / SERVERLESS?

> [!CAUTION]
> **YuriPay dirancang secara fundamental sebagai DAEMON STATEFUL. YuriPay TIDAK DAPAT BERJALAN di Vercel, Netlify, Cloudflare Workers, AWS Lambda, atau platform Serverless sejenis.**

Secara arsitektur perangkat lunak, sistem gateway membutuhkan empat pilar runtime yang tidak dimiliki lingkungan serverless:

| Kebutuhan Sistem YuriPay | ❌ Platform Serverless (Vercel / Lambda) | ✔️ Lingkungan Stateful (VPS / cPanel / Docker) |
| :--- | :--- | :--- |
| **Realtime Daemon Poller** | **Container dibekukan (*frozen*)** seketika setelah respons HTTP selesai dikirim. Event loop berhenti total dan mutasi tidak akan pernah terverifikasi. | **Node.js Process berjalan 24/7**, memverifikasi mutasi GoPay setiap 2.5 detik secara non-blocking. |
| **Penyimpanan SQLite WAL** | Filesystem bersifat **read-only dan sementara (*ephemeral*)**. Database terhapus otomatis saat instance mati (*scale-to-zero*). | Database SQLite tersimpan permanen pada disk POSIX dengan konkurensi tinggi (**Write-Ahead Logging**). |
| **Arsitektur Dual-Port** | Hanya mendukung single-port HTTP router standar. | Membuka dua socket port terisolasi secara simultan (**Port 3000** Internal & **Port 3001** Publik). |
| **In-Memory Mutex Lock** | Instance serverless di-spawn secara acak (multi-instans tanpa sinkronisasi memori), menyebabkan tabrakan kode unik. | Menjaga memori sesi aktif terpusat, menjamin offset +1 perak tidak bertabrakan antar pelanggan. |

**Platform Deployment yang Didukung Penuh:**
- **Linux VPS**: Ubuntu 20.04 / 22.04 / 24.04 LTS, Debian 11 / 12, AlmaLinux, Rocky Linux.
- **cPanel Web Hosting**: Menggunakan fitur **Setup Node.js App** (CloudLinux / Phusion Passenger).
- **Docker & Docker Compose**: Container mandiri dengan persistensi volume.
- **Termux di Android**: Server mandiri hemat energi pada smartphone Android fisik.

---

## 💎 Fitur Utama Enterprise

### 1. 🧮 Algoritma Offset Kode Unik Presisi (+1 Perak)
- **Pembelian Mikro (Rp 50 s/d < Rp 1.000)**: Dikenakan offset tetap **+Rp 1 perak** (contoh: Rp 50 &rarr; Rp 51, Rp 500 &rarr; Rp 501, Rp 75 &rarr; Rp 76) agar sangat hemat dan tepat.
- **Pembelian Standar (Rp 1.000 ke atas)**: Offset dinamis acak antara **1 s/d 199 perak** (**maksimal tidak lebih dari 200 perak**).
- **Anti-Tabrakan Otomatis (*Collision Prevention*)**: Apabila ada transaksi gantung pada nominal yang sama, sistem secara cerdas menggeser offset (+2, +3, dst.) sehingga mutasi transfer tidak akan pernah tertukar antar pembeli.

### 2. 🎭 Dual Success Celebration Theme (Default & Anime)
Merchant dan pelanggan dapat memilih gaya perayaan pembayaran sesuai kebutuhan bisnis:
- **Mode Default (Corporate Fintech)**:
  - Tampilan struk formal profesional bergaya Stripe / Apple Pay.
  - Efek audio *Fintech Chime* elegan yang disintesis secara murni via **Web Audio API** (tanpa ketergantungan file eksternal, latensi nol).
  - Konfeti perayaan halus tanpa pop-up anime.
- **Mode Anime (Playful Store)**:
  - Pop-up modal karakter Marin Kitagawa dengan animasi selebrasi.
  - Efek suara audio *"Cute Arigato"*.
  - Konfeti warna-warni (*Canvas Confetti*).
- **Fleksibilitas Konfigurasi**:
  - Diatur global via `.env` (`DEFAULT_SUCCESS_THEME="anime"` atau `"default"`).
  - Diatur per transaksi via REST API (`success_theme: "default"` atau `"anime"`).
  - Dilengkapi tombol toggle interaktif di bilah navigasi checkout.

### 3. 🖼️ Kustomisasi Logo & Identitas Brand
- Mendukung logo custom merchant melalui variabel `STORE_LOGO_URL` di file `.env`.
- Jika dikosongkan, YuriPay otomatis menggunakan ikon lencana perisai SVG berkualitas tinggi.
- Terintegrasi penuh pada halaman **Kasir Admin**, **Customer Checkout**, dan **Login Admin**.

### 4. 🛡️ Idempotensi Transaksi Penuh
- Pembeli yang me-refresh browser atau mengalami gangguan koneksi tidak akan membuat tagihan baru.
- Sistem mengikat transaksi berdasarkan `order_id` yang sama, menjaga integritas mutasi GoPay.

### 5. 🕶️ Stealth Auto-Redirect Port Pembayaran (Anti-Probe & Bot Scanner)
- Demi keamanan operasional dari pemindaian bot, web crawler, atau pihak tidak bertanggung jawab, akses langsung ke root port pembayaran publik (`http://localhost:3001/` atau rute acak) **otomatis dialihkan (302 Redirect)** ke `https://www.google.com` atau repository GitHub resmi `https://github.com/myzert/yuripay`.
- Hanya pelanggan yang memiliki link resmi tagihan (`/pay/YURI-XXXXXX`) yang dapat mengakses halaman checkout.
- URL pengalihan ini dapat dikonfigurasi melalui variabel `PAYMENT_ROOT_REDIRECT_URL` di file `.env`.
- Pengiriman parameter `order_id` yang sama akan mengembalikan data pembayaran yang ada secara konsisten.
- Halaman `/pay/:id` yang sudah berstatus `PAID` akan **tetap berstatus LUNAS** saat di-refresh atau dibuka kembali di kemudian hari.

### 5. 🚀 Tautan Pengalihan Otomatis (OP Redirect ala Midtrans)
Setelah pembayaran lunas, pelanggan otomatis dialihkan ke `redirect_url` dengan parameter status lengkap:
```
https://tokosaya.com/finish?order_id=INV-9901&status_code=200&transaction_status=settlement&payment_type=qris&gross_amount=10001.00&payment_id=YURI-AB12CD&transaction_id=TX-892182
```

### 6. 🔔 Webhook HTTP POST 100% Identik Midtrans
- Format notifikasi dan kalkulasi signature identik dengan standar Midtrans:
  $$\text{signature\_key} = \text{SHA512}(\text{order\_id} + \text{status\_code} + \text{gross\_amount} + \text{ServerKey})$$
- Kompatibel langsung dengan modul penerima notifikasi Midtrans pada berbagai framework web.

---

## 🏰 Arsitektur Keamanan Dual-Port

YuriPay memisahkan lalu lintas jaringan menjadi dua zona keamanan terisolasi:

```
                            ┌────────────────────────┐
                            │    LALU LINTAS WEB     │
                            └───────────┬────────────┘
                                        │
             ┌──────────────────────────┴──────────────────────────┐
             │                                                     │
     [PORT 3000] INTERNAL                                  [PORT 3001] PUBLIK
┌────────────────────────────┐                        ┌────────────────────────────┐
│ 📊 Dashboard Kasir & Admin │                        │ 💳 Customer Checkout       │
│ 🔐 Login Email & Password  │                        │ 🌐 Public Create Payment   │
│ 📜 Log Mutasi GoBiz        │                        │ ⚡ Public Status Poller    │
│ 📖 Swagger UI Docs         │                        │ 🚫 Zero Access ke Token    │
│ 🛠️ Webhook Inspector       │                        │ 🚫 Tanpa Middleware Sesi   │
└────────────────────────────┘                        └────────────────────────────┘
```

---

## 📱 Otentikasi Akun GoBiz Merchant

YuriPay menyediakan alat bantu terminal interaktif untuk otentikasi resmi akun GoBiz Anda:

```bash
npm run login
```

1. Masukkan nomor ponsel yang terdaftar aktif di aplikasi GoBiz / GoFood Merchant (contoh: `085119772671`).
2. Masukkan 4 digit kode OTP yang diterima melalui SMS atau WhatsApp dari Gojek.
3. Sesi token akan diekstraksi dan disimpan secara otomatis ke dalam file terproteksi:
   `📂 .GOPAY_SESI_JANGAN_DIHAPUS.json`
4. YuriPay memiliki sistem **auto-refresh token** yang memperbarui akses token secara berkala sebelum kedaluwarsa.

---

## 🚀 Panduan Deployment Produksi

### Metode 1: Deployment di cPanel Web Hosting (Setup Node.js App)

Banyak merchant menggunakan hosting cPanel dengan fitur CloudLinux Node.js Selector. Berikut panduan konfigurasinya:

1. **Masuk ke cPanel** &rarr; Buka menu **Setup Node.js App**.
2. Klik tombol **Create Application**:
   - **Node.js version**: Pilih versi `18.x`, `20.x`, atau `22.x`.
   - **Application mode**: Pilih `Production`.
   - **Application root**: Isi nama folder, misalnya `yuripay`.
   - **Application startup file**: Isi `server.js`.
3. Unggah seluruh berkas proyek YuriPay ke folder `yuripay` (kecuali folder `node_modules`).
4. Klik **Run NPM Install** pada panel cPanel atau jalankan via Terminal cPanel:
   ```bash
   npm install --production
   ```
5. Buka Terminal cPanel, masuk ke folder aplikasi dan jalankan otentikasi GoBiz:
   ```bash
   cd yuripay
   node login.js
   ```
6. Tambahkan konfigurasi environment pada bagian **Environment Variables** di menu cPanel atau simpan file `.env`.
7. Klik **Restart Application**. Layanan YuriPay Anda kini aktif secara stateful di cPanel!

---

### Metode 2: Deployment di Linux VPS (Ubuntu / Debian) dengan PM2 & Nginx

1. **Pasang Dependensi Sistem**:
   ```bash
   sudo apt update && sudo apt install -y nodejs npm git build-essential sqlite3
   sudo npm install -g pm2
   ```

2. **Kloning Repositori**:
   ```bash
   git clone https://github.com/myzert/yuripay.git
   cd yuripay
   npm install --production
   cp .env.example .env
   ```

3. **Login GoBiz**:
   ```bash
   npm run login
   ```

4. **Jalankan via PM2**:
   ```bash
   pm2 start ecosystem.config.js
   pm2 save
   pm2 startup
   ```

5. **Konfigurasi Reverse Proxy Nginx (Opsional)**:
   ```nginx
   server {
       server_name bayar.tokosaya.com;

       location / {
           proxy_pass http://127.0.0.1:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

---

### Metode 3: Deployment dengan Docker & Docker Compose

```bash
# Build dan jalankan container di latar belakang
docker compose up -d --build

# Periksa status container
docker compose ps

# Membaca log transaksi realtime
docker compose logs -f
```

---

### Metode 4: Deployment di Termux (Android OS)

```bash
pkg update && pkg upgrade -y
pkg install nodejs git python make clang sqlite -y
git clone https://github.com/myzert/yuripay.git
cd yuripay
npm install
cp .env.example .env
npm run login
npm start
```

---

## ⚙️ Konfigurasi Environment (.env)

| Variabel | Tipe | Wajib | Contoh / Default | Deskripsi |
| :--- | :--- | :--- | :--- | :--- |
| `DASHBOARD_PORT` | Integer | Ya | `3000` | Port listen dashboard kasir, admin, dan Swagger UI. |
| `PAYMENT_PORT` | Integer | Ya | `3001` | Port listen publik untuk checkout pelanggan (`/pay/:id`). |
| `STORE_NAME` | String | Ya | `YuriDev` | Nama toko merchant yang tertera pada invoice. |
| `APP_NAME` | String | Ya | `YURIPAY by myzert` | Nama resmi aplikasi payment gateway. |
| `STORE_LOGO_URL` | String | Tidak | `https://tokosaya.com/logo.png` | URL / path gambar logo kustom merchant. |
| `DEFAULT_SUCCESS_THEME`| String | Ya | `anime` | Tema default pembayaran: `anime` atau `default`. |
| `API_KEY` | String | Ya | `yuripay_live_key_xxx` | Kunci server rahasia untuk kalkulasi signature SHA-512. |
| `ADMIN_EMAIL` | String | Ya | `admin@example.com` | Email login panel kontrol kasir. |
| `ADMIN_PASSWORD` | String | Ya | `your_secure_password` | Kata sandi login panel kontrol kasir. |
| `SESSION_SECRET` | String | Ya | `random_secret_hash` | Kunci enkripsi cookie sesi Express. |
| `GOPAY_MERCHANT_ID` | String | Ya | `G123456789` | ID Merchant GoBiz Anda. |
| `QRIS_STATIC` | String | Ya | `000201010211...63042A62` | String QRIS Statis resmi dari aplikasi GoBiz. |
| `MIN_NOMINAL` | Integer | Ya | `50` | Batas pembayaran minimum (Rupiah). |
| `TRANSACTION_TIMEOUT_MINUTES` | Integer | Ya | `10` | Batas waktu berlakunya QRIS (menit). |

---

## 🔌 Spesifikasi API & Integrasi Midtrans

### 1. Membuat Tagihan Pembayaran (Create Payment)

- **URL**: `POST /api/create-payment` (Port 3001 atau Port 3000)
- **Headers**: `Content-Type: application/json`

#### Payload Request:
```json
{
  "amount": 10000,
  "order_id": "INV-20261026-001",
  "custom_name": "Langganan Premium 1 Bulan",
  "redirect_url": "https://tokosaya.com/finish",
  "webhook_url": "https://tokosaya.com/api/midtrans-webhook",
  "success_theme": "default",
  "use_unique_code": true
}
```

#### Payload Response (HTTP 200):
```json
{
  "success": true,
  "data": {
    "payment_id": "YURI-X89KLA2",
    "order_id": "INV-20261026-001",
    "amount": 10087,
    "custom_name": "Langganan Premium 1 Bulan",
    "payment_url": "http://localhost:3001/pay/YURI-X89KLA2",
    "qr_image": "data:image/png;base64,iVBORw0KGgo...",
    "status": "PENDING",
    "success_theme": "default",
    "redirect_url": "https://tokosaya.com/finish",
    "webhook_url": "https://tokosaya.com/api/midtrans-webhook",
    "created_at": "2026-10-26T08:00:00.000Z",
    "expires_at": "2026-10-26T08:10:00.000Z",
    "paid_at": null
  }
}
```

---

### 2. Notifikasi Webhook HTTP POST (Midtrans Identical)

Saat pembayaran sukses terverifikasi, YuriPay mengirimkan HTTP POST dengan payload berikut:

```json
{
  "transaction_time": "2026-10-26 15:05:22",
  "transaction_status": "settlement",
  "transaction_id": "TX-99812401",
  "status_message": "YuriPay payment settlement successfully verified",
  "status_code": "200",
  "signature_key": "d7a8f9c1b2e3456789abcdef...",
  "payment_type": "qris",
  "order_id": "INV-20261026-001",
  "merchant_id": "G538138242",
  "gross_amount": "10087.00",
  "currency": "IDR",
  "fraud_status": "accept"
}
```

#### Verifikasi Signature Key di PHP (Laravel / Native):
```php
<?php
$rawPayload = file_get_contents('php://input');
$notification = json_decode($rawPayload, true);

$orderId = $notification['order_id'];
$statusCode = $notification['status_code'];
$grossAmount = $notification['gross_amount'];
$serverKey = 'yuripay_live_key_9981248712'; // Sesuai API_KEY di .env

$computedSignature = hash('sha512', $orderId . $statusCode . $grossAmount . $serverKey);

if ($notification['signature_key'] === $computedSignature) {
    if ($notification['transaction_status'] === 'settlement') {
        // Pembayaran Berhasil! Berikan produk/layanan ke pengguna.
    }
    http_response_code(200);
    echo json_encode(['status' => 'OK']);
} else {
    http_response_code(403);
    echo "Invalid Signature Key";
}
```

#### Verifikasi Signature Key di Node.js (Express):
```javascript
const crypto = require('crypto');

app.post('/api/midtrans-webhook', (req, res) => {
    const { order_id, status_code, gross_amount, signature_key, transaction_status } = req.body;
    const serverKey = process.env.API_KEY || 'yuripay_live_key_9981248712';

    const rawString = `${order_id}${status_code}${gross_amount}${serverKey}`;
    const computedSignature = crypto.createHash('sha512').update(rawString).digest('hex');

    if (signature_key === computedSignature) {
        if (transaction_status === 'settlement') {
            console.log(`[PAID] Tagihan ${order_id} lunas terverifikasi!`);
        }
        return res.status(200).json({ status: 'OK' });
    }

    return res.status(403).json({ error: 'Signature Mismatch' });
});
```

---

## 📖 Dokumentasi Swagger UI

YuriPay menyertakan dokumentasi antarmuka interaktif **OpenAPI 3.0**:
- **Swagger UI**: [http://localhost:3000/docs](http://localhost:3000/docs) (atau Port 3001)
- **OpenAPI JSON Spec**: [http://localhost:3000/swagger.json](http://localhost:3000/swagger.json)
- Dilengkapi fitur pengujian langsung (*Try it out*) untuk seluruh endpoint REST API.

---

## ❓ Pertanyaan Umum (FAQ)

<details>
<summary><strong>1. Mengapa YuriPay tidak dapat di-deploy di Vercel?</strong></summary>
<p>Vercel menggunakan arsitektur serverless function yang membekukan (freeze) container seketika setelah respons HTTP selesai dikirim. Akibatnya, background polling daemon yang bertugas memeriksa mutasi GoPay akan mati seketika. Selain itu, filesystem serverless bersifat sementara (ephemeral), sehingga file database SQLite dan token sesi akan terhapus secara acak.</p>
</details>

<details>
<summary><strong>2. Berapa lama token sesi GoBiz bertahan dan apakah perlu login berulang kali?</strong></summary>
<p>Token sesi GoBiz bertahan hingga 30 hari. YuriPay memiliki fitur <em>auto-refresh token</em> yang secara otomatis memperbarui token akses di latar belakang sebelum masa berlakunya habis. Login ulang (<code>npm run login</code>) hanya diperlukan jika Anda sengaja melakukan logout dari aplikasi ponsel GoBiz.</p>
</details>

<details>
<summary><strong>3. Di mana letak string QRIS_STATIC toko saya?</strong></summary>
<p>Buka aplikasi <strong>GoBiz</strong> di ponsel Anda &rarr; Pilih menu <strong>Lainnya / QRIS</strong> &rarr; Tampilkan QR Toko Anda &rarr; Scan gambar QR tersebut menggunakan pemindai QR biasa (misal Google Lens). Teks string panjang yang diawali <code>000201010211...6304XXXX</code> adalah kode QRIS Statis Anda.</p>
</details>

<details>
<summary><strong>4. Mengapa nominal pembayaran bertambah Rp 1 perak?</strong></summary>
<p>Penambahan Rp 1 perak adalah kode unik verifikasi otomatis. Karena sistem QRIS menerima transfer dari berbagai aplikasi perbankan nasional tanpa identitas nama pengirim yang seragam, kode unik ini menjadi acuan mutlak bagi sistem untuk mencocokkan pembayaran dengan pesanan pelanggan secara 100% presisi.</p>
</details>

---

## 📄 Lisensi & Hak Cipta

Perangkat lunak ini dilisensikan di bawah lisensi terbuka resmi **[ISC License](LICENSE)**.

```
ISC License

Copyright (c) 2026 myzert (YuriDev)

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted, provided that the above
copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
```

---

<p align="center">
  Dikembangkan dengan dedikasi untuk ekosistem open-source Indonesia oleh <strong>myzert (YuriDev)</strong>.
</p>
