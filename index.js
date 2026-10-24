require('dotenv').config();
const { createWebServer } = require('./src/web/server');
const { startPaymentChecker, stopPaymentChecker } = require('./src/gateway/paymentChecker');
const db = require('./src/database/db');

async function main() {
    console.log('========================================================');
    console.log('🚀 GOPAY MERCHANT API GATEWAY & DIGITAL STORE PORTAL');
    console.log('========================================================');

    // Start Web Admin Portal & API Gateway
    const { server } = createWebServer();

    // Start background auto-verification loop
    startPaymentChecker();
    console.log('[System] Background payment verifier started (8s interval).');

    // Graceful Shutdown
    const shutdown = () => {
        console.log('\n[System] Gracefully shutting down...');
        stopPaymentChecker();
        server.close();
        db.db.close();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}

main().catch(err => {
    console.error('Fatal startup error:', err);
});
