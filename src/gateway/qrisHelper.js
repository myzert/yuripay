const QRCode = require('qrcode');

/**
 * Calculate CRC16 CCITT (0xFFFF polynomial 0x1021) for EMVCo QRIS specification
 */
function calculateCRC16(payload) {
    let crc = 0xFFFF;
    for (let i = 0; i < payload.length; i++) {
        crc ^= payload.charCodeAt(i) << 8;
        for (let j = 0; j < 8; j++) {
            if ((crc & 0x8000) !== 0) {
                crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
            } else {
                crc = (crc << 1) & 0xFFFF;
            }
        }
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Generate Dynamic QRIS from Static QRIS Template according to EMVCo standard
 * @param {string} staticTemplate - The raw QRIS text from GoPay/GoBiz merchant
 * @param {number|string} amount - Transaction amount in Rupiah
 * @returns {string|null} - Formatted Dynamic QRIS string
 */
function generateDynamicQRIS(staticTemplate, amount) {
    if (!staticTemplate) return null;
    let payload = staticTemplate.trim();

    // Remove existing Tag 63 CRC if present
    const idx63 = payload.indexOf('6304');
    if (idx63 !== -1) {
        payload = payload.substring(0, idx63);
    }

    // Parse EMVCo TLV Tags
    const tags = [];
    let i = 0;
    try {
        while (i < payload.length) {
            const tag = payload.substring(i, i + 2);
            const length = parseInt(payload.substring(i + 2, i + 4), 10);
            if (isNaN(length)) break;
            const val = payload.substring(i + 4, i + 4 + length);
            tags.push({ tag, val });
            i += 4 + length;
        }
    } catch (e) {
        return null;
    }

    const amountStr = parseInt(amount, 10).toString();
    const newTags = [];
    let hasTag54 = false;

    for (const item of tags) {
        if (item.tag === '01') {
            // Change Static (11) to Dynamic (12)
            newTags.push({ tag: '01', val: '12' });
        } else if (item.tag === '54') {
            newTags.push({ tag: '54', val: amountStr });
            hasTag54 = true;
        } else if (item.tag === '58' && !hasTag54) {
            // Insert Tag 54 before Tag 58 if not present
            newTags.push({ tag: '54', val: amountStr });
            hasTag54 = true;
            newTags.push(item);
        } else {
            newTags.push(item);
        }
    }

    if (!hasTag54) {
        newTags.push({ tag: '54', val: amountStr });
    }

    let result = '';
    for (const item of newTags) {
        const lenStr = item.val.length.toString().padStart(2, '0');
        result += `${item.tag}${lenStr}${item.val}`;
    }

    result += '6304';
    const checksum = calculateCRC16(result);
    return result + checksum;
}

/**
 * Generate a PNG Buffer from a QR code string
 * @param {string} text - QR Code string
 * @returns {Promise<Buffer>}
 */
async function generateQRBuffer(text) {
    return QRCode.toBuffer(text, {
        errorCorrectionLevel: 'M',
        type: 'png',
        margin: 2,
        scale: 8,
        color: {
            dark: '#000000',
            light: '#FFFFFF'
        }
    });
}

/**
 * Generate unique random offset added to base nominal.
 * Rule:
 * 1. Nominal kecil (50+ s/d < 1000): offset cuma 1 perak (prioritas 1, max 5 jika tabrakan).
 * 2. Nominal 1.000 ke atas: offset acak 1 s/d 199 (tidak boleh lebih dari 200).
 * @param {number} baseAmount
 * @param {number[]} existingPendingAmounts
 */
function generateUniqueAmount(baseAmount, existingPendingAmounts = []) {
    let attempts = 0;
    let uniqueCode = 1;
    let total = baseAmount;

    if (baseAmount < 1000) {
        // Offset untuk 50+ s/d < 1000 strictly 1 perak (jika ada pending kembar, increment +2, +3, dst max 5)
        uniqueCode = 1;
        while (existingPendingAmounts.includes(baseAmount + uniqueCode) && uniqueCode < 5) {
            uniqueCode++;
        }
        total = baseAmount + uniqueCode;
    } else {
        // Nominal 1.000 ke atas: offset acak 1 s/d 199 (tidak boleh lebih dari 200)
        const minOffset = 1;
        const maxOffset = 199;
        do {
            uniqueCode = Math.floor(Math.random() * (maxOffset - minOffset + 1)) + minOffset;
            total = baseAmount + uniqueCode;
            attempts++;
        } while (existingPendingAmounts.includes(total) && attempts < 50);
    }

    return {
        uniqueCode,
        totalAmount: total
    };
}

module.exports = {
    calculateCRC16,
    generateDynamicQRIS,
    generateQRBuffer,
    generateUniqueAmount
};
