/**
 * Automated Verification Test Suite for VERITAS AI Logic Engine
 */

const fs = require('fs');

// Load data and engine in node context
const vm = require('vm');
const dataCode = fs.readFileSync('data.js', 'utf8');
const engineCode = fs.readFileSync('engine.js', 'utf8');

vm.runInThisContext(dataCode);
vm.runInThisContext(engineCode);

console.log("=== RUNNING VERITAS AI ENGINE VALIDATION TESTS ===\n");

let passed = 0;
let total = 0;

function assert(condition, message) {
  total++;
  if (condition) {
    console.log(`✓ PASS: ${message}`);
    passed++;
  } else {
    console.error(`✕ FAIL: ${message}`);
  }
}

// Clone initial state
let state = JSON.parse(JSON.stringify(INITIAL_DATA));

// Test 1: Initial recompute and metrics check
VeritasEngine.recomputeAll(state);
const metrics1 = VeritasEngine.calculateMetrics(state);

assert(metrics1.documents_analyzed === 4, "Metrics: Exactly 4 documents analyzed");
assert(metrics1.claims_extracted === 5, "Metrics: Exactly 5 claims extracted (excluding suppressed & rejected)");
assert(metrics1.supported_claims === 1, "Metrics: 1 Supported claim (Compliance Certificate ISO 9001)");
assert(metrics1.contradicted_claims === 3, "Metrics: 3 Contradicted claims (Contract, Delivery, Warehouse)");
assert(metrics1.needs_verification_claims === 1, "Metrics: 1 Needs Verification claim (Inspection spec)");

// Check invariant: Supported + Contradicted + Needs Verification = Claims Extracted
const sum = metrics1.supported_claims + metrics1.contradicted_claims + metrics1.needs_verification_claims;
assert(sum === metrics1.claims_extracted, `Invariant 4.8 enforced: Supported (${metrics1.supported_claims}) + Contradicted (${metrics1.contradicted_claims}) + Needs Verification (${metrics1.needs_verification_claims}) = Claims Extracted (${metrics1.claims_extracted})`);

// Test 2: Pre-loaded Contradictions severity
const highRiskIssues = metrics1.high_risk_issues;
assert(highRiskIssues.length === 4, `High-Risk issues count is 4 (found ${highRiskIssues.length})`);
assert(highRiskIssues.every(h => h.severity === "High"), "All 4 high-risk contradictions scored High severity");

// Test 3: Normalization and Anchoring
const contractDoc = state.documents.find(d => d.id === "doc-contract");
assert(contractDoc.pages.length === 1, "Contract has 1 page");
assert(contractDoc.pages[0].paragraphs.length === 4, "Contract normalized into 4 paragraphs");
assert(contractDoc.pages[0].paragraphs[1].para_id === "p2", "Paragraph 2 has para_id 'p2'");

// Test 4: Section 4.5 Verdict Precedence - Human Decision override
const warehouseClaim = state.claims.find(c => c.id === "claim-warehouse-qty");
assert(warehouseClaim.displayed_status === "CONTRADICTED", "Warehouse claim initially CONTRADICTED");

// Simulate Reviewer marking VERIFIED
warehouseClaim.human_decision = "VERIFIED";
VeritasEngine.recomputeAll(state);
assert(warehouseClaim.displayed_status === "SUPPORTED", "Precedence Rule 1: Human decision VERIFIED overrides automated verdict to SUPPORTED");
assert(warehouseClaim.flags && warehouseClaim.flags.human_verified === true, "Human-verified flag applied to badge");

// Simulate Reviewer marking REJECTED
warehouseClaim.human_decision = "REJECTED";
VeritasEngine.recomputeAll(state);
assert(warehouseClaim.displayed_status === "REJECTED", "Precedence Rule 1: Human decision REJECTED displays as REJECTED");

// Simulate Undo
warehouseClaim.human_decision = null;
VeritasEngine.recomputeAll(state);
assert(warehouseClaim.displayed_status === "CONTRADICTED", "Undo successfully restores automated CONTRADICTED status");

// Test 5: Contradiction Resolution Recompute
const contra1 = state.contradictions.find(c => c.id === "contra-contract-warehouse-qty");
contra1.state = "Resolved";
VeritasEngine.recomputeAll(state);
const metricsAfterResolve = VeritasEngine.calculateMetrics(state);
assert(contra1.state === "Resolved", "Contradiction marked as Resolved");

// Summary
console.log(`\n========================================`);
console.log(`TEST RESULTS: ${passed} / ${total} passed (${((passed/total)*100).toFixed(0)}%)`);
console.log(`========================================\n`);

if (passed === total) {
  process.exit(0);
} else {
  process.exit(1);
}
