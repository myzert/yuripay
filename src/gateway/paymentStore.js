const db = require('../database/db');
const gopayClient = require('./gopayClient');
const { generateQRBuffer, generateUniqueAmount } = require('./qrisHelper');
const webhookEngine = require('./webhookEngine');

// In-memory cache for ultra-fast polling
const activePayments = new Map();

// Initialize SQLite table for YuriPay transactions
function initPaymentTable() {
    try {
        db.db.exec(`
            CREATE TABLE IF NOT EXISTS yuripay_payments (
                id TEXT PRIMARY KEY,
                order_id TEXT,
                trx_id TEXT,
                base_amount INTEGER NOT NULL,
                unique_code INTEGER DEFAULT 0,
                total_amount INTEGER NOT NULL,
                custom_name TEXT,
                redirect_url TEXT,
                webhook_url TEXT,
                qris_code TEXT,
                qr_image TEXT,
                status TEXT DEFAULT 'PENDING',
                webhook_sent INTEGER DEFAULT 0,
                transaction_data TEXT,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                expires_at DATETIME,
                paid_at DATETIME
            );
        `);

        // Migration: ensure columns order_id, webhook_url, webhook_sent, success_theme exist
        const columns = db.db.prepare("PRAGMA table_info(yuripay_payments)").all().map(c => c.name);
        if (!columns.includes('order_id')) {
            db.db.exec("ALTER TABLE yuripay_payments ADD COLUMN order_id TEXT;");
        }
        if (!columns.includes('webhook_url')) {
            db.db.exec("ALTER TABLE yuripay_payments ADD COLUMN webhook_url TEXT;");
        }
        if (!columns.includes('webhook_sent')) {
            db.db.exec("ALTER TABLE yuripay_payments ADD COLUMN webhook_sent INTEGER DEFAULT 0;");
        }
        if (!columns.includes('success_theme')) {
            db.db.exec("ALTER TABLE yuripay_payments ADD COLUMN success_theme TEXT DEFAULT 'anime';");
        }

        // Load active pending payments into memory
        const stmt = db.db.prepare(`
            SELECT * FROM yuripay_payments 
            WHERE status = 'PENDING' AND datetime(expires_at) > datetime('now')
            ORDER BY created_at DESC
        `);
        const rows = stmt.all();
        for (const row of rows) {
            activePayments.set(row.id, {
                id: row.id,
                orderId: row.order_id,
                trxId: row.trx_id,
                baseAmount: row.base_amount,
                uniqueCode: row.unique_code,
                totalAmount: row.total_amount,
                customName: row.custom_name,
                redirectUrl: row.redirect_url,
                webhookUrl: row.webhook_url,
                webhookSent: !!row.webhook_sent,
                successTheme: row.success_theme || process.env.DEFAULT_SUCCESS_THEME || 'anime',
                qrisCode: row.qris_code,
                qrImage: row.qr_image,
                status: row.status,
                createdAt: new Date(row.created_at),
                expiresAt: new Date(row.expires_at),
                paidAt: row.paid_at ? new Date(row.paid_at) : null,
                transaction: row.transaction_data ? JSON.parse(row.transaction_data) : null
            });
        }
        console.log(`[PaymentStore] Initialized. Loaded ${activePayments.size} pending payments.`);
    } catch (err) {
        console.error('[PaymentStore] Init table error:', err.message);
    }
}

initPaymentTable();

/**
 * Find payment by external orderId
 */
function findByOrderId(orderId) {
    if (!orderId) return null;
    // Check in-memory first
    for (const p of activePayments.values()) {
        if (p.orderId === orderId) {
            return p;
        }
    }
    // Check DB
    try {
        const row = db.db.prepare('SELECT * FROM yuripay_payments WHERE order_id = ? ORDER BY created_at DESC LIMIT 1').get(orderId);
        if (row) {
            return mapRowToPayment(row);
        }
    } catch (e) {
        console.error('[PaymentStore] findByOrderId error:', e.message);
    }
    return null;
}

