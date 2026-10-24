const axios = require('axios');
const crypto = require('crypto');
const db = require('../database/db');

// Initialize SQLite table for webhook delivery logs
function initWebhookTable() {
    try {
        db.db.exec(`
            CREATE TABLE IF NOT EXISTS webhook_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                payment_id TEXT NOT NULL,
                order_id TEXT NOT NULL,
                webhook_url TEXT NOT NULL,
                status_code INTEGER,
                response_body TEXT,
                payload TEXT,
                status TEXT, -- 'SUCCESS' | 'FAILED'
                attempts INTEGER DEFAULT 1,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
        `);
    } catch (err) {
        console.error('[WebhookEngine] Init table error:', err.message);
    }
}

initWebhookTable();

/**
 * Format date to standard Midtrans format: 'YYYY-MM-DD HH:mm:ss'
 */
function formatMidtransDate(dateObj) {
    const d = dateObj ? new Date(dateObj) : new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/**
 * Build 100% Midtrans-Compatible HTTP Notification Payload
 */
function buildMidtransPayload(payment, transaction, statusCode = '200', transactionStatus = 'settlement') {
    const serverKey = process.env.API_KEY || 'yuripay_live_key_9981248712';
    const merchantId = process.env.GOPAY_MERCHANT_ID || 'G538138242';
    const orderId = payment.orderId || payment.customName || payment.id;
    const grossAmount = Number(payment.totalAmount || payment.total_amount || 0).toFixed(2);

    // Midtrans Signature Key: SHA512(order_id + status_code + gross_amount + ServerKey)
    const signatureRaw = `${orderId}${statusCode}${grossAmount}${serverKey}`;
    const signatureKey = crypto.createHash('sha512').update(signatureRaw).digest('hex');

    const txTime = formatMidtransDate(payment.createdAt || payment.created_at);
    const settleTime = formatMidtransDate(payment.paidAt || payment.paid_at || new Date());

    return {
        transaction_time: txTime,
        transaction_status: transactionStatus, // 'settlement' | 'pending' | 'expire' | 'cancel'
        transaction_id: transaction?.transaction_id || payment.trxId || `TX-${Date.now()}`,
        status_message: 'midtrans payment notification',
        status_code: statusCode,
        signature_key: signatureKey,
        payment_type: 'qris',
        order_id: orderId,
        merchant_id: merchantId,
        gross_amount: grossAmount,
        currency: 'IDR',
        settlement_time: settleTime,
        issuer: (transaction?.payer_issuer || 'gopay').toLowerCase(),
        acquirer: 'gopay',
        fraud_status: 'accept',
        expiry_time: formatMidtransDate(payment.expiresAt || payment.expires_at)
    };
}

/**
 * Send Webhook Notification to Merchant's Webhook URL
 */
async function sendWebhook(payment, transaction, event = 'settlement') {
    const targetUrl = payment.webhookUrl || payment.webhook_url;
    if (!targetUrl) {
        return { skipped: true, message: 'No webhook_url provided for this transaction' };
    }

    const statusCode = event === 'settlement' ? '200' : (event === 'expire' ? '202' : '201');
    const transactionStatus = event === 'settlement' ? 'settlement' : (event === 'expire' ? 'expire' : 'pending');
    const payload = buildMidtransPayload(payment, transaction, statusCode, transactionStatus);
    const orderId = payment.orderId || payment.customName || payment.id;

    console.log(`[WebhookEngine] Dispatching Midtrans notification for ${payment.id} to ${targetUrl}...`);

    let responseCode = null;
    let responseData = '';
    let success = false;
    let attempts = 0;
    const maxAttempts = 3;

    while (attempts < maxAttempts && !success) {
        attempts++;
        try {
            const res = await axios.post(targetUrl, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'YuriPay-Webhook-Engine/1.0 (Midtrans Compatible)',
                    'X-YuriPay-Signature': payload.signature_key
                },
                timeout: 7000
            });
            responseCode = res.status;
            responseData = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
            if (responseCode >= 200 && responseCode < 300) {
                success = true;
                console.log(`[WebhookEngine] Webhook delivered successfully to ${targetUrl} (HTTP ${responseCode})`);
            }
        } catch (err) {
            responseCode = err.response ? err.response.status : 500;
            responseData = err.response ? (typeof err.response.data === 'string' ? err.response.data : JSON.stringify(err.response.data)) : err.message;
            console.warn(`[WebhookEngine] Attempt ${attempts} failed (${responseCode}): ${err.message}`);
            if (attempts < maxAttempts) {
                await new Promise(r => setTimeout(r, 1500 * attempts));
            }
        }
    }

    // Save Delivery Log in SQLite
    try {
        const stmt = db.db.prepare(`
            INSERT INTO webhook_logs 
            (payment_id, order_id, webhook_url, status_code, response_body, payload, status, attempts)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `);
        stmt.run(
            payment.id,
            orderId,
            targetUrl,
            responseCode,
            responseData.substring(0, 1000),
            JSON.stringify(payload),
            success ? 'SUCCESS' : 'FAILED',
            attempts
        );
    } catch (e) {
        console.error('[WebhookEngine] Save log error:', e.message);
    }

    return {
        success,
        attempts,
        responseCode,
        payload
    };
}

/**
 * Retrieve recent webhook logs for dashboard
 */
function getWebhookLogs(limit = 15) {
    try {
        const rows = db.db.prepare(`
            SELECT * FROM webhook_logs 
            ORDER BY created_at DESC 
            LIMIT ?
        `).all(limit);
        return rows;
    } catch (e) {
        return [];
    }
}

module.exports = {
    buildMidtransPayload,
    sendWebhook,
    getWebhookLogs
};
