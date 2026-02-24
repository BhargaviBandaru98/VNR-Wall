'use strict';
console.log('[DIAGNOSTIC] aiVerificationService.js loaded');

const Groq = require('groq-sdk');

const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
    throw new Error('[aiVerificationService] GROQ_API_KEY is not set in environment variables.');
}

const groq = new Groq({ apiKey });

/**
 * Verify a message using Groq AI with three data sources:
 *   1. Original message text
 *   2. Firecrawl-scraped page content (from message URL)
 *   3. Official domain URLs found via Serper
 *
 * Returns { fake_score, result, confidence, evidence }
 *
 * @param {string} text           - Original message text
 * @param {string} [pageContent]  - Firecrawl scraped content
 * @param {Array}  [officialLinks] - [{title, link}] from Serper
 */
async function verifyMessageWithAI(text, pageContent = '', officialLinks = []) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return { fake_score: 50, result: 'UNKNOWN', confidence: 'LOW', evidence: 'No message text provided.' };
    }

    const hasPageContent = pageContent &&
        !pageContent.startsWith('No link found') &&
        !pageContent.startsWith('Scraped URL');

    const hasOfficialLinks = officialLinks && officialLinks.length > 0;

    // Build official links block
    const officialLinksBlock = hasOfficialLinks
        ? officialLinks.map((r, i) => `  ${i + 1}. ${r.title} — ${r.link}`).join('\n')
        : null;

    // Extract message URL for domain comparison
    const msgUrlMatch = text.match(/https?:\/\/[^\s"'<>()[\],]+/i);
    const msgUrl = msgUrlMatch ? msgUrlMatch[0] : null;
    const msgDomain = msgUrl ? new URL(msgUrl).hostname : null;

    const officialDomains = hasOfficialLinks
        ? officialLinks.map(r => { try { return new URL(r.link).hostname; } catch { return ''; } }).filter(Boolean)
        : [];

    const domainMatchInfo = msgDomain && officialDomains.length > 0
        ? `The message URL domain is "${msgDomain}". Official domains found: ${officialDomains.join(', ')}.`
        : '';

    const prompt = `
You are a scam detection expert for a college student platform identifying fake internship and job offers.

Analyze ALL available evidence below and determine if the message is FAKE or REAL.

${hasPageContent ? `--- LIVE PAGE CONTENT (Firecrawl scraped from message URL) ---
${pageContent.substring(0, 2000)}
--- END PAGE CONTENT ---

` : ''}${hasOfficialLinks ? `--- OFFICIAL COMPANY LINKS (found via web search) ---
${officialLinksBlock}
--- END OFFICIAL LINKS ---

` : ''}--- ORIGINAL MESSAGE ---
${text.substring(0, 1200)}
--- END MESSAGE ---

${domainMatchInfo ? `DOMAIN ANALYSIS: ${domainMatchInfo}
If the message link domain does NOT match any official company domain found above, significantly increase the fake_score.

` : ''}Red flags:
- Upfront payment or registration fees
- Unrealistic salary (Rs.50,000/day from home)
- Urgency tactics ("Limited!", "Expires soon!")
- Personal document requests (Aadhaar, bank details)
- Message link domain differs from official company domain
- Unverifiable MNC tie-up claims (IBM, Microsoft, Wipro)

Return ONLY valid JSON (no markdown):
{
  "fake_score": <0-100>,
  "result": "FAKE" or "REAL",
  "confidence": "HIGH" or "MEDIUM" or "LOW",
  "evidence": "Official: [official domain or N/A] | Found: [message domain or N/A] | Reason: [one sentence summary]"
}
`;

    try {
        const response = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0,
        });

        const raw = response.choices[0].message.content.trim();
        const cleaned = raw.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim();
        console.log('AI RAW OUTPUT:', cleaned);
        const parsed = JSON.parse(cleaned);
        console.log('AI PARSED RESULT:', parsed);

        return {
            fake_score: typeof parsed.fake_score === 'number' ? parsed.fake_score : 50,
            result: typeof parsed.result === 'string' ? parsed.result.toUpperCase() : 'UNKNOWN',
            confidence: typeof parsed.confidence === 'string' ? parsed.confidence.toUpperCase() : 'LOW',
            evidence: typeof parsed.evidence === 'string' ? parsed.evidence : 'No evidence summary provided.',
        };

    } catch (error) {
        console.error('[aiVerificationService] Groq call failed:', error.message);
        return { fake_score: 50, result: 'SUSPICIOUS', confidence: 'LOW', evidence: 'AI analysis failed — manual review required.' };
    }
}

module.exports = { verifyMessageWithAI, groq };
