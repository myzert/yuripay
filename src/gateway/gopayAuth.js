const axios = require('axios');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const SESSION_FILE = path.join(__dirname, '.GOPAY_SESI_JANGAN_DIHAPUS.json');

const GOBIZ_REQUEST_OTP_URL = 'https://api.gobiz.co.id/goid/login/request';
const GOBIZ_TOKEN_URL = 'https://api.gobiz.co.id/goid/token';
const GOBIZ_CONFIG_URL = 'https://api.gobiz.co.id/goresto/v5/public/users/config';

const DEFAULT_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

/**
 * Generate standard GoBiz request headers
 */
function getGoBizHeaders(userAgent = DEFAULT_USER_AGENT, accessToken = null) {
    const headers = {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'id',
        'authentication-type': 'go-id',
        'content-type': 'application/json',
        'gojek-country-code': 'ID',
        'gojek-timezone': 'Asia/Jakarta',
        'origin': 'https://portal.gofoodmerchant.co.id',
        'referer': 'https://portal.gofoodmerchant.co.id/',
        'user-agent': userAgent,
        'x-appid': 'go-biz-web-dashboard',
        'x-appversion': 'platform-v3.111.0-1708bc9a',
        'x-deviceos': 'Web',
        'x-phonemake': 'Windows 10 64-bit',
        'x-phonemodel': 'Chrome 150.0.0.0 on Windows 10 64-bit',
        'x-platform': 'Web',
        'x-uniqueid': crypto.randomUUID(),
        'x-user-locale': 'en-GB',
        'x-user-type': 'merchant'
    };

    if (accessToken) {
        headers['Authorization'] = `Bearer ${accessToken}`;
        headers['Cookie'] = `access_token=${accessToken}; auth_method=goid`;
    }

    return headers;
}

/**
 * Request OTP via SMS/WA from GoBiz
 * @param {string} phoneNumber - Example: '085119772671' or '+6285119772671'
 */
async function requestOtp(phoneNumber) {
    let cleanPhone = phoneNumber.replace(/[^0-9]/g, '');
    if (cleanPhone.startsWith('62')) {
        cleanPhone = cleanPhone.substring(2);
    } else if (cleanPhone.startsWith('0')) {
        cleanPhone = cleanPhone.substring(1);
    }

    const payload = {
        client_id: 'go-biz-web-new',
        phone_number: cleanPhone,
        country_code: '62'
    };

    try {
        const response = await axios.post(GOBIZ_REQUEST_OTP_URL, payload, {
            headers: getGoBizHeaders(),
            timeout: 10000
        });

        if (response.data && response.data.data && response.data.data.otp_token) {
            return {
                success: true,
                otp_token: response.data.data.otp_token,
                expires_in: response.data.data.expires_in || 720,
                phone: `+62${cleanPhone}`
            };
        }

        return {
            success: false,
            message: response.data?.errors?.[0]?.message || 'Gagal mengirim OTP'
        };
    } catch (err) {
        const errMsg = err.response?.data?.errors?.[0]?.message || err.response?.data?.message || err.message;
        return {
            success: false,
            message: errMsg
        };
    }
}

/**
 * Verify OTP code and save session
 * @param {string} otpCode - 4 digit OTP code
 * @param {string} otpToken - Token received from requestOtp
 * @param {string} formattedPhone - E.g. '+6285119772671'
 */
async function verifyOtp(otpCode, otpToken, formattedPhone = '') {
    const payload = {
        client_id: 'go-biz-web-new',
        grant_type: 'otp',
        data: {
            otp: String(otpCode).trim(),
            otp_token: otpToken.trim()
        }
    };

    try {
        const response = await axios.post(GOBIZ_TOKEN_URL, payload, {
            headers: getGoBizHeaders(),
            timeout: 10000
        });

        const tokenData = response.data?.data || response.data;
        if (!tokenData || !tokenData.access_token) {
            return {
                success: false,
                message: 'Verifikasi gagal: access_token tidak ditemukan dalam respon GoBiz.'
            };
        }

        const accessToken = tokenData.access_token;
        const refreshToken = tokenData.refresh_token;
        const expiresInSeconds = tokenData.expires_in || 86400;
        const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();

        // Fetch merchant and outlet info
        let merchantId = process.env.GOPAY_MERCHANT_ID || 'G538138242';
        let outletName = 'ZERO SHOP, MEGALUH';

        try {
            const configRes = await axios.get(GOBIZ_CONFIG_URL, {
                headers: getGoBizHeaders(DEFAULT_USER_AGENT, accessToken),
                timeout: 8000
            });

            const configData = configRes.data?.data || configRes.data;
            if (configData && configData.merchants && configData.merchants.length > 0) {
                const firstMerchant = configData.merchants[0];
                merchantId = firstMerchant.id || merchantId;
                outletName = firstMerchant.name || firstMerchant.restaurant_name || outletName;
            } else if (configData && configData.user) {
                outletName = configData.user.name || outletName;
            }
        } catch (confErr) {
            console.warn('[GoPayAuth] Could not fetch user config, using fallback:', confErr.message);
        }

        const sessionData = {
            phone_number: formattedPhone,
            merchant_id: merchantId,
            outlet_name: outletName,
            access_token: accessToken,
            refresh_token: refreshToken,
            cookie: `access_token=${accessToken}; refresh_token=${refreshToken}; auth_method=goid`,
            updated_at: new Date().toISOString(),
            expires_at: expiresAt
        };

        // Save to file
        saveSession(sessionData);

        return {
            success: true,
            message: 'Login OTP GoBiz berhasil!',
            session: sessionData
        };
    } catch (err) {
        const errMsg = err.response?.data?.errors?.[0]?.message || err.response?.data?.message || err.message;
        return {
            success: false,
            message: `Verifikasi OTP Gagal: ${errMsg}`
        };
    }
}

/**
 * Save session to file
 */
function saveSession(data) {
    try {
        fs.writeFileSync(SESSION_FILE, JSON.stringify(data, null, 2), 'utf8');
        // Also copy to gateway-service if exists
        const altPath = path.join(__dirname, '../../gateway-service/.GOPAY_SESI_JANGAN_DIHAPUS.json');
        if (fs.existsSync(path.dirname(altPath))) {
            fs.writeFileSync(altPath, JSON.stringify(data, null, 2), 'utf8');
        }
        return true;
    } catch (e) {
        console.error('[GoPayAuth] Save session error:', e.message);
        return false;
    }
}

/**
 * Load session from file
 */
function loadSession() {
    try {
        if (fs.existsSync(SESSION_FILE)) {
            return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf8'));
        }
        const altPath = path.join(__dirname, '../../gateway-service/.GOPAY_SESI_JANGAN_DIHAPUS.json');
        if (fs.existsSync(altPath)) {
            return JSON.parse(fs.readFileSync(altPath, 'utf8'));
        }
    } catch (e) {}
    return null;
}

module.exports = {
    requestOtp,
    verifyOtp,
    saveSession,
    loadSession,
    getGoBizHeaders,
    SESSION_FILE
};
