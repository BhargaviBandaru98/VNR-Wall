'use strict';

const axios = require('axios');

const SERPER_API_KEY = process.env.SERPER_API_KEY;
if (!SERPER_API_KEY) {
    console.warn('[searchService] SERPER_API_KEY not set — official site search will be skipped.');
}

/**
 * Searches for official company career/internship pages using Serper API.
 * @param {string} companyName
 * @returns {Promise<Array<{title: string, link: string}>>} top 2 results or []
 */
async function searchOfficialSite(companyName) {
    if (!SERPER_API_KEY || !companyName || companyName.trim().length < 2) {
        return [];
    }

    const query = `Official ${companyName.trim()} careers internship portal`;
    console.log('[Serper] Searching for:', query);

    try {
        const response = await axios.post(
            'https://google.serper.dev/search',
            { q: query, num: 5 },
            {
                headers: {
                    'X-API-KEY': SERPER_API_KEY,
                    'Content-Type': 'application/json',
                },
                timeout: 8000,
            }
        );

        const organic = response.data?.organic || [];
        const top2 = organic.slice(0, 2).map(r => ({ title: r.title, link: r.link }));
        console.log('[Serper] Top results:', JSON.stringify(top2));
        return top2;

    } catch (err) {
        console.error('[Serper] Search failed:', err.message);
        return [];
    }
}

/**
 * Uses Groq to extract a company name from a message text.
 * Returns the company name string or null.
 * @param {string} text
 * @param {import('groq-sdk')} groq
 * @returns {Promise<string|null>}
 */
async function extractCompanyName(text, groq) {
    if (!text) return null;
    try {
        const response = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{
                role: 'user',
                content: `Extract the company or organization name from this message. Return ONLY the company name as plain text (no quotes, no punctuation, no explanation). If no company is mentioned, return: UNKNOWN\n\nMessage:\n${text.substring(0, 800)}`
            }],
            temperature: 0,
            max_tokens: 30,
        });
        const name = response.choices[0].message.content.trim();
        console.log('[Serper] Extracted company name:', name);
        return name === 'UNKNOWN' ? null : name;
    } catch (err) {
        console.error('[Serper] Company name extraction failed:', err.message);
        return null;
    }
}

module.exports = { searchOfficialSite, extractCompanyName };
