require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const path = require('path');
const gopayClient = require('./src/gateway/gopayClient');
const paymentStore = require('./src/gateway/paymentStore');
const webhookEngine = require('./src/gateway/webhookEngine');
const { getSwaggerSpec } = require('./src/gateway/swaggerDoc');

const DASHBOARD_PORT = parseInt(process.env.DASHBOARD_PORT || '3000', 10);
const PAYMENT_PORT = parseInt(process.env.PAYMENT_PORT || '3001', 10);
const STORE_NAME = process.env.STORE_NAME || 'YuriDev';
const APP_NAME = process.env.APP_NAME || 'YuriPay';
const API_KEY = process.env.API_KEY || 'yuripay_live_key_9981248712';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'zertcihuy@gmail.com';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'zertcihuy@admin#123';
const SESSION_SECRET = process.env.SESSION_SECRET || 'yuripay_super_secret_session_key_9981248712';

function getPaymentBaseUrl(req) {
    if (process.env.PAYMENT_BASE_URL) {
        return process.env.PAYMENT_BASE_URL.replace(/\/$/, '');
    }
    const host = req.get('host')?.split(':')[0] || 'localhost';
    return `http://${host}:${PAYMENT_PORT}`;
}

function formatRupiah(number) {
    return 'Rp ' + Number(number || 0).toLocaleString('id-ID');
}

// ----------------------------------------------------
// CREATE DUAL EXPRESS APPS
// ----------------------------------------------------
const dashboardApp = express();
const paymentApp = express();

// Middleware for Dashboard App (Port 3000)
dashboardApp.use(cors());
dashboardApp.use(express.json());
dashboardApp.use(express.urlencoded({ extended: true }));
dashboardApp.use(express.static(path.join(__dirname, 'public')));
dashboardApp.set('views', path.join(__dirname, 'views'));
dashboardApp.set('view engine', 'ejs');

// Session middleware for Dashboard Admin
dashboardApp.use(session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 Days
        httpOnly: true,
        sameSite: 'lax'
    }
}));

// Admin Authentication Guard Middleware
function requireAdminAuth(req, res, next) {
    if (req.session && req.session.isAdmin) {
        return next();
    }
    res.redirect('/login');
}

// Middleware for Payment App (Port 3001) - Public facing
paymentApp.use(cors());
paymentApp.use(express.json());
paymentApp.use(express.urlencoded({ extended: true }));
paymentApp.use(express.static(path.join(__dirname, 'public')));
paymentApp.set('views', path.join(__dirname, 'views'));
paymentApp.set('view engine', 'ejs');

