const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../../database/db');
const gopayClient = require('../../gateway/gopayClient');
const gopayAuth = require('../../gateway/gopayAuth');
const { generateQRBuffer, generateDynamicQRIS, generateUniqueAmount } = require('../../gateway/qrisHelper');
const { processOrderPayment, processTopupPayment, formatRupiah } = require('../../gateway/paymentChecker');

// In-memory store for generated dynamic QRIS checkouts
const qrisStore = new Map();

// Auth Middleware for Admin Portal
function requireAuth(req, res, next) {
    if (req.session && req.session.isAdmin) {
        return next();
    }
    return res.redirect('/login');
}

// API Key Auth Middleware
function apiKeyAuth(req, res, next) {
    const apiKey = req.headers['x-api-key'] || req.query.api_key || req.query.apikey || req.body?.api_key;
    const configuredKey = db.getSetting('gopay_api_key', process.env.GOPAY_API_KEY || 'YOUR_GOPAY_API_KEY');
    if (!apiKey || apiKey !== configuredKey) {
        return res.status(401).json({ success: false, message: 'Autentikasi Gagal: API Key tidak valid' });
    }
    next();
}

// ----------------------------------------------------
// AUTHENTICATION
// ----------------------------------------------------
router.get('/login', (req, res) => {
    if (req.session && req.session.isAdmin) return res.redirect('/');
    res.render('login', { layout: false, error: null });
});

router.post('/login', (req, res) => {
    const { username, password } = req.body;
    const adminUser = process.env.ADMIN_USERNAME || 'admin';
    const adminPass = process.env.ADMIN_PASSWORD || 'adminstore123';

    if (username === adminUser && password === adminPass) {
        req.session.isAdmin = true;
        req.session.username = username;
        return res.redirect('/');
    }
    res.render('login', { layout: false, error: 'Username atau password admin salah!' });
});

router.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/login');
});

// ----------------------------------------------------
// DASHBOARD OVERVIEW (GOPAY MERCHANT & STORE)
// ----------------------------------------------------
router.get('/', requireAuth, async (req, res) => {
    const stats = db.getDashboardStats();
    const session = gopayAuth.loadSession();
    const isGatewayLive = await gopayClient.checkHealth();

    // Fetch live mutations from GoPay for today
    let todayMutations = [];
    let todayGoPayIncome = 0;

    if (session && isGatewayLive) {
        try {
            const sm = require('../gateway/sessionManager');
            const headers = await sm.getValidHeaders();
            const now = new Date();
            const startOfDayISO = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

            const apiRes = await axios.get('https://api.gojekapi.com/merchant-analytics/v2/merchants/transactions', {
                headers,
                params: {
                    from: 0,
                    page_size: 15,
                    start_time: startOfDayISO,
                    end_time: now.toISOString(),
                    statuses: 'SETTLEMENT,CAPTURE',
                    merchant_ids: session.merchant_id || process.env.GOPAY_MERCHANT_ID || 'G538138242'
                },
                timeout: 6000
            });

            todayMutations = apiRes.data?.transactions || [];
            todayGoPayIncome = todayMutations.reduce((acc, tx) => {
                const amt = parseInt(tx.gross_amount || tx.real_gross_amount || tx.amount || 0, 10);
                // Convert from cents if needed
                return acc + (amt > 1000000 ? Math.round(amt / 100) : (amt > 100000 ? Math.round(amt / 100) : amt));
            }, 0);
        } catch (e) {
            console.warn('[Dashboard] Could not fetch live GoPay mutations:', e.message);
        }
    }

    const recentOrders = db.getAllOrders(8);

    res.render('dashboard', {
        title: 'Merchant Dashboard Overview',
        stats,
        session,
        isGatewayLive,
        todayMutations,
        todayGoPayIncome,
        recentOrders,
        formatRupiah
    });
});

// ----------------------------------------------------
// DYNAMIC QRIS GENERATOR (POS / CHECKOUT)
// ----------------------------------------------------
router.get('/qris', requireAuth, (req, res) => {
    const staticTemplate = db.getSetting('qris_static', process.env.QRIS_STATIC || '');
    res.render('qris-generator', {
        title: 'Generate Dynamic QRIS',
        staticTemplate,
        formatRupiah,
        msg: req.query.msg || null
    });
});

