'use strict';
console.log('[DIAGNOSTIC] aiVerificationService.js loaded');

const Groq = require('groq-sdk');

const apiKey = process.env.GROQ_API_KEY;
if (!apiKey) {
    throw new Error('[aiVerificationService] GROQ_API_KEY is not set in environment variables.');
}

const groq = new Groq({ apiKey });

/**
 * Verify a message using Groq AI with three data sources.
 * Returns { fake_score, genuine_score, result, confidence, evidence, genuine_evidence }
 *
 * @param {string} text           - Original message text
 * @param {string} [pageContent]  - Firecrawl scraped content
 * @param {Array}  [officialLinks] - [{title, link}] from Serper
 */
async function verifyMessageWithAI(text, pageContent = '', officialLinks = []) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return {
            fake_score: 50, genuine_score: 50,
            result: 'UNKNOWN', confidence: 'LOW',
            evidence: 'No message text provided.',
            genuine_evidence: 'No message text provided.'
        };
    }

    const hasPageContent = pageContent &&
        !pageContent.startsWith('No link found') &&
        !pageContent.startsWith('Scraped URL');

    const hasOfficialLinks = officialLinks && officialLinks.length > 0;

    const officialLinksBlock = hasOfficialLinks
        ? officialLinks.map((r, i) => `  ${i + 1}. ${r.title} — ${r.link}`).join('\n')
        : null;

    const msgUrlMatch = text.match(/https?:\/\/[^\s"'<>()\[\],]+/i);
    const msgUrl = msgUrlMatch ? msgUrlMatch[0] : null;
    const msgDomain = msgUrl ? (() => { try { return new URL(msgUrl).hostname; } catch { return null; } })() : null;

    const officialDomains = hasOfficialLinks
        ? officialLinks.map(r => { try { return new URL(r.link).hostname; } catch { return ''; } }).filter(Boolean)
        : [];

    const domainMatchInfo = msgDomain && officialDomains.length > 0
        ? `The message URL domain is "${msgDomain}". Official domains found: ${officialDomains.join(', ')}.`
        : '';

    const prompt = `
You are a scam detection expert for a college student platform identifying fake internship and job offers.

Analyze ALL available evidence below and determine if the message is FAKE or REAL.
You must simultaneously compute BOTH a fake_score AND a genuine_score (they do NOT have to add up to 100).

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

` : ''}FAKE RED FLAGS (increase fake_score):
- Upfront payment or registration fees
- Unrealistic salary (e.g., Rs.50,000/day from home)
- Extreme urgency tactics ("Limited!", "Expires in 1 hour!")
- Requests for personal documents (Aadhaar, bank details)
- Message link domain differs from official company domain
- Unverifiable MNC tie-up claims (IBM, Microsoft, Wipro with no URL proof)
- Anonymous sender with no official domain email
- Google Form / payment link used instead of official career portal

GENUINE INDICATORS (increase genuine_score):
- Sender email belongs to verified official company domain (e.g., @wipro.com, @infosys.com)
- Registration link uses official career portal (e.g., careers.wipro.com, unstop.com)
- No mention of any fees or payments
- Clearly identifies company name, HR contact, and official process
- Consistent with standard hiring practices
- Official company website/domain matches message link

Return ONLY valid JSON (no markdown, no extra text):
{
  "fake_score": <0-100>,
  "genuine_score": <0-100>,
  "result": "FAKE" or "REAL",
  "confidence": "HIGH" or "MEDIUM" or "LOW",
  "evidence": "Official: [official domain or N/A] | Found: [message domain or N/A] | Reason: [one sentence — why it is fake]",
  "genuine_evidence": "Reason: [one sentence — what genuine indicators exist, or 'No genuine indicators found']"
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
            genuine_score: typeof parsed.genuine_score === 'number' ? parsed.genuine_score : 0,
            result: typeof parsed.result === 'string' ? parsed.result.toUpperCase() : 'UNKNOWN',
            confidence: typeof parsed.confidence === 'string' ? parsed.confidence.toUpperCase() : 'LOW',
            evidence: typeof parsed.evidence === 'string' ? parsed.evidence : 'No evidence summary provided.',
            genuine_evidence: typeof parsed.genuine_evidence === 'string' ? parsed.genuine_evidence : 'No genuine indicators found.',
        };

    } catch (error) {
        console.error('[aiVerificationService] Groq call failed:', error.message);
        return {
            fake_score: 50, genuine_score: 0,
            result: 'SUSPICIOUS', confidence: 'LOW',
            evidence: 'AI analysis failed — manual review required.',
            genuine_evidence: 'AI analysis failed.'
        };
    }
}

module.exports = { verifyMessageWithAI, groq };