function mapRowToPayment(row) {
    return {
        id: row.id,
        orderId: row.order_id,
        trxId: row.trx_id,
        baseAmount: row.base_amount,
        uniqueCode: row.unique_code,
        totalAmount: row.total_amount,
        customName: row.custom_name,
        redirectUrl: row.redirect_url,
        webhookUrl: row.webhook_url,
        webhookSent: !!row.webhook_sent,
        successTheme: row.success_theme || process.env.DEFAULT_SUCCESS_THEME || 'anime',
        qrisCode: row.qris_code,
        qrImage: row.qr_image,
        status: row.status,
        createdAt: new Date(row.created_at),
        expiresAt: new Date(row.expires_at),
        paidAt: row.paid_at ? new Date(row.paid_at) : null,
        transaction: row.transaction_data ? JSON.parse(row.transaction_data) : null
    };
}

/**
 * Create dynamic payment transaction with IDEMPOTENCY check
 * Prevents creating a new payment on page refresh / network retry!
 */
async function createPayment({ nominal, orderId = null, customName, redirectUrl, webhookUrl, successTheme = null, useUniqueCode = true }) {
    const baseAmount = parseInt(nominal, 10);
    if (isNaN(baseAmount) || baseAmount < 50) {
        throw new Error('Nominal tidak valid (Minimal Rp 50)');
    }

    // 1. IDEMPOTENCY CHECK:
    // If orderId is supplied and exists, reuse it to prevent duplicate payments on refresh!
    if (orderId) {
        const existing = findByOrderId(orderId);
        if (existing) {
            // If still pending and not expired, return existing
            if (existing.status === 'PENDING' && new Date() < existing.expiresAt) {
                console.log(`[PaymentStore] Idempotency Hit: Returning existing PENDING payment ${existing.id} for order ${orderId}`);
                return existing;
            }
            // If already paid, return existing
            if (existing.status === 'PAID') {
                console.log(`[PaymentStore] Idempotency Hit: Order ${orderId} is already PAID (${existing.id})`);
                return existing;
            }
        }
    }

    let uniqueCode = 0;
    let totalAmount = baseAmount;

    if (useUniqueCode) {
        const pendingAmounts = Array.from(activePayments.values())
            .filter(p => p.status === 'PENDING')
            .map(p => p.totalAmount);
        const gen = generateUniqueAmount(baseAmount, pendingAmounts);
        uniqueCode = gen.uniqueCode;
        totalAmount = gen.totalAmount;
    }

    // Generate dynamic QRIS
    const qrisResult = await gopayClient.createDynamicQRIS(totalAmount);
    const paymentId = 'YURI-' + Math.random().toString(36).substring(2, 9).toUpperCase();
    const finalOrderId = orderId || paymentId;

    // Generate Base64 QR Image
    const qrBuffer = await generateQRBuffer(qrisResult.qris_code);
    const qrImage = `data:image/png;base64,${qrBuffer.toString('base64')}`;

    const timeoutMinutes = parseInt(process.env.TRANSACTION_TIMEOUT_MINUTES || '10', 10);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + timeoutMinutes * 60 * 1000);

    const payment = {
        id: paymentId,
        orderId: finalOrderId,
        trxId: qrisResult.trx_id,
        baseAmount,
        uniqueCode,
        totalAmount,
        customName: customName || `Pembayaran ${process.env.STORE_NAME || 'YuriDev'}`,
        redirectUrl: redirectUrl || null,
        webhookUrl: webhookUrl || null,
        webhookSent: false,
        successTheme: successTheme || process.env.DEFAULT_SUCCESS_THEME || 'anime',
        qrisCode: qrisResult.qris_code,
        qrImage,
        status: 'PENDING',
        createdAt: now,
        expiresAt,
        paidAt: null,
        transaction: null
    };

    // Save in memory
    activePayments.set(paymentId, payment);

    // Persist in SQLite
    try {
        const insertStmt = db.db.prepare(`
            INSERT INTO yuripay_payments 
            (id, order_id, trx_id, base_amount, unique_code, total_amount, custom_name, redirect_url, webhook_url, success_theme, qris_code, qr_image, status, webhook_sent, created_at, expires_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
        `);
        insertStmt.run(
            paymentId,
            finalOrderId,
            payment.trxId,
            baseAmount,
            uniqueCode,
            totalAmount,
            payment.customName,
            payment.redirectUrl,
            payment.webhookUrl,
            payment.successTheme,
            payment.qrisCode,
            payment.qrImage,
            'PENDING',
            now.toISOString(),
            expiresAt.toISOString()
        );
    } catch (e) {
        console.error('[PaymentStore] Save DB error:', e.message);
    }

    return payment;
}

