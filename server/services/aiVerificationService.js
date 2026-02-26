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
You are a Lead Fraud Intelligence Analyst. Your mission is to protect university students from predatory recruitment scams by analyzing available data through the 11-step Fraud Intelligence Framework.

--- INVESTIGATIVE DATA ---
${hasPageContent ? `LIVE PAGE CONTENT (Firecrawl):
${pageContent.substring(0, 2000)}
---` : ''}
${hasOfficialLinks ? `OFFICIAL COMPANY DATA (Serper):
${officialLinksBlock}
---` : ''}
ORIGINAL MESSAGE:
${text.substring(0, 1200)}
---

${domainMatchInfo ? `DOMAIN ANALYSIS: ${domainMatchInfo}` : ''}

--- INTELLIGENCE RULES ---
1. TRUST HIERARCHY (CRITICAL): Verified official portals (e.g., careers.google.com, joinwipro.com) found via Serper/Firecrawl are the HIGHEST trust signal. If the message link matches an official domain, reduce fake_score significantly.
2. PSYCHOLOGICAL MANIPULATION: Detect FOMO, extreme urgency (e.g., "Last 1 hour," "Limited spots"), and emotional pressure.
3. IDENTITY & DATA RISK: Flag any request for Government IDs (Aadhaar, PAN), Bank Details, or OTPs without a known corporate portal context.
4. FINANCIAL RISK: Detect "Registration Fees," "Security Deposits," "Nominal Training Fees," or UPI-only payment requests for employment.
5. ENTITY & BRAND TRUST: Validate brand partnership claims (e.g., "Wipro Hiring") against official Serper data. Flag mismatches.
6. COMMUNICATION ANALYSIS: Flag the use of personal Gmail/Yahoo/Hotmail accounts for official corporate offers.
7. PLATFORM ANOMALY: Flag hiring processes restricted solely to WhatsApp, Telegram, or Google Forms if the company is an MNC.

--- SCORING & OUTPUT ---
- Simultaneously compute BOTH a fake_score AND a genuine_score (0-100).
- If Financial Red Flags or Data Exploitation are detected, risk_level MUST be 'High' or 'Critical' and fake_score >= 90.

Return ONLY valid JSON:
{
  "fake_score": <0-100>,
  "genuine_score": <0-100>,
  "risk_level": "Low" | "Medium" | "High" | "Critical",
  "result": "FAKE" | "REAL",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "ai_evidence": "Detailed technical and forensic proof of risk indicators.",
  "genuine_evidence": "Forensic proof of authenticity (e.g., domain match, verified portal).",
  "protective_guidance": [
    "Tip 1 (e.g., Do not pay any security deposit)",
    "Tip 2 (e.g., Verify directly at company.com/careers)",
    "Tip 3",
    "Tip 4"
  ]
}
`;

    try {
        const response = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0,
            response_format: { type: 'json_object' }
        });

        const raw = response.choices[0].message.content.trim();
        console.log('AI RAW OUTPUT:', raw);
        const parsed = JSON.parse(raw);
        console.log('AI PARSED RESULT:', parsed);

        // Map risk_level to results for internal logic compatibility
        const isHighRisk = parsed.risk_level === 'High' || parsed.risk_level === 'Critical' || parsed.fake_score >= 80;
        const mappedResult = isHighRisk ? 'FAKE' : (parsed.result || 'REAL');

        return {
            fake_score: typeof parsed.fake_score === 'number' ? parsed.fake_score : 50,
            genuine_score: typeof parsed.genuine_score === 'number' ? parsed.genuine_score : 0,
            risk_level: typeof parsed.risk_level === 'string' ? parsed.risk_level : 'Medium',
            result: mappedResult.toUpperCase(),
            confidence: typeof parsed.confidence === 'string' ? parsed.confidence.toUpperCase() : 'LOW',
            evidence: typeof parsed.ai_evidence === 'string' ? parsed.ai_evidence : 'No technical evidence provided.',
            genuine_evidence: typeof parsed.genuine_evidence === 'string' ? parsed.genuine_evidence : 'No genuine indicators found.',
            protective_guidance: Array.isArray(parsed.protective_guidance) ? parsed.protective_guidance : []
        };

    } catch (error) {
        console.error('[aiVerificationService] Groq call failed:', error.message);
        return {
            fake_score: 50, genuine_score: 0,
            risk_level: 'High',
            result: 'SUSPICIOUS', confidence: 'LOW',
            evidence: 'AI analysis system failure — manual verification required.',
            genuine_evidence: 'AI analysis system failure.',
            protective_guidance: ['Contact university administration', 'Do not click any links']
        };
    }
}

module.exports = { verifyMessageWithAI, groq };