router.post('/qris/generate', requireAuth, async (req, res) => {
    const { nominal, custom_name } = req.body;
    const baseAmount = parseInt(nominal, 10);

    if (isNaN(baseAmount) || baseAmount < 100) {
        return res.redirect('/qris?msg=Nominal tidak valid!');
    }

    try {
        // Unique amount code (e.g. 1000 + 211 = 1211)
        const { uniqueCode, totalAmount } = generateUniqueAmount(baseAmount);
        const qrisResult = await gopayClient.createDynamicQRIS(totalAmount);
        const qrisId = qrisResult.qris_id;

        // Save in qrisStore for public checkout page
        qrisStore.set(qrisId, {
            id: qrisId,
            trxId: qrisResult.trx_id,
            amount: totalAmount,
            baseAmount,
            uniqueCode,
            qrisCode: qrisResult.qris_code,
            customName: custom_name || 'Pembayaran GoPay Merchant',
            status: 'PENDING',
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        });

        res.redirect(`/qr/${qrisId}`);
    } catch (err) {
        res.redirect(`/qris?msg=Gagal membuat QRIS: ${err.message}`);
    }
});

// ----------------------------------------------------
// PUBLIC INTERACTIVE CHECKOUT PAGE (/qr/:id)
// ----------------------------------------------------
router.get('/qr/:id', async (req, res) => {
    const { id } = req.params;
    const qris = qrisStore.get(id);

    if (!qris) {
        return res.status(404).render('login', { layout: false, error: 'Tagihan QRIS tidak ditemukan atau sudah kedaluwarsa.' });
    }

    try {
        const qrImageBuffer = await generateQRBuffer(qris.qrisCode);
        const qrBase64 = `data:image/png;base64,${qrImageBuffer.toString('base64')}`;

        res.render('checkout', {
            layout: false,
            qris,
            qrBase64,
            formatRupiah
        });
    } catch (err) {
        res.status(500).send('Gagal merender QR Code: ' + err.message);
    }
});

// ----------------------------------------------------
// LIVE MUTATIONS (MUTASI REAL-TIME GOPAY)
// ----------------------------------------------------
router.get('/mutasi', requireAuth, async (req, res) => {
    const session = gopayAuth.loadSession();
    let transactions = [];
    let error = null;

    if (!session) {
        error = 'Sesi GoPay belum ada. Silakan login OTP terlebih dahulu pada menu Login OTP.';
    } else {
        try {
            const sm = require('../gateway/sessionManager');
            const headers = await sm.getValidHeaders();
            const now = new Date();
            const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 3600 * 1000).toISOString();

            const response = await axios.get('https://api.gojekapi.com/merchant-analytics/v2/merchants/transactions', {
                headers,
                params: {
                    from: 0,
                    page_size: 50,
                    start_time: oneWeekAgo,
                    end_time: now.toISOString(),
                    statuses: 'SETTLEMENT,CAPTURE,REFUND,PARTIAL_REFUND',
                    payment_types: 'QRIS,GOPAY,OFFLINE_CREDIT_CARD,OFFLINE_DEBIT_CARD,CREDIT_CARD',
                    merchant_ids: session.merchant_id || process.env.GOPAY_MERCHANT_ID || 'G538138242'
                },
                timeout: 8000
            });

            transactions = response.data?.transactions || [];
        } catch (err) {
            error = 'Gagal mengambil mutasi dari Gojek API: ' + (err.response?.data?.errors?.[0]?.message || err.message);
        }
    }

    res.render('mutasi', {
        title: 'Mutasi Transaksi Real-Time',
        session,
        transactions,
        error,
        formatRupiah,
        msg: req.query.msg || null
    });
});

// ----------------------------------------------------
// WEB-BASED OTP LOGIN (DECODED GOPAY AUTH)
// ----------------------------------------------------
router.get('/gopay-login', requireAuth, (req, res) => {
    const session = gopayAuth.loadSession();
    res.render('gopay-login', {
        title: 'GoPay Merchant Login OTP',
        session,
        msg: req.query.msg || null
    });
});

// ----------------------------------------------------
// PRODUCTS & STOCKS MANAGEMENT
// ----------------------------------------------------
router.get('/products', requireAuth, (req, res) => {
    const products = db.getProducts(null, false);
    const categories = db.getCategories();
    res.render('products', {
        title: 'Katalog Produk & Game Keys',
        products,
        categories,
        formatRupiah,
        msg: req.query.msg || null
    });
});