// ====================================================
// SHARED HANDLER: CREATE PAYMENT API (WITH IDEMPOTENCY)
// ====================================================
async function handleCreatePayment(req, res) {
    try {
        const nominal = req.body.nominal || req.body.amount;
        const orderId = req.body.order_id || req.body.orderId || null;
        const customName = req.body.custom_name || req.body.memo || (orderId ? `Pesanan ${orderId}` : '');
        const redirectUrl = req.body.redirect_url || req.body.redirectUrl || '';
        const webhookUrl = req.body.webhook_url || req.body.callback_url || req.body.webhookUrl || '';
        const useUniqueCode = req.body.use_unique_code !== false && req.body.use_unique_code !== 'false';

        const baseAmount = parseInt(nominal, 10);
        if (isNaN(baseAmount) || baseAmount < 50) {
            return res.status(400).json({
                success: false,
                message: 'Nominal pembayaran tidak valid (Minimal Rp 50)'
            });
        }

        // Idempotency: If order_id exists and payment is already created,
        // it returns the exact existing payment rather than creating a new one!
        const payment = await paymentStore.createPayment({
            nominal: baseAmount,
            orderId,
            customName: customName || `Pembayaran ${STORE_NAME}`,
            redirectUrl,
            webhookUrl,
            useUniqueCode
        });

        const baseUrl = getPaymentBaseUrl(req);
        const publicData = paymentStore.sanitizePublic(payment, baseUrl);

        res.json({
            success: true,
            data: publicData
        });
    } catch (err) {
        console.error('[API Create Payment] Error:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
}

// ====================================================
// 1. DASHBOARD APP ROUTES (PORT 3000)
// ====================================================

// Login Page
dashboardApp.get('/login', (req, res) => {
    if (req.session && req.session.isAdmin) {
        return res.redirect('/');
    }
    res.render('login', {
        appName: APP_NAME,
        storeName: STORE_NAME,
        error: null,
        email: 'zertcihuy@gmail.com'
    });
});

// Login Form Submit
dashboardApp.post('/login', (req, res) => {
    const { email, password } = req.body;
    if (email === ADMIN_EMAIL && password === ADMIN_PASSWORD) {
        req.session.isAdmin = true;
        req.session.adminEmail = email;
        return res.redirect('/');
    }
    res.render('login', {
        appName: APP_NAME,
        storeName: STORE_NAME,
        error: 'Email atau Kata Sandi admin salah! Silakan coba lagi.',
        email: email || ''
    });
});

// Logout
dashboardApp.get('/logout', (req, res) => {
    if (req.session) {
        req.session.destroy(() => {
            res.redirect('/login');
        });
    } else {
        res.redirect('/login');
    }
});

// Admin Dashboard UI (Protected)
dashboardApp.get('/', requireAdminAuth, (req, res) => {
    const session = gopayClient.getSessionInfo();
    const stats = paymentStore.getStats();
    const recentPayments = paymentStore.getRecentPayments(15);
    const baseUrl = getPaymentBaseUrl(req);

    res.render('index', {
        storeName: STORE_NAME,
        appName: APP_NAME,
        apiKey: API_KEY,
        adminEmail: req.session.adminEmail || ADMIN_EMAIL,
        paymentPort: PAYMENT_PORT,
        dashboardPort: DASHBOARD_PORT,
        baseUrl,
        sessionValid: !!session?.access_token,
        stats,
        recentPayments,
        formatRupiah
    });
});

// Redirect customer pay route from Port 3000 to Port 3001
dashboardApp.get('/pay/:id', (req, res) => {
    const { id } = req.params;
    const targetUrl = `${getPaymentBaseUrl(req)}/pay/${id}`;
    res.redirect(targetUrl);
});

// Create Payment from Dashboard / Kasir or External API
dashboardApp.post('/api/create-payment', handleCreatePayment);
dashboardApp.post('/api/create-qris', handleCreatePayment);

// Check Payment Status
dashboardApp.get('/api/check-payment/:id', async (req, res) => {
    const { id } = req.params;
    const result = await paymentStore.checkPaymentStatus(id);
    res.json(result);
});

// Recent GoPay Mutations (Settlement)
dashboardApp.get('/api/recent-mutations', requireAdminAuth, async (req, res) => {
    try {
        const mutations = await gopayClient.getRecentTransactions(8);
        const formatted = mutations.map(tx => {
            const rawAmt = parseInt(tx.gross_amount || tx.real_gross_amount || tx.amount || 0, 10);
            const amount = rawAmt > 100000 ? Math.round(rawAmt / 100) : rawAmt;
            return {
                id: tx.id || tx.order_id,
                time: tx.transaction_time || tx.settlement_time,
                amount,
                issuer: tx.qris_provider_aspi_issuer || tx.payment_type || 'GOPAY',
                status: tx.transaction_status || 'SETTLEMENT'
            };
        });
        res.json({ success: true, mutations: formatted });
    } catch (e) {
        res.json({ success: false, mutations: [] });
    }
});

// Dashboard Live Stats & Transactions Table API
dashboardApp.get('/api/dashboard-data', requireAdminAuth, (req, res) => {
    const stats = paymentStore.getStats();
    const recent = paymentStore.getRecentPayments(20);
    const webhookLogs = webhookEngine.getWebhookLogs(10);
    res.json({ success: true, stats, recent, webhookLogs });
});

// Webhook Delivery Logs API
dashboardApp.get('/api/webhook-logs', requireAdminAuth, (req, res) => {
    const logs = webhookEngine.getWebhookLogs(20);
    res.json({ success: true, logs });
});

// Dummy Webhook Receiver for testing Midtrans notifications
dashboardApp.post('/api/webhook-test', (req, res) => {
    console.log('[Webhook Test Receiver] Received Midtrans Notification:');
    console.log(JSON.stringify(req.body, null, 2));
    res.status(200).json({ status: 'OK', message: 'Notification received successfully' });
});

// Swagger OpenAPI 3.0 Documentation Handlers
function handleSwaggerJson(req, res) {
    const proto = req.protocol || 'http';
    const host = req.get('host') || 'localhost';
    const serverUrl = `${proto}://${host}`;
    res.json(getSwaggerSpec(serverUrl));
}

function handleSwaggerUI(req, res) {
    res.render('swagger', {
        appName: APP_NAME,
        storeName: STORE_NAME
    });
}

dashboardApp.get('/swagger.json', handleSwaggerJson);
dashboardApp.get('/docs', handleSwaggerUI);
dashboardApp.get('/api-docs', handleSwaggerUI);

paymentApp.get('/swagger.json', handleSwaggerJson);
paymentApp.get('/docs', handleSwaggerUI);
paymentApp.get('/api-docs', handleSwaggerUI);

// ====================================================
// 2. PAYMENT APP ROUTES (PORT 3001) - CUSTOMER FACING
// ====================================================

// Customer Checkout Page
paymentApp.get('/pay/:id', async (req, res) => {
    const { id } = req.params;
    let payment = paymentStore.getPayment(id);

    if (!payment) {
        return res.status(404).render('checkout', {
            error: 'Tagihan pembayaran tidak ditemukan atau sudah dihapus.',
            storeName: STORE_NAME,
            appName: APP_NAME,
            payment: null,
            formatRupiah
        });
    }

    // If still PENDING, run a quick check with GoPay before rendering
    // so if the user reloads or re-opens after paying, it immediately renders the PAID state!
    if (payment.status === 'PENDING') {
        try {
            await paymentStore.checkPaymentStatus(id);
            payment = paymentStore.getPayment(id);
        } catch (e) {
            console.warn('[Checkout SSR check warning]:', e.message);
        }
    }

    const baseUrl = getPaymentBaseUrl(req);
    const publicPayment = paymentStore.sanitizePublic(payment, baseUrl);

    res.render('checkout', {
        error: null,
        storeName: STORE_NAME,
        appName: APP_NAME,
        payment: publicPayment,
        formatRupiah
    });
});

// Public Status Poller for Customer Checkout Page
paymentApp.get('/api/payment-status/:id', async (req, res) => {
    const { id } = req.params;
    const result = await paymentStore.checkPaymentStatus(id);
    res.json(result);
});

paymentApp.get('/api/check-payment/:id', async (req, res) => {
    const { id } = req.params;
    const result = await paymentStore.checkPaymentStatus(id);
    res.json(result);
});

// Create Payment API also available on Port 3001 for developers
paymentApp.post('/api/create-payment', handleCreatePayment);

// Fallback for root on Port 3001: Informative landing
paymentApp.get('/', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>${APP_NAME} Payment Gateway</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@500;700;800&display=swap" rel="stylesheet">
            <style>
                body { font-family: 'Plus Jakarta Sans', sans-serif; background: #0f172a; color: #f8fafc; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; text-align: center; }
                .card { background: #1e293b; padding: 40px; border-radius: 24px; border: 1px solid #334155; max-width: 420px; box-shadow: 0 20px 40px rgba(0,0,0,0.4); }
                h1 { margin: 0 0 10px; font-size: 24px; color: #38bdf8; }
                p { color: #94a3b8; font-size: 14px; line-height: 1.6; }
                .badge { display: inline-block; padding: 6px 14px; background: #0369a1; color: white; border-radius: 999px; font-size: 12px; font-weight: 700; margin-bottom: 16px; }
            </style>
        </head>
        <body>
            <div class="card">
                <div class="badge">SECURE GATEWAY ACTIVE</div>
                <h1>${APP_NAME} • ${STORE_NAME}</h1>
                <p>Halaman redirect pembayaran customer aktif di port ini (Port ${PAYMENT_PORT}). Masuk melalui tautan pembayaran pesanan Anda (contoh: <code>/pay/YURI-XXXXXX</code>).</p>
            </div>
        </body>
        </html>
    `);
});

// ----------------------------------------------------
// START SERVERS ON BOTH PORTS
// ----------------------------------------------------
dashboardApp.listen(DASHBOARD_PORT, () => {
    console.log('================================================================');
    console.log(`📊 ${APP_NAME} DASHBOARD & KASIR: http://localhost:${DASHBOARD_PORT}`);
    console.log(`🔐 Admin: ${ADMIN_EMAIL} (Password Protected)`);
    console.log(`🏬 Merchant: ${STORE_NAME} | Keamanan Port Terisolasi`);
    console.log('================================================================');
});

paymentApp.listen(PAYMENT_PORT, () => {
    console.log('================================================================');
    console.log(`💳 ${APP_NAME} CUSTOMER CHECKOUT GATEWAY: http://localhost:${PAYMENT_PORT}/pay/:id`);
    console.log(`🔐 Port Customer Terpisah (Bebas dari Bocoran Token/Rahasia)`);
    console.log('================================================================');
});
