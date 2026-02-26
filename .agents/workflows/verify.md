---
description: Standardized Real-Time Verification Protocol (Phase 6c)
---

# Real-Time Verification Protocol

Whenever a message is provided followed by the keyword "verify", follow these steps:

### 1. Investigation Pipeline
// turbo-all
1. **Safety Check**: Check message URLs using `webRiskService.js` (Google Web Risk API).
2. **Web Research**: Use `searchService.js` (Serper API) to find official company websites, social profiles, and recruitment policies.
3. **Deep Scrape**: Use `firecrawlService.js` (Firecrawl API) to analyze the destination page (e.g., registration forms, payment links).
4. **AI Reasoning**: Use `aiVerificationService.js` (Groq AI) to calculate the `fake_score` and `genuine_score` based on research evidence.

### 2. Mandatory Reporting Format

🚨 AI Verification Result: **[STATUS]**
Scores: Fake: [SCORE]% | Genuine: [SCORE]%
Confidence: [HIGH/MEDIUM/LOW]
Risk Level: [LOW/MEDIUM/HIGH/CRITICAL]
[⚡ CACHED RESULT] (Only if applicable)

🔍 Investigative Evidence:
Official Source: [DOMAIN/NA]
Link Analysis: [TECHNICAL PROOF]
Reason: [CLINICAL REASONING]

🛡️ Protective Guidance:
1. [Safety Tip 1]
2. [Safety Tip 2]
3. [Safety Tip 3]
4. [Safety Tip 4]

Path: [PIPELINE_PATH]
📧 Escalation Status: [Admin Email Sent / Auto-Marked]