router.post('/products/create', requireAuth, (req, res) => {
    const { category_id, name, description, price, image_url } = req.body;
    if (!name || !price) {
        return res.redirect('/products?msg=Nama dan harga wajib diisi!');
    }
    db.createProduct(
        category_id ? parseInt(category_id, 10) : null,
        name.trim(),
        description ? description.trim() : '',
        parseInt(price, 10),
        image_url ? image_url.trim() : null
    );
    res.redirect('/products?msg=Produk berhasil ditambahkan!');
});

router.post('/products/delete/:id', requireAuth, (req, res) => {
    db.deleteProduct(parseInt(req.params.id, 10));
    res.redirect('/products?msg=Produk telah dihapus!');
});

router.get('/stocks', requireAuth, (req, res) => {
    const productId = req.query.product_id ? parseInt(req.query.product_id, 10) : null;
    const stocks = db.getAllStocks(productId);
    const products = db.getProducts(null, false);

    res.render('stocks', {
        title: 'Manajemen Stok & Kode Key',
        stocks,
        products,
        selectedProduct: productId,
        msg: req.query.msg || null
    });
});

router.post('/stocks/bulk-import', requireAuth, (req, res) => {
    const { product_id, keys } = req.body;
    if (!product_id || !keys) {
        return res.redirect('/stocks?msg=Pilih produk dan masukkan daftar kode!');
    }
    const keyArray = keys.split(/\r?\n/).map(k => k.trim()).filter(k => k.length > 0);
    const count = db.addStocks(parseInt(product_id, 10), keyArray);
    res.redirect(`/stocks?product_id=${product_id}&msg=Berhasil mengimpor ${count} kode lisensi baru!`);
});

router.post('/stocks/delete/:id', requireAuth, (req, res) => {
    db.deleteStock(parseInt(req.params.id, 10));
    res.redirect('/stocks?msg=Stok berhasil dihapus!');
});

// ----------------------------------------------------
// TRANSACTIONS & MANUAL APPROVAL
// ----------------------------------------------------
router.get('/transactions', requireAuth, (req, res) => {
    const orders = db.getAllOrders(100);
    const topups = db.getAllTopups(100);
    res.render('transactions', {
        title: 'Riwayat Transaksi',
        orders,
        topups,
        formatRupiah,
        msg: req.query.msg || null
    });
});

router.post('/orders/manual-approve/:invoice', requireAuth, (req, res) => {
    const { invoice } = req.params;
    const order = db.getOrder(invoice);
    if (!order) return res.redirect('/transactions?msg=Pesanan tidak ditemukan!');
    if (order.status === 'PAID') return res.redirect('/transactions?msg=Pesanan ini sudah lunas!');

    const stocks = db.getAvailableStocks(order.product_id, order.quantity);
    if (stocks.length < order.quantity) {
        return res.redirect('/transactions?msg=Gagal: Stok tidak mencukupi!');
    }

    const stockIds = stocks.map(s => s.id);
    db.claimStocks(stockIds, order.id);
    const deliveredData = stocks.map(s => ({ id: s.id, content: s.content }));
    db.updateOrderStatus(invoice, 'PAID', deliveredData);

    res.redirect('/transactions?msg=Pesanan berhasil disetujui secara manual!');
});

// ----------------------------------------------------
// SETTINGS
// ----------------------------------------------------
router.get('/settings', requireAuth, async (req, res) => {
    const apiKey = db.getSetting('gopay_api_key', process.env.GOPAY_API_KEY || 'YOUR_GOPAY_API_KEY');
    const qrisStatic = db.getSetting('qris_static', process.env.QRIS_STATIC || '');
    const merchantId = db.getSetting('gopay_merchant_id', process.env.GOPAY_MERCHANT_ID || 'G538138242');
    const isGatewayLive = await gopayClient.checkHealth();

    res.render('settings', {
        title: 'Pengaturan Gateway & Merchant',
        apiKey,
        qrisStatic,
        merchantId,
        isGatewayLive,
        msg: req.query.msg || null
    });
});

router.post('/settings/save', requireAuth, (req, res) => {
    const { api_key, qris_static, merchant_id } = req.body;
    if (api_key) db.setSetting('gopay_api_key', api_key.trim());
    if (qris_static) db.setSetting('qris_static', qris_static.trim());
    if (merchant_id) db.setSetting('gopay_merchant_id', merchant_id.trim());
    res.redirect('/settings?msg=Pengaturan berhasil disimpan!');
});

