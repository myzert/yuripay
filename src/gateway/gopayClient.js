const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { generateDynamicQRIS } = require('./qrisHelper');

let sessionManager = null;
try {
    sessionManager = require('./sessionManager');
} catch (e) {
    console.warn('[GoPayClient] sessionManager not loaded:', e.message);
}

const GOJEK_TRANSACTIONS_URL = 'https://api.gojekapi.com/merchant-analytics/v2/merchants/transactions';
const claimedTransactions = new Map();

class GoPayClient {
    constructor() {
        this.merchantId = process.env.GOPAY_MERCHANT_ID || 'G538138242';
        this.staticQris = process.env.QRIS_STATIC || '';
    }

    getSessionInfo() {
        if (!sessionManager) return null;
        try {
            return sessionManager.loadSession();
        } catch (e) {
            return null;
        }
    }

    async createDynamicQRIS(amount) {
        const trxId = 'TRX-' + Math.random().toString(36).substring(2, 9).toUpperCase();
        const staticTemplate = this.staticQris;

        if (!staticTemplate) {
            throw new Error('QRIS_STATIC belum dikonfigurasi di file .env');
        }

        const dynamicCode = generateDynamicQRIS(staticTemplate, amount);
        if (!dynamicCode) {
            throw new Error('Gagal menghasilkan string QRIS Dinamis dari QRIS Statis.');
        }

        return {
            trx_id: trxId,
            qris_code: dynamicCode,
            amount: parseInt(amount, 10)
        };
    }

    async checkPayment(amount, startTime, trxId = null) {
        const targetAmount = parseInt(amount, 10);
        if (isNaN(targetAmount) || targetAmount <= 0) {
            return { paid: false, message: 'Nominal tidak valid' };
        }

        if (!sessionManager) {
            return { paid: false, message: 'Sesi GoPay belum tersedia' };
        }

        try {
            let headers = await sessionManager.getValidHeaders();
            if (!headers) {
                return { paid: false, message: 'Token GoPay tidak valid atau belum login' };
            }

            const merchantId = this.merchantId;
            const now = new Date();
            let startTimeMs = startTime ? new Date(startTime).getTime() : (now.getTime() - 24 * 3600 * 1000);
            startTimeMs = Math.max(0, startTimeMs - (10 * 60 * 1000));
            const startTimeISO = new Date(startTimeMs).toISOString();
            const endTimeISO = new Date(now.getTime() + 60 * 1000).toISOString();

            const fetchTx = async (activeHeaders) => {
                return await axios.get(GOJEK_TRANSACTIONS_URL, {
                    headers: activeHeaders,
                    params: {
                        from: 0,
                        page_size: 25,
                        statuses: 'SETTLEMENT,CAPTURE,REFUND,PARTIAL_REFUND',
                        payment_types: 'QRIS,GOPAY,OFFLINE_CREDIT_CARD,OFFLINE_DEBIT_CARD,CREDIT_CARD',
                        start_time: startTimeISO,
                        end_time: endTimeISO,
                        merchant_ids: merchantId
                    },
                    timeout: 8000
                });
            };

            let response;
            try {
                response = await fetchTx(headers);
            } catch (err) {
                if (err.response && err.response.status === 401) {
                    console.log('[GoPayClient] Token 401, merefresh sesi GoPay...');
                    const refreshed = await sessionManager.refreshSession();
                    if (refreshed) {
                        const newHeaders = await sessionManager.getValidHeaders();
                        response = await fetchTx(newHeaders);
                    } else {
                        throw err;
                    }
                } else {
                    throw err;
                }
            }

            const rawTransactions = response.data?.transactions || response.data?.data?.transactions || response.data?.data || [];

            for (const tx of rawTransactions) {
                const rawAmount = parseInt(tx.gross_amount || tx.real_gross_amount || tx.amount?.value || tx.amount || 0, 10);
                const txTimestamp = new Date(tx.transaction_time || tx.settlement_time || tx.created_at || 0).getTime();
                const txId = tx.id || tx.order_id || tx.wallstreet_transaction_id;

                // Match exact Rupiah or cents (e.g. 1099 or 109900)
                const isMatch = (
                    rawAmount === targetAmount ||
                    rawAmount === targetAmount * 100 ||
                    Math.round(rawAmount / 100) === targetAmount
                );

                if (isMatch && txTimestamp >= startTimeMs) {
                    const existingClaim = claimedTransactions.get(txId);

                    if (!existingClaim || (trxId && existingClaim.trxId === trxId)) {
                        claimedTransactions.set(txId, { trxId: trxId || 'claim', claimedAt: Date.now() });
                        console.log(`[GoPayClient] MATCH LUNAS! Target: Rp ${targetAmount} | TxID: ${txId}`);

                        return {
                            paid: true,
                            transaction: {
                                transaction_id: txId,
                                order_id: tx.order_id,
                                amount: targetAmount,
                                payer_issuer: tx.qris_provider_aspi_issuer || 'GoPay / Bank',
                                payment_type: tx.payment_type || 'QRIS',
                                transaction_time: tx.transaction_time || tx.settlement_time || new Date().toISOString()
                            }
                        };
                    }
                }
            }

            return { paid: false, message: 'Menunggu pembayaran masuk' };
        } catch (err) {
            console.error('[GoPayClient] Mutation fetch error:', err.response?.data || err.message);
            return { paid: false, message: 'Gagal mengecek mutasi GoPay' };
        }
    }

    async getRecentTransactions(limit = 5) {
        if (!sessionManager) return [];
        try {
            const headers = await sessionManager.getValidHeaders();
            if (!headers) return [];

            const now = new Date();
            const oneDayAgo = new Date(now.getTime() - 24 * 3600 * 1000).toISOString();

            const res = await axios.get(GOJEK_TRANSACTIONS_URL, {
                headers,
                params: {
                    from: 0,
                    page_size: limit,
                    statuses: 'SETTLEMENT,CAPTURE',
                    start_time: oneDayAgo,
                    end_time: now.toISOString(),
                    merchant_ids: this.merchantId
                },
                timeout: 6000
            });

            return res.data?.transactions || [];
        } catch (e) {
            return [];
        }
    }
}

module.exports = new GoPayClient();
