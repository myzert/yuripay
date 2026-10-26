#!/usr/bin/env node

/**
 * ============================================================================
 * ⚡ YuriPay - GoBiz / GoPay Official Merchant Login Assistant
 * ============================================================================
 * Tool interaktif resmi untuk mengotentikasi akun GoBiz / GoFood Merchant Anda
 * dan menghasilkan file sesi aman (.GOPAY_SESI_JANGAN_DIHAPUS.json) untuk YuriPay.
 */

const readline = require('readline');
const { requestOtp, verifyOtp } = require('./src/gateway/gopayAuth');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function ask(query) {
    return new Promise(resolve => rl.question(query, resolve));
}

// ANSI Color Helpers
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    cyan: '\x1b[36m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    magenta: '\x1b[35m',
    bgBlue: '\x1b[44m',
};

async function main() {
    console.clear();
    console.log(`${colors.cyan}${colors.bright}
  ██╗   ██╗██╗   ██╗██████╗ ██╗██████╗  █████╗ ██╗   ██╗
  ╚██╗ ██╔╝██║   ██║██╔══██╗██║██╔══██╗██╔══██╗╚██╗ ██╔╝
   ╚████╔╝ ██║   ██║██████╔╝██║██████╔╝███████║ ╚████╔╝ 
    ╚██╔╝  ██║   ██║██╔══██╗██║██╔═══╝ ██╔══██║  ╚██╔╝  
     ██║   ╚██████╔╝██║  ██║██║██║     ██║  ██║   ██║   
     ╚═╝    ╚═════╝ ╚═╝  ╚═╝╚═╝╚═╝     ╚═╝  ╚═╝   ╚═╝   
    ${colors.reset}`);
    console.log(`${colors.bright}⚡ YURIPAY by myzert - GoBiz Official Merchant Authentication Assistant${colors.reset}`);
    console.log(`${colors.dim}----------------------------------------------------------------------${colors.reset}`);
    console.log(`${colors.yellow}Petunjuk Penting:${colors.reset}`);
    console.log(` 1. Pastikan nomor HP yang Anda masukkan terdaftar aktif di aplikasi GoBiz / GoFood Merchant.`);
    console.log(` 2. Kode OTP 4 digit akan dikirimkan oleh Gojek/GoBiz melalui SMS atau WhatsApp.`);
    console.log(` 3. Sesi token akan disimpan ke file lokal ${colors.green}.GOPAY_SESI_JANGAN_DIHAPUS.json${colors.reset}.`);
    console.log(`${colors.dim}----------------------------------------------------------------------${colors.reset}\n`);

    const rawPhone = await ask(`${colors.bright}>> Masukkan Nomor HP GoBiz Anda (contoh: 085119772671): ${colors.reset}`);
    if (!rawPhone || rawPhone.trim().length < 9) {
        console.log(`\n${colors.red}[✕] Error: Nomor HP tidak valid atau terlalu pendek!${colors.reset}`);
        rl.close();
        return;
    }

    console.log(`\n${colors.cyan}[*] Menghubungi GoBiz API untuk meminta kode OTP ke: ${rawPhone.trim()}...${colors.reset}`);
    const otpRes = await requestOtp(rawPhone.trim());

    if (!otpRes.success) {
        console.log(`\n${colors.red}[✕] Gagal mengirim OTP: ${otpRes.message}${colors.reset}`);
        console.log(`\n${colors.yellow}💡 Tips Troubleshooting:${colors.reset}`);
        console.log(` • Pastikan nomor HP diawali 08xx atau 62xx dan terdaftar di GoBiz.`);
        console.log(` • Jika baru saja meminta OTP, tunggu 1-2 menit sebelum mencoba kembali.`);
        console.log(` • Periksa sinyal seluler atau koneksi internet pada ponsel Anda.`);
        rl.close();
        return;
    }

    console.log(`\n${colors.green}[✔] Permintaan OTP BERHASIL!${colors.reset}`);
    console.log(`${colors.dim}Kode OTP 4 digit telah dikirim ke nomor Anda. Berlaku selama ${otpRes.expires_in} detik.${colors.reset}\n`);

    const otpCode = await ask(`${colors.bright}>> Masukkan 4 Digit Kode OTP: ${colors.reset}`);
    if (!otpCode || otpCode.trim().length !== 4) {
        console.log(`\n${colors.red}[✕] Error: Kode OTP harus berupa 4 digit angka!${colors.reset}`);
        rl.close();
        return;
    }

    console.log(`\n${colors.cyan}[*] Memverifikasi kode OTP ke server resmi GoBiz...${colors.reset}`);
    const verifyRes = await verifyOtp(otpCode.trim(), otpRes.otp_token, otpRes.phone);

    if (!verifyRes.success) {
        console.log(`\n${colors.red}[✕] Verifikasi Gagal: ${verifyRes.message}${colors.reset}`);
        console.log(`${colors.yellow}Pastikan kode OTP yang Anda ketikkan sesuai dengan SMS/WA terbaru.${colors.reset}`);
        rl.close();
        return;
    }

    const s = verifyRes.session;
    console.log(`\n${colors.green}${colors.bright}======================================================================${colors.reset}`);
    console.log(`${colors.green}${colors.bright}   🎉 [SUCCESS] OTENTIKASI BERHASIL & SESI GOBIZ AKTIF!               ${colors.reset}`);
    console.log(`${colors.green}${colors.bright}======================================================================${colors.reset}`);
    console.log(`  Nama Outlet  : ${colors.bright}${s.outlet_name || 'Outlet Merchant'}${colors.reset}`);
    console.log(`  Merchant ID  : ${colors.cyan}${s.merchant_id || '-'}${colors.reset}`);
    console.log(`  Nomor HP     : ${s.phone_number}`);
    console.log(`  Masa Berlaku : ${s.expires_at}`);
    console.log(`\n${colors.yellow}File sesi telah disimpan ke:${colors.reset}`);
    console.log(`  📂 ${colors.green}.GOPAY_SESI_JANGAN_DIHAPUS.json${colors.reset}`);
    console.log(`\n${colors.cyan}Sekarang Anda dapat menjalankan server YuriPay:${colors.reset}`);
    console.log(`  ${colors.bright}npm start${colors.reset}`);
    console.log(`\nDashboard Kasir & Admin akan aktif di: ${colors.green}http://localhost:3000${colors.reset}`);
    console.log(`Customer Checkout Gateway di:         ${colors.green}http://localhost:3001/pay/:id${colors.reset}\n`);

    rl.close();
}

main().catch(err => {
    console.error(`\n${colors.red}Fatal Error:${colors.reset}`, err.message);
    rl.close();
});
