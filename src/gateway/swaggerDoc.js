/**
 * YuriPay OpenAPI 3.0 Specification (Swagger JSON)
 * Full Midtrans-Compatible Payment Gateway & Webhook Documentation
 */

function getSwaggerSpec(serverUrl = 'http://localhost:3000') {
    return {
        openapi: '3.0.3',
        info: {
            title: 'YURIPAY by myzert - Enterprise Dynamic QRIS Gateway & Midtrans Webhook Engine',
            version: '1.0.0',
            description: `
Dokumentasi Resmi **YURIPAY by myzert**.
Payment Gateway QRIS Dinamis Mandiri untuk Merchant GoBiz / GoPay dengan format Webhook 100% identik dengan Midtrans.

### 🌟 Fitur Utama:
1. **Idempotensi Anti-Duplikat**: Menggunakan \`order_id\` unik agar refresh browser pelanggan tidak menciptakan transaksi ganda.
2. **Skema Webhook 100% Persis Midtrans**: Notifikasi HTTP POST dengan format payload dan signature key yang identik (\`SHA512(order_id + status_code + gross_amount + ServerKey)\`).
3. **Offset Cerdas (+1 Perak)**:
   - Rp 50 s/d < Rp 1.000: strictly +1 perak.
   - Rp 1.000+: acak 1..199 perak (maksimal 200 perak).
4. **Dual Success Theme**: Mendukung tema \`anime\` (Marin Kitagawa pop-up & cute audio) dan \`default\` (Corporate fintech sound chime).
5. **Kustomisasi Logo & Branding**: Mendukung logo merchant kustom (\`STORE_LOGO_URL\`).
6. **Stateful High-Performance Architecture**: Dioptimalkan khusus untuk VPS (Ubuntu/Debian), cPanel (Node.js Selector), Docker, dan Termux.
            `,
            contact: {
                name: 'myzert (YuriDev)',
                url: 'https://github.com/myzert/yuripay'
            }
        },
        servers: [
            {
                url: serverUrl,
                description: 'Server Aktif'
            },
            {
                url: 'http://localhost:3000',
                description: 'Dashboard & Core API (Port 3000)'
            },
            {
                url: 'http://localhost:3001',
                description: 'Customer Checkout Gateway (Port 3001)'
            }
        ],
        components: {
            securitySchemes: {
                ApiKeyAuth: {
                    type: 'apiKey',
                    in: 'header',
                    name: 'x-api-key',
                    description: 'API Server Key (default: yuripay_live_key_9981248712)'
                }
            },
            schemas: {
                CreatePaymentRequest: {
                    type: 'object',
                    required: ['nominal'],
                    properties: {
                        nominal: {
                            type: 'integer',
                            example: 15000,
                            description: 'Nominal pembayaran dasar dalam Rupiah (Minimal Rp 50)'
                        },
                        order_id: {
                            type: 'string',
                            example: 'ORDER-8892',
                            description: 'ID Pesanan unik toko. Jika dikirim ulang (misal direfresh), tagihan yang sama akan dikembalikan (Idempotent).'
                        },
                        custom_name: {
                            type: 'string',
                            example: 'Pembelian Akun VIP Discord #8892',
                            description: 'Keterangan pesanan / catatan pelanggan.'
                        },
                        redirect_url: {
                            type: 'string',
                            example: 'https://tokosaya.com/selesai',
                            description: 'URL target pengalihan pelanggan setelah pembayaran sukses (membawa parameter status ala Midtrans).'
                        },
                        webhook_url: {
                            type: 'string',
                            example: 'https://tokosaya.com/api/midtrans-webhook',
                            description: 'URL endpoint webhook Anda yang akan menerima HTTP POST notifikasi otomatis ala Midtrans saat lunas.'
                        },
                        use_unique_code: {
                            type: 'boolean',
                            example: true,
                            description: 'Gunakan offset unik anti-tabrakan (default: true). 50+ cuma 1 perak, 1000+ max 199 perak.'
                        }
                    }
                },
                PaymentData: {
                    type: 'object',
                    properties: {
                        payment_id: { type: 'string', example: 'YURI-8B30QF5' },
                        order_id: { type: 'string', example: 'ORDER-8892' },
                        amount: { type: 'integer', example: 15132 },
                        custom_name: { type: 'string', example: 'Pembelian Akun VIP' },
                        payment_url: { type: 'string', example: 'http://localhost:3001/pay/YURI-8B30QF5' },
                        qr_image: { type: 'string', example: 'data:image/png;base64,iVBORw0KGgo...' },
                        status: { type: 'string', enum: ['PENDING', 'PAID', 'EXPIRED'], example: 'PENDING' },
                        redirect_url: { type: 'string', example: 'https://tokosaya.com/selesai' },
                        webhook_url: { type: 'string', example: 'https://tokosaya.com/api/webhook' },
                        created_at: { type: 'string', format: 'date-time' },
                        expires_at: { type: 'string', format: 'date-time' },
                        paid_at: { type: 'string', nullable: true }
                    }
                },
                CreatePaymentResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: true },
                        data: { $ref: '#/components/schemas/PaymentData' }
                    }
                },
                CheckPaymentResponse: {
                    type: 'object',
                    properties: {
                        success: { type: 'boolean', example: true },
                        paid: { type: 'boolean', example: true },
                        status: { type: 'string', enum: ['PENDING', 'PAID', 'EXPIRED'], example: 'PAID' },
                        redirectUrl: { type: 'string', example: 'https://tokosaya.com/selesai' },
                        transaction: {
                            type: 'object',
                            properties: {
                                transaction_id: { type: 'string', example: '01a16cf9-baa0-7000' },
                                amount: { type: 'integer', example: 15132 },
                                payer_issuer: { type: 'string', example: 'GOPAY' },
                                payment_type: { type: 'string', example: 'QRIS' }
                            }
                        }
                    }
                },
                MidtransNotificationPayload: {
                    type: 'object',
                    description: 'Payload notifikasi webhook yang dikirim YuriPay ke webhook_url toko Anda (100% Format Midtrans)',
                    properties: {
                        transaction_time: { type: 'string', example: '2026-10-24 15:46:58' },
                        transaction_status: { type: 'string', enum: ['settlement', 'pending', 'expire'], example: 'settlement' },
                        transaction_id: { type: 'string', example: '01a16cf9-baa0-7000-9fa9-617b563eb849' },
                        status_message: { type: 'string', example: 'midtrans payment notification' },
                        status_code: { type: 'string', example: '200' },
                        signature_key: { type: 'string', example: '73fbf61d032c227b9eac28684c2d47fca70f84a718293d00d12a1ab1351ae909...' },
                        payment_type: { type: 'string', example: 'qris' },
                        order_id: { type: 'string', example: 'ORDER-8892' },
                        merchant_id: { type: 'string', example: 'G538138242' },
                        gross_amount: { type: 'string', example: '15132.00' },
                        currency: { type: 'string', example: 'IDR' },
                        settlement_time: { type: 'string', example: '2026-10-24 15:47:27' },
                        issuer: { type: 'string', example: 'gopay' },
                        acquirer: { type: 'string', example: 'gopay' },
                        fraud_status: { type: 'string', example: 'accept' }
                    }
                }
            }
        },
        paths: {
            '/api/create-payment': {
                post: {
                    summary: 'Buat Tagihan QRIS Dinamis Baru (Idempotent)',
                    description: 'Menghasilkan QRIS Dinamis dan tautan redirect pembayaran. Dilengkapi proteksi anti-duplikat jika `order_id` dikirim ulang.',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/CreatePaymentRequest' }
                            }
                        }
                    },
                    responses: {
                        '200': {
                            description: 'Tagihan QRIS berhasil dibuat',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/CreatePaymentResponse' }
                                }
                            }
                        },
                        '400': { description: 'Nominal tidak valid (< Rp 50)' },
                        '500': { description: 'Kesalahan internal server' }
                    }
                }
            },
            '/api/check-payment/{id}': {
                get: {
                    summary: 'Cek Status Pembayaran Tagihan',
                    description: 'Memeriksa mutasi settlement GoPay realtime untuk tagihan ini.',
                    parameters: [
                        {
                            name: 'id',
                            in: 'path',
                            required: true,
                            schema: { type: 'string', example: 'YURI-8B30QF5' },
                            description: 'ID Tagihan YuriPay'
                        }
                    ],
                    responses: {
                        '200': {
                            description: 'Status pembayaran',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/CheckPaymentResponse' }
                                }
                            }
                        },
                        '404': { description: 'Tagihan tidak ditemukan' }
                    }
                }
            },
            '/api/payment-status/{id}': {
                get: {
                    summary: 'Status Polling Publik Customer Checkout',
                    description: 'Endpoint polling ringan khusus halaman checkout pembeli (Port 3001).',
                    parameters: [
                        {
                            name: 'id',
                            in: 'path',
                            required: true,
                            schema: { type: 'string', example: 'YURI-8B30QF5' }
                        }
                    ],
                    responses: {
                        '200': {
                            description: 'Status transaksi',
                            content: {
                                'application/json': {
                                    schema: { $ref: '#/components/schemas/CheckPaymentResponse' }
                                }
                            }
                        }
                    }
                }
            },
            '/api/webhook-test': {
                post: {
                    summary: 'Penerima Webhook Midtrans Uji Coba',
                    description: 'Endpoint dummy untuk mengetes dan memverifikasi payload notifikasi Midtrans yang dikirim YuriPay.',
                    requestBody: {
                        required: true,
                        content: {
                            'application/json': {
                                schema: { $ref: '#/components/schemas/MidtransNotificationPayload' }
                            }
                        }
                    },
                    responses: {
                        '200': {
                            description: 'Webhook diterima dengan sukses',
                            content: {
                                'application/json': {
                                    example: { status: 'OK', message: 'Notification received successfully' }
                                }
                            }
                        }
                    }
                }
            },
            '/api/recent-mutations': {
                get: {
                    summary: 'Mutasi Realtime GoPay Settlement',
                    description: 'Mengambil riwayat transaksi mutasi yang masuk langsung dari GoPay Analytics API (Memerlukan sesi login admin).',
                    responses: {
                        '200': { description: 'Daftar transaksi mutasi GoPay' }
                    }
                }
            }
        }
    };
}

module.exports = {
    getSwaggerSpec
};
