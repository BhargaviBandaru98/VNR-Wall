'use strict';
console.log('[DIAGNOSTIC] aiVerificationService.js loaded');

const Groq = require('groq-sdk');
const logger = require('../utils/logger');

const apiKey = process.env.GROQ_API_KEY;
let groq = null;
if (!apiKey) {
    logger.logError('[aiVerificationService] GROQ_API_KEY is not set. AI features are DISABLED.');
} else {
    groq = new Groq({ apiKey });
}

/** Phase 4: Standard fallback returned when Groq is unavailable or response is invalid. */
const AI_FALLBACK = {
    scam_score:        50,
    genuine_score:     0,
    risk_level:        'High',
    result:            'SUSPICIOUS',
    confidence:        'LOW',
    status:            'unknown',
    is_expired:        false,
    evidence:          'AI unavailable — manual verification required.',
    genuine_evidence:  'AI unavailable.',
    protective_guidance: [
        'Do not click any links until manually verified.',
        'Contact university administration for confirmation.',
    ],
};

/**
 * Verify a message using Groq AI with three data sources.
 * Returns exactly the validated JSON response from AI.
 *
 * @param {string} text           - Original message text
 * @param {string} [pageContent]  - Firecrawl scraped content
 * @param {Array}  [officialLinks] - [{title, link}] from Serper
 * @param {string} personalDetails
 * @param {string} dateReceived
 * @param {Array}  learningRules
 * @param {Object} campaignContext
 */
async function verifyMessageWithAI(text, pageContent = '', officialLinks = [], personalDetails = '', dateReceived = '', learningRules = [], campaignContext = null) {
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        throw new Error('NO_MESSAGE_TEXT_PROVIDED');
    }

    if (!groq) {
        logger.logError('[AI] verifyMessageWithAI aborted: GROQ_API_KEY is missing.');
        throw new Error('AI_DISABLED_MISSING_KEY');
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
You are a Lead Fraud Intelligence Analyst. Your mission is to protect university students from predatory recruitment SCAMS by analyzing available data through the 11-step Fraud Intelligence Framework.

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

${personalDetails ? `USER SHARED PERSONAL DETAILS: The user explicitly stated they shared: "${personalDetails}"` : ''}
${dateReceived ? `MESSAGE RECEIVED DATE: The user received this opportunity on ${dateReceived}` : ''}
${domainMatchInfo ? `DOMAIN ANALYSIS: ${domainMatchInfo}` : ''}

--- ADMIN LEARNING RULES ---
${learningRules && learningRules.length > 0 ? 
    learningRules.map((r, i) => `RULE_${i+1}:
Pattern: ${r.pattern}
Decision: ${r.admin_decision}
Reason: ${r.admin_reason}`).join('\n\n') 
    : 'No specific learning rules available for this session.'
}

--- SCAM CAMPAIGN CONTEXT ---
${campaignContext && campaignContext.matchFound ? 
    `ALERT: Possible Scam Campaign Detected!
Reason: ${campaignContext.reason}
Repeated Indicators: ${campaignContext.indicators.join(', ')}`
    : 'No repeated campaign patterns detected across previous submissions.'
}

--- INTELLIGENCE RULES ---
1. TRUST HIERARCHY (CRITICAL): Verified official portals (e.g., careers.google.com, joinwipro.com) found via Serper/Firecrawl are the HIGHEST trust signal. If the message link matches an official domain, reduce scam_score significantly.
2. PSYCHOLOGICAL MANIPULATION: Detect FOMO, extreme urgency (e.g., "Last 1 hour," "Limited spots"), and emotional pressure.
3. IDENTITY & DATA RISK: Flag any request for Government IDs (Aadhaar, PAN), Bank Details, or OTPs. IMPORTANT: IF THE USER EXPLICITLY SHARED SENSITIVE DATA (Bank, SSN, Credentials) IN THE "USER SHARED PERSONAL DETAILS" SECTION, YOU MUST ENFORCE risk_level: "CRITICAL".
4. FINANCIAL RISK: Detect "Registration Fees," "Security Deposits," "Nominal Training Fees," or UPI-only payment requests for employment.
5. ENTITY & BRAND TRUST: Validate brand partnership claims (e.g., "Wipro Hiring") against official Serper data. Flag mismatches.
6. COMMUNICATION ANALYSIS: Flag the use of personal Gmail/Yahoo/Hotmail accounts for official corporate offers.
7. PLATFORM ANOMALY: Flag hiring processes restricted solely to WhatsApp, Telegram, or Google Forms if the company is an MNC.
8. EXPIRY ANALYSIS: Compare the "MESSAGE RECEIVED DATE" with any deadlines, dates, or expired offers found in the content or web searches. If the opportunity is realistically expired or the date is ancient compared to the timeline of the post, return is_expired: true.
9. LEARNING RULE WEIGHTING (CRITICAL): If the message matches an "ADMIN LEARNING RULE" Pattern, you MUST prioritize the Admin's Decision. If the rule says SCAM, increase scam_score to 95+. If it says GENUINE, increase genuine_score to 95+.
10. CAMPAIGN REINFORCEMENT: If "SCAM CAMPAIGN CONTEXT" indicates a match, increase scam_score and mention "Campaign Detected" in the evidence.
11. HIDDEN LINK ANALYSIS: If a URL is provided in the input, analyze: domain legitimacy, redirects, phishing patterns, and mismatch between text and URL.

--- SCORING & OUTPUT ---
- Simultaneously compute BOTH a scam_score AND a genuine_score (0-100).
- If Financial Red Flags or Data Exploitation are detected, risk_level MUST be 'High' or 'Critical' and scam_score >= 90.

You MUST return STRICT JSON only. Do NOT include any conversational text, greetings, code block markers (\`\`\`json), or explanations before or after the JSON.

REQUIRED JSON SCHEMA:
{
  "scam_score": <0-100>,
  "genuine_score": <0-100>,
  "risk_level": "Low" | "Medium" | "High" | "Critical",
  "verdict": "SCAM" | "GENUINE" | "SUSPICIOUS" | "UNKNOWN",
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "is_expired": true | false,
  "evidence_analysis": [
    {
       "text": "Detailed forensic proof.",
       "type": "positive" | "negative" | "warning"
    }
  ],
  "protective_guidance": [
    "Tip 1 (e.g., Do not pay any security deposit)",
    "Tip 2 (e.g., Verify directly at company.com/careers)"
  ],
  "final_verdict": ""
}
`;

    const _aiStart = Date.now();
    let response;
    try {
        response = await groq.chat.completions.create({
            model: 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: prompt }],
            temperature: 0,
            response_format: { type: 'json_object' },
        }, { signal: AbortSignal.timeout(25_000) });
    } catch (timeoutErr) {
        logger.logError(`[AI] Groq request network failed or timed out`, timeoutErr);
        throw new Error('AI_NETWORK_ERROR_OR_TIMEOUT');
    }

    const _aiMs = Date.now() - _aiStart;
    logger.logInfo('[AI] Groq response received', { latencyMs: _aiMs, model: 'llama-3.3-70b-versatile' });

    let raw = response.choices?.[0]?.message?.content?.trim() ?? '';
    console.log('AI RAW OUTPUT:', raw);

    if (!raw) {
        logger.logError('[AI] Groq returned empty response');
        throw new Error('AI_EMPTY_RESPONSE');
    }

    // Extract JSON using regex to ignore any surrounding text
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        logger.logError('[AI] No JSON block found in response', { raw: raw.substring(0, 200) });
        throw new Error('MALFORMED_AI_RESPONSE');
    }

    let parsed;
    try {
        parsed = JSON.parse(jsonMatch[0]);
    } catch (jsonErr) {
        logger.logError('[AI] Groq response is not valid JSON', { extracted_json: jsonMatch[0].substring(0, 200) });
        throw new Error('MALFORMED_AI_RESPONSE');
    }
    console.log('AI PARSED RESULT:', parsed);

    // Strict Schema Check for Required Keys
    const requiredKeys = ['scam_score', 'genuine_score', 'confidence', 'verdict', 'evidence_analysis', 'protective_guidance', 'final_verdict'];
    for (const key of requiredKeys) {
        if (!(key in parsed)) {
            logger.logError(`[AI] Missing required key in response: ${key}`, { parsed });
            throw new Error(`MALFORMED_AI_RESPONSE: Missing key ${key}`);
        }
    }

    // Map `result` to `verdict` if `result` was provided instead of `verdict` for backward compatibility with the prompt evolution, though prompt now demands `verdict`. The prompt is updated to ask for verdict. We expect verdict.
    if(!('verdict' in parsed) && ('result' in parsed)) {
        parsed.verdict = parsed.result; // Fallback mapping just in case the LLM slipped, but we require `verdict` above now.
    }

    // Return the raw validated AI data
    parsed.latencyMs = _aiMs;
    return parsed;
}