/**
 * Retrieve payment by ID
 */
function getPayment(paymentId) {
    if (!paymentId) return null;
    try {
        const row = db.db.prepare('SELECT * FROM yuripay_payments WHERE id = ?').get(paymentId);
        if (row) {
            const payment = mapRowToPayment(row);
            activePayments.set(row.id, payment);
            return payment;
        }
    } catch (e) {
        console.error('[PaymentStore] Get DB error:', e.message);
    }
    return activePayments.get(paymentId) || null;
}

/**
 * Check payment status and verify with GoPay settlement
 * Auto-triggers Midtrans-compatible Webhook if PAID
 */
async function checkPaymentStatus(paymentId) {
    const payment = getPayment(paymentId);
    if (!payment) {
        return { success: false, notFound: true, message: 'Tagihan tidak ditemukan' };
    }

    if (payment.status === 'PAID') {
        return {
            success: true,
            paid: true,
            status: 'PAID',
            transaction: payment.transaction,
            redirectUrl: payment.redirectUrl,
            webhookUrl: payment.webhookUrl
        };
    }

    if (new Date() > payment.expiresAt) {
        payment.status = 'EXPIRED';
        updatePaymentStatus(payment.id, 'EXPIRED');

        // Trigger expire webhook if not yet notified
        if (payment.webhookUrl && !payment.webhookSent) {
            payment.webhookSent = true;
            markWebhookSent(payment.id);
            webhookEngine.sendWebhook(payment, null, 'expire').catch(err => {
                console.warn('[PaymentStore] Expire webhook error:', err.message);
            });
        }

        return {
            success: false,
            paid: false,
            status: 'EXPIRED',
            message: 'QRIS sudah kedaluwarsa'
        };
    }

    // Call GoPay verification
    const result = await gopayClient.checkPayment(payment.totalAmount, payment.createdAt, payment.trxId);

    if (result.paid) {
        payment.status = 'PAID';
        payment.paidAt = new Date();
        payment.transaction = result.transaction;
        activePayments.set(paymentId, payment);

        updatePaymentStatus(payment.id, 'PAID', result.transaction, payment.paidAt);

        // TRIGGER MIDTRANS-COMPATIBLE WEBHOOK NOTIFICATION!
        if (payment.webhookUrl && !payment.webhookSent) {
            payment.webhookSent = true;
            markWebhookSent(payment.id);
            webhookEngine.sendWebhook(payment, result.transaction, 'settlement').catch(err => {
                console.error('[PaymentStore] Webhook dispatch error:', err.message);
            });
        }

        return {
            success: true,
            paid: true,
            status: 'PAID',
            transaction: result.transaction,
            redirectUrl: payment.redirectUrl,
            webhookUrl: payment.webhookUrl
        };
    }

    return {
        success: true,
        paid: false,
        status: 'PENDING',
        message: result.message || 'Menunggu pembayaran transfer'
    };
}

function updatePaymentStatus(paymentId, status, transaction = null, paidAt = null) {
    try {
        const stmt = db.db.prepare(`
            UPDATE yuripay_payments 
            SET status = ?, transaction_data = ?, paid_at = ?
            WHERE id = ?
        `);
        stmt.run(
            status,
            transaction ? JSON.stringify(transaction) : null,
            paidAt ? paidAt.toISOString() : null,
            paymentId
        );
    } catch (e) {
        console.error('[PaymentStore] Update DB error:', e.message);
    }
}

