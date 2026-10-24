#!/usr/bin/env node

/**
 * GOPAY MERCHANT / GOBIZ OFFICIAL LOGIN OTP CLI
 * Clean, Decoded, and Fully Readable Version
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

async function main() {
    console.log('====================================================');
    console.log('   GOPAY MERCHANT / GOBIZ LOGIN OTP (DECODED CLI)   ');
    console.log('====================================================\n');

    const rawPhone = await ask('>> Masukkan Nomor HP GoBiz/GoFood Merchant (contoh: 085119772671): ');
    if (!rawPhone || rawPhone.trim().length < 9) {
        console.log('[-] Nomor HP tidak valid!');
        rl.close();
        return;
    }

    console.log(`[*] Mengirim permintaan OTP ke nomor: ${rawPhone.trim()}...`);
    const otpRes = await requestOtp(rawPhone.trim());

    if (!otpRes.success) {
        console.log(`[-] Gagal mengirim OTP: ${otpRes.message}`);
        rl.close();
        return;
    }

    console.log('[+] Kode OTP (4 digit) berhasil dikirim via SMS/WhatsApp!');
    console.log(`[*] Berlaku selama ${otpRes.expires_in} detik.\n`);

    const otpCode = await ask('>> Masukkan Kode OTP (4 digit): ');
    if (!otpCode || otpCode.trim().length !== 4) {
        console.log('[-] Kode OTP harus terdiri dari 4 digit angka!');
        rl.close();
        return;
    }

    console.log('[*] Memverifikasi kode OTP ke server GoBiz...');
    const verifyRes = await verifyOtp(otpCode.trim(), otpRes.otp_token, otpRes.phone);

    if (!verifyRes.success) {
        console.log(`[-] ${verifyRes.message}`);
        rl.close();
        return;
    }

    const s = verifyRes.session;
    console.log('\n====================================================');
    console.log('   [SUCCESS] LOGIN BERHASIL & SESI TERSIMPAN!       ');
    console.log('====================================================');
    console.log(`Outlet Name  : ${s.outlet_name}`);
    console.log(`Merchant ID  : ${s.merchant_id}`);
    console.log(`Nomor HP     : ${s.phone_number}`);
    console.log(`Token Exp    : ${s.expires_at}`);
    console.log('Sesi disimpan ke .GOPAY_SESI_JANGAN_DIHAPUS.json & siap dipakai!\n');

    rl.close();
}

main().catch(err => {
    console.error('Fatal error:', err);
    rl.close();
});
