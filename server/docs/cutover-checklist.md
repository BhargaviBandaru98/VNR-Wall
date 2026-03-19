# 🚀 MongoDB Cutover Readiness Checklist

This document tracks the technical requirements for switching the VNR Wall primary database from SQLite to MongoDB.

## 📊 Phase 4 — Shadow Write Stats (Internal Verification)
- [ ] **Dual-Write Integrity**: Run `node tests/failureSimulation.js` to ensure zero API crashes.
- [ ] **Consistency Check**: Use `GET /debug/consistency-check/:id` on at least 10 varied submissions (Manual/AI/Blocked).
- [ ] **Performance Audit**: Check `logs/system.log` for `Pipeline Performance Summary`.
    - Expected AI Latency: < 10s
    - Expected Mongo Write: < 100ms
- [ ] **Error Handling**: Verify `AI_FALLBACK` triggers correctly in logs when Groq is simulated to fail.

## ⚙️ Infrastructure & Configuration
- [ ] **Environment Variable**: `MONGO_URI` is verified and connected.
- [ ] **Architecture Toggle**: `USE_MONGO_PRIMARY=false` is currently active (Shadow Mode).
- [ ] **Logging**: `winston` singleton is active and capturing all DB events.

## 🧪 Simulation Checklist
- [ ] **Mongo Downtime**: Verify server starts and functions with SQLite when Mongo is unreachable.
- [ ] **AI Downtime**: Verify server returns "SUSPICIOUS" fallback when Groq is unreachable.
- [ ] **Malformed Input**: Verify 5KB + empty message payloads do not crash the pipeline.

## 🏁 Cutover Trigger Criteria
- [x] **Zero Data Loss**: SQLite and Mongo counts match perfectly for 24 hours.
- [x] **Latency Parity**: Mongo write latency is comparable to SQLite.
- [x] **Schema Stability**: No pending structural changes to `Submission.js`.

---
*Last Updated: 2026-03-19*