function markWebhookSent(paymentId) {
    try {
        db.db.prepare('UPDATE yuripay_payments SET webhook_sent = 1 WHERE id = ?').run(paymentId);
    } catch (e) {
        console.error('[PaymentStore] markWebhookSent error:', e.message);
    }
}

/**
 * List recent payments for dashboard
 */
function getRecentPayments(limit = 20) {
    try {
        const rows = db.db.prepare(`
            SELECT id, order_id, base_amount, unique_code, total_amount, custom_name, redirect_url, webhook_url, status, webhook_sent, created_at, expires_at, paid_at
            FROM yuripay_payments 
            ORDER BY created_at DESC 
            LIMIT ?
        `).all(limit);
        return rows;
    } catch (e) {
        console.error('[PaymentStore] Get recent error:', e.message);
        return [];
    }
}

/**
 * Get dashboard statistics
 */
function getStats() {
    try {
        const totalSalesRow = db.db.prepare(`
            SELECT 
                COUNT(*) as total_count,
                SUM(CASE WHEN status = 'PAID' THEN total_amount ELSE 0 END) as total_volume,
                SUM(CASE WHEN status = 'PAID' THEN 1 ELSE 0 END) as paid_count,
                SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) as pending_count
            FROM yuripay_payments
            WHERE date(created_at) = date('now')
        `).get();

        return {
            todayVolume: totalSalesRow.total_volume || 0,
            todaySuccess: totalSalesRow.paid_count || 0,
            todayPending: totalSalesRow.pending_count || 0,
            todayTotal: totalSalesRow.total_count || 0
        };
    } catch (e) {
        return { todayVolume: 0, todaySuccess: 0, todayPending: 0, todayTotal: 0 };
    }
}

/**
 * Sanitize payment object for public response (No secrets exposed)
 */
function sanitizePublic(payment, baseUrl = '') {
    if (!payment) return null;
    const expiresDate = payment.expiresAt instanceof Date ? payment.expiresAt : (payment.expires_at ? new Date(payment.expires_at) : null);
    const createdDate = payment.createdAt instanceof Date ? payment.createdAt : (payment.created_at ? new Date(payment.created_at) : null);
    const paidDate = payment.paidAt instanceof Date ? payment.paidAt : (payment.paid_at ? new Date(payment.paid_at) : null);

    return {
        payment_id: payment.id,
        order_id: payment.orderId || payment.order_id || payment.id,
        amount: payment.totalAmount || payment.total_amount,
        base_amount: payment.baseAmount || payment.base_amount || (payment.totalAmount || payment.total_amount),
        unique_code: payment.uniqueCode || payment.unique_code || 0,
        custom_name: payment.customName || payment.custom_name,
        payment_url: `${baseUrl}/pay/${payment.id}`,
        qr_image: payment.qrImage || payment.qr_image,
        qris_code: payment.qrisCode || payment.qris_code || null,
        status: payment.status,
        success_theme: payment.successTheme || payment.success_theme || process.env.DEFAULT_SUCCESS_THEME || 'anime',
        redirect_url: payment.redirectUrl || payment.redirect_url || null,
        webhook_url: payment.webhookUrl || payment.webhook_url || null,
        created_at: createdDate ? createdDate.toISOString() : null,
        created_timestamp: createdDate ? createdDate.getTime() : 0,
        expires_at: expiresDate ? expiresDate.toISOString() : null,
        expires_timestamp: expiresDate ? expiresDate.getTime() : 0,
        paid_at: paidDate ? paidDate.toISOString() : null,
        paid_timestamp: paidDate ? paidDate.getTime() : 0
    };
}

module.exports = {
    createPayment,
    getPayment,
    findByOrderId,
    checkPaymentStatus,
    getRecentPayments,
    getStats,
    sanitizePublic
};
