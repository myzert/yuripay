/**
 * ==============================================================================
 * ⚡ YuriPay - PM2 Ecosystem Configuration
 * ==============================================================================
 * Panduan Penggunaan di Linux VPS / Termux:
 *   pm2 start ecosystem.config.js
 *   pm2 save
 *   pm2 startup
 * ==============================================================================
 */

module.exports = {
  apps: [{
    name: 'yuripay-gateway',
    script: 'server.js',
    instances: 1, // Single instance wajib: menjaga stateful polling loop dan memory-locks
    exec_mode: 'fork',
    autorestart: true,
    watch: false,
    max_memory_restart: '350M',
    env: {
      NODE_ENV: 'production'
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true
  }]
};
