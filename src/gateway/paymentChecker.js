const db = require('../database/db');
const gopayClient = require('./gopayClient');

let checkInterval = null;

/**
 * Format currency to IDR
 */
function formatRupiah(number) {
    return 'Rp ' + Number(number).toLocaleString('id-ID');
}

/**
 * Process single order payment
 */
async function processOrderPayment(order) {
    if (order.status !== 'PENDING') return { success: false, status: order.status };

    // Check expiration
    if (new Date(order.expires_at) < new Date()) {
        db.updateOrderStatus(order.invoice, 'EXPIRED');
        return { success: false, status: 'EXPIRED', message: 'Pesanan telah kedaluwarsa' };
    }

    // Call GoPay verification
    const check = await gopayClient.checkPayment(order.total_price, order.created_at, order.trx_id);

    if (check.paid) {
        // Claim stock
        const stocks = db.getAvailableStocks(order.product_id, order.quantity);
        const stockIds = stocks.map(s => s.id);
        if (stockIds.length > 0) {
            db.claimStocks(stockIds, order.id);
        }

        const deliveredData = stocks.map(s => ({ id: s.id, content: s.content }));
        db.updateOrderStatus(order.invoice, 'PAID', deliveredData);

        console.log(`[PaymentChecker] Order ${order.invoice} successfully paid via GoPay! Items delivered: ${stocks.length}`);

        return { success: true, status: 'PAID', items: stocks, transaction: check.transaction };
    }

    return { success: false, status: 'PENDING', message: check.message || 'Pembayaran belum terdeteksi' };
}

/**
 * Process single topup payment
 */
async function processTopupPayment(topup) {
    if (topup.status !== 'PENDING') return { success: false, status: topup.status };

    if (new Date(topup.expires_at) < new Date()) {
        db.updateTopupStatus(topup.invoice, 'EXPIRED');
        return { success: false, status: 'EXPIRED', message: 'Top up telah kedaluwarsa' };
    }

    const check = await gopayClient.checkPayment(topup.total_amount, topup.created_at, topup.trx_id);

    if (check.paid) {
        db.updateTopupStatus(topup.invoice, 'PAID');
        console.log(`[PaymentChecker] Topup ${topup.invoice} successfully verified! Total: Rp ${topup.total_amount}`);
        return { success: true, status: 'PAID', transaction: check.transaction };
    }

    return { success: false, status: 'PENDING', message: check.message || 'Pembayaran belum terdeteksi' };
}

/**
 * Start background polling loop
 */
function startPaymentChecker() {
    if (checkInterval) clearInterval(checkInterval);

    checkInterval = setInterval(async () => {
        try {
            // Check pending QRIS orders
            const pendingOrders = db.getPendingOrders().filter(o => o.payment_method === 'QRIS');
            for (const order of pendingOrders) {
                await processOrderPayment(order);
            }

            // Check pending topups
            const pendingTopups = db.getPendingTopups();
            for (const topup of pendingTopups) {
                await processTopupPayment(topup);
            }
        } catch (err) {
            console.error('[PaymentChecker] Polling error:', err.message);
        }
    }, 8000); // Poll every 8s
}

function stopPaymentChecker() {
    if (checkInterval) {
        clearInterval(checkInterval);
        checkInterval = null;
    }
}

module.exports = {
    startPaymentChecker,
    stopPaymentChecker,
    processOrderPayment,
    processTopupPayment,
    formatRupiah
};