// ====================================================
// REST API GATEWAY ENDPOINTS (Protected with API Key)
// ====================================================

// 1. Create Dynamic QRIS
router.all('/api/create-qris', apiKeyAuth, async (req, res) => {
    const amount = req.body?.amount || req.query?.amount;
    if (!amount || isNaN(amount) || amount <= 0) {
        return res.status(400).json({ success: false, message: 'Nominal pembayaran tidak valid' });
    }

    try {
        const qrisResult = await gopayClient.createDynamicQRIS(amount);
        const qrisId = qrisResult.qris_id;

        qrisStore.set(qrisId, {
            id: qrisId,
            trxId: qrisResult.trx_id,
            amount: parseInt(amount, 10),
            qrisCode: qrisResult.qris_code,
            status: 'PENDING',
            createdAt: new Date(),
            expiresAt: new Date(Date.now() + 10 * 60 * 1000)
        });

        const host = req.get('host');
        const protocol = req.protocol;
        const publicUrl = `${protocol}://${host}/qr/${qrisId}`;

        res.json({
            success: true,
            data: {
                qris_id: qrisId,
                trx_id: qrisResult.trx_id,
                amount: parseInt(amount, 10),
                qris_code: qrisResult.qris_code,
                checkout_url: publicUrl,
                expires_in: '10 menit'
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
});

// 2. Check Payment Status
router.all('/api/check-payment', apiKeyAuth, async (req, res) => {
    const amount = req.body?.amount || req.query?.amount;
    const startTime = req.body?.startTime || req.query?.startTime || req.query?.start_time;
    const trxId = req.body?.trx_id || req.query?.trx_id || null;

    if (!amount || isNaN(amount)) {
        return res.status(400).json({ success: false, message: 'Nominal pembayaran tidak valid' });
    }

    const result = await gopayClient.checkPayment(amount, startTime, trxId);
    if (result.paid) {
        return res.json({
            success: true,
            paid: true,
            transaction: result.transaction
        });
    }

    res.json({
        success: true,
        paid: false,
        message: result.message || 'Pembayaran belum ditemukan'
    });
});

// 3. Public QR Checkout Status (Polled by checkout frontend)
router.get('/api/qr-status/:id', async (req, res) => {
    const { id } = req.params;
    const qris = qrisStore.get(id);

    if (!qris) {
        return res.json({ success: false, status: 'NOT_FOUND', message: 'QRIS tidak ditemukan' });
    }

    if (qris.status === 'PAID') {
        return res.json({ success: true, paid: true, status: 'PAID', transaction: qris.transaction });
    }

    if (new Date() > qris.expiresAt) {
        qris.status = 'EXPIRED';
        return res.json({ success: false, paid: false, status: 'EXPIRED', message: 'QRIS telah kedaluwarsa' });
    }

    // Check with GoPay
    const result = await gopayClient.checkPayment(qris.amount, qris.createdAt, qris.trxId);
    if (result.paid) {
        qris.status = 'PAID';
        qris.transaction = result.transaction;
        qrisStore.set(id, qris);
        return res.json({ success: true, paid: true, status: 'PAID', transaction: result.transaction });
    }

    return res.json({ success: true, paid: false, status: 'PENDING', message: 'Menunggu pembayaran' });
});

// 4. Token Status
router.get('/api/token-status', apiKeyAuth, async (req, res) => {
    const isLive = await gopayClient.checkHealth();
    const session = gopayAuth.loadSession();

    res.json({
        success: true,
        data: {
            token_status: isLive ? 'valid' : 'invalid',
            merchant_id: session?.merchant_id || null,
            outlet_name: session?.outlet_name || null,
            phone_number: session?.phone_number || null,
            expires_at: session?.expires_at || null
        }
    });
});

// 5. Web-based OTP API (for interactive login)
router.post('/api/auth/request-otp', requireAuth, async (req, res) => {
    const { phone } = req.body;
    if (!phone) {
        return res.status(400).json({ success: false, message: 'Nomor HP wajib diisi' });
    }
    const result = await gopayAuth.requestOtp(phone);
    res.json(result);
});

router.post('/api/auth/verify-otp', requireAuth, async (req, res) => {
    const { otp, otp_token, phone } = req.body;
    if (!otp || !otp_token) {
        return res.status(400).json({ success: false, message: 'OTP dan token wajib diisi' });
    }
    const result = await gopayAuth.verifyOtp(otp, otp_token, phone);
    res.json(result);
});

module.exports = router;