/**
 * Phase 5: Pattern Extraction
 * Converts specific admin reason into a generalized behavioral pattern.
 * @param {string} adminReason
 * @returns {Promise<string>}
 */
async function extractPatternFromReason(adminReason) {
    if (!groq) {
        return adminReason || ''; // Gracefully degrade to using raw reason
    }
    if (!adminReason || adminReason.trim().length === 0) return '';

    const prompt = `
You are an AI Forensic Analyst. Your task is to take a specific explanation for a scam/genuine verdict and convert it into a generalized behavioral pattern.

RULES:
1. Remove specific amounts, names, or dates.
2. Focus on the method of request or communication.
3. Keep it brief (max 15 words).
4. Do NOT include any preamble or labels.

EXAMPLE:
Input: "Recruiter asking for ₹5000 as a registration fee through a private WhatsApp link"
Output: "Recruiter requesting registration fee via private messaging link"

Input: "${adminReason}"
Output:`;

    try {
        const response = await groq.chat.completions.create({
            model: 'llama-3.1-8b-instant', // Fast, cheaper model for simple extraction
            messages: [{ role: 'user', content: prompt }],
            temperature: 0,
        });

        return response.choices[0].message.content.trim();
    } catch (error) {
        console.error('[aiVerificationService] Pattern extraction failed:', error.message);
        return adminReason; // Fallback to raw reason if AI fails
    }
}

module.exports = { verifyMessageWithAI, extractPatternFromReason, groq };
