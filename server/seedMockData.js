const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.db');
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('Error connecting to database', err);
        process.exit(1);
    }
});

const mockData = [
    {
        user_email: 'audit@vnr.edu',
        name: 'Mock Student',
        branch: 'CSE',
        year: '3rd Year',
        dateReceived: '20-01-2024',
        platform: 'WhatsApp',
        sender: 'Unknown Recruiter',
        message: 'Amazon Part-time Job! Work from home and earn 5000 Rs daily. Click here: amzn-job-offer.xyz',
        status: 'scam',
        ai_score: 95,
        ai_result: 'Fake',
        genuineRating: 5,
        ai_evidence: 'URL is a known scam domain. The salary offered is unrealistic for part-time data entry.',
        risk_level: 'HIGH',
        is_expired: 1, // Expired
        personalDetails: 'No'
    },
    {
        user_email: 'audit@vnr.edu',
        name: 'Mock Student',
        branch: 'ECE',
        year: '2nd Year',
        dateReceived: '27-02-2024',
        platform: 'Email',
        sender: 'Google Careers',
        message: 'Google is hiring for the role of Student Researcher Intern! Stipend: ₹1,00,000 per month. Application Link: https://unstop.com/internships/student-researcher-internship-google-1625848',
        status: 'genuine',
        ai_score: 5,
        ai_result: 'Real',
        genuineRating: 95,
        ai_evidence: 'GENUINE: Unstop.com is a verified platform for hackathons and academic internships. The role exists.',
        risk_level: 'LOW',
        is_expired: 0,
        personalDetails: 'No'
    },
    {
        user_email: 'audit@vnr.edu',
        name: 'Mock Student',
        branch: 'IT',
        year: '4th Year',
        dateReceived: '26-02-2024',
        platform: 'Telegram',
        sender: 'TCS HR',
        message: 'Dear Student, you have been selected for TCS Bonus round. Pay ₹2000 registration fee to proceed.',
        status: 'inreview', // IN-REVIEW status
        ai_score: 50,
        ai_result: 'Uncertain',
        genuineRating: 50,
        ai_evidence: 'Requires manual human review. Financial demand detected without official TCS portal linkage.',
        risk_level: 'MEDIUM',
        is_expired: 0,
        personalDetails: 'Mention',
        response_details: 'Mentioned my TCS Reference Number'
    },
    {
        user_email: 'audit@vnr.edu',
        name: 'Mock Student',
        branch: 'CSE',
        year: '1st Year',
        dateReceived: '27-02-2024',
        platform: 'SMS',
        sender: 'Bank Alerts',
        message: 'Your HDFC account will be blocked today. Please share the OTP sent to your phone to verify KYC.',
        status: 'scam',
        ai_score: 99,
        ai_result: 'Fake',
        genuineRating: 1,
        ai_evidence: 'Classic banking phishing attempt. Banks never ask for OTP directly.',
        risk_level: 'CRITICAL',
        is_expired: 0,
        personalDetails: 'Yes',
        response_details: 'Shared OTP and Account Number'
    },
    {
        user_email: 'audit@vnr.edu',
        name: 'Mock Student',
        branch: 'MECH',
        year: '3rd Year',
        dateReceived: '15-02-2024',
        platform: 'Instagram',
        sender: 'Crypto Trader',
        message: 'Double your Bitcoin in 24 hours! Send funds to this wallet address to join the scheme.',
        status: 'scam',
        ai_score: 100,
        ai_result: 'Fake',
        genuineRating: 0,
        ai_evidence: 'Guaranteed crypto return scams are universally fraudulent.',
        risk_level: 'HIGH',
        is_expired: 0,
        personalDetails: 'No'
    }
];

const insertMockData = () => {
    db.serialize(() => {
        const stmt = db.prepare(`
            INSERT INTO datacheck (
                user_email, name, branch, year, dateReceived, platform, sender, message, status, 
                ai_score, ai_result, genuineRating, ai_evidence, risk_level, is_expired, personalDetails, response_details, ai_checked
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
        `);

        mockData.forEach(d => {
            stmt.run(
                d.user_email, d.name, d.branch, d.year, d.dateReceived, d.platform, d.sender, d.message, d.status,
                d.ai_score, d.ai_result, d.genuineRating, d.ai_evidence, d.risk_level, d.is_expired, d.personalDetails, d.response_details || null,
                (err) => {
                    if (err) console.error("Error inserting", err);
                }
            );
        });

        stmt.finalize(() => {
            console.log("Mock data inserted successfully.");
            db.close();
        });
    });
};

insertMockData();
