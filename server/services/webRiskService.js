'use strict';

const axios = require('axios');

const API_KEY = process.env.GOOGLE_WEB_RISK_KEY;
if (!API_KEY) {
    console.warn('[webRiskService] GOOGLE_WEB_RISK_KEY not set — URL safety check will be skipped.');
}

// Threat types to check against
const THREAT_TYPES = ['MALWARE', 'SOCIAL_ENGINEERING', 'UNWANTED_SOFTWARE'];

// Regex to extract first URL from text
const URL_REGEX = /https?:\/\/[^\s"'<>()[\],]+/i;

/**
 * Checks the first URL found in a message text against Google Web Risk API.
 * Returns { isUnsafe, url, threatType } — if no URL or no key, returns { isUnsafe: false }.
 * @param {string} text
 * @returns {Promise<{isUnsafe: boolean, url: string|null, threatType: string|null}>}
 */
async function checkUrlSafety(text) {
    if (!API_KEY) return { isUnsafe: false, url: null, threatType: null };
    if (!text || typeof text !== 'string') return { isUnsafe: false, url: null, threatType: null };

    const match = text.match(URL_REGEX);
    if (!match) return { isUnsafe: false, url: null, threatType: null };

    const url = match[0];
    console.log('[WebRisk] Checking URL:', url);

    try {
        const response = await axios.post(
            `https://webrisk.googleapis.com/v1/uris:search?key=${API_KEY}`,
            {
                uri: url,
                threatTypes: THREAT_TYPES,
            },
            { timeout: 6000 }
        );

        const threats = response.data?.threat;
        if (threats && threats.threatTypes && threats.threatTypes.length > 0) {
            const threatType = threats.threatTypes[0];
            console.log('[WebRisk] ⚠️  URL FLAGGED:', url, '| Threat:', threatType);
            return { isUnsafe: true, url, threatType };
        }

        console.log('[WebRisk] ✅ URL is clean:', url);
        return { isUnsafe: false, url, threatType: null };

    } catch (err) {
        // 400 = invalid URL format, treat as clean (not a threat)
        // Any other error = fail open (don't block)
        console.error('[WebRisk] Check failed for', url, '—', err.response?.status || err.message);
        return { isUnsafe: false, url, threatType: null };
    }
}

module.exports = { checkUrlSafety };
