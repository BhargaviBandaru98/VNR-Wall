require('dotenv').config();
const { verifyMessageWithAI } = require('./services/aiVerificationService');

async function testIntelligenceLoop() {
  console.log('--- intelligence Loop Verification (Phases 7-9) ---');

  const text = "URGENT: MNC Recruitment drive. Pay ₹2000 for training via UPI: scammer@upi. Click here: http://bit.ly/scam-link";
  
  // Simulated Learning Rules (Phase 7)
  const learningRules = [
    {
      pattern: "MNC recruiting via UPI payment",
      admin_decision: "SCAM",
      admin_reason: "Verified as part of a recurring phishing campaign targeting students."
    }
  ];

  // Simulated Campaign Context (Phase 9)
  const campaignContext = {
    matchFound: true,
    reason: "Indicator matched previous SCAM submissions.",
    indicators: ["scammer@upi", "http://bit.ly/scam-link"]
  };

  console.log('\nTesting with Rule Injection & Campaign Context...');
  try {
    const result = await verifyMessageWithAI(
      text, 
      '', // No page content
      [], // No official links
      'Shared Bank Details', // Combined details
      '2026-03-15', // Date received
      learningRules,
      campaignContext
    );

    console.log('AI Result Summary:');
    console.log(`- Scam Score: ${result.scam_score}`);
    console.log(`- Result: ${result.result}`);
    console.log(`- Confidence: ${result.confidence}`);
    console.log(`- Evidence Highlights: ${result.evidence.substring(0, 150)}...`);
    
    // Check if reinforcement worked
    if (result.scam_score >= 90) {
      console.log('✅ Phase 7/8 Reinforcement: SUCCESS (High Scam Score)');
    } else {
      console.warn('⚠️ Phase 7/8 Reinforcement: Weak response scores.');
    }

    if (result.evidence.toLowerCase().includes('campaign') || result.evidence.toLowerCase().includes('matched')) {
       console.log('✅ Phase 9 Campaign Detection: SUCCESS (Mentioned in evidence)');
    } else {
       console.warn('⚠️ Phase 9 Campaign Detection: Not explicitly mentioned in AI evidence.');
    }

  } catch (e) {
    console.error('Test Failed:', e.message);
  }
}

testIntelligenceLoop();
