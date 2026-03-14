'use strict';

const FirecrawlModule = require('@mendable/firecrawl-js');
const FirecrawlApp = FirecrawlModule.default || FirecrawlModule;

const apiKey = process.env.FIRECRAWL_API_KEY;
if (!apiKey) {
    console.warn('[firecrawlService] FIRECRAWL_API_KEY not set — URL scraping will be skipped.');
}

const firecrawl = apiKey ? new FirecrawlApp({ apiKey }) : null;

// Regex to extract the first URL from a text block
const URL_REGEX = /https?:\/\/[^\s"'<>()[\],]+/i;

/**
 * Extracts the first URL from text and scrapes it using Firecrawl.
 * Returns trimmed markdown content, or a descriptive fallback string.
 * @param {string} text
 * @returns {Promise<string>}
 */
async function scrapeUrl(text) {
    if (!firecrawl) return 'No link found (Firecrawl not configured)';
    if (!text || typeof text !== 'string') return 'No link found';

    const match = text.match(URL_REGEX);
    if (!match) return 'No link found in message';

    const url = match[0];
    console.log('[Firecrawl] Scraping URL:', url);

    try {
        const result = await firecrawl.scrape(url, {
            formats: ['markdown'],
        });

        if (result && result.markdown) {
            const content = result.markdown.substring(0, 3000).trim();
            console.log('[Firecrawl] Scraped', content.length, 'chars from', url);
            return content;
        }

        console.log('[Firecrawl] No markdown returned for', url);
        return `Scraped URL: ${url} — no readable content found`;

    } catch (err) {
        console.error('[Firecrawl] Scrape failed for', url, '—', err.message);
        return `Scraped URL: ${url} — scrape failed (${err.message.substring(0, 80)})`;
    }
}

module.exports = { scrapeUrl };
