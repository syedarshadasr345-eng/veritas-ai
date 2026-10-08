/**
 * VERITAS AI — Deterministic Logic & Auditable Analysis Engine
 * Implements Section 4 (Rules & Logic) of VERITAS_SPEC.md:
 * - Document Ingestion & Anchoring (4.1)
 * - Deterministic Extraction Stub & Heuristics (4.2)
 * - Synonym Normalization & Contradiction Detection (4.3)
 * - Severity Formula & Adjustments (4.4)
 * - Verdict Precedence Resolution (4.5)
 * - Claim Transitions & Cascade Recompute (4.6, 4.7)
 * - Metrics & Invariant Enforcement (4.8)
 */

const VeritasEngine = (() => {

  // Synonym maps for normalization (4.3)
  const QUANTITY_VERBS = ["delivered", "received", "shipped", "arrived", "dispatched", "intake", "tally", "send", "sent"];
  const REQUIREMENT_VERBS = ["required", "must", "needs to", "shall", "mandated", "obligated", "expected"];
  const STATUS_TERMS = {
    "certified": { positive: true, canonical: "certified" },
    "not certified": { positive: false, canonical: "certified" },
    "uncertified": { positive: false, canonical: "certified" },
    "passed": { positive: true, canonical: "pass" },
    "failed": { positive: false, canonical: "pass" },
    "compliant": { positive: true, canonical: "compliance" },
    "non-compliant": { positive: false, canonical: "compliance" }
  };

  /**
   * Simple string hash helper for duplicate detection (4.1)
   */
  function computeHash(content) {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash |= 0; // Convert to 32bit integer
    }
    return "hash_" + Math.abs(hash).toString(16);
  }

  /**
   * Cleans and extracts text from various file formats (plain text, markdown, or binary text streams)
   */
  function sanitizeAndExtractDocumentText(rawContent, filename = "") {
    if (!rawContent || rawContent.length === 0) return "";

    // If it's a PDF file (starts with %PDF)
    if (typeof rawContent === "string" && rawContent.startsWith("%PDF")) {
      // Extract printable text chunks from PDF streams
      const textMatches = rawContent.match(/\(([^()]{4,})\)|\[([^\[\]]{4,})\]/g);
      let extracted = "";
      if (textMatches && textMatches.length > 0) {
        extracted = textMatches
          .map(m => m.replace(/^[(\[]|[)\]]$/g, "").trim())
          .filter(m => m.length > 5 && !/^[0-9\s]+$/.test(m) && /[a-zA-Z]/.test(m))
          .join(" ");
      }

      // If text stream extraction found readable sentences:
      if (extracted.length > 50) {
        return extracted;
      }

      // If PDF has no extractable text streams (e.g. scanned or compressed)
      return "";
    }

    // Standard plain text / markdown / DOCX extracted text
    return rawContent.replace(/\0/g, "").trim();
  }

  /**
   * Normalizes document plain text into pages and numbered paragraphs (4.1)
   */
  function normalizeDocumentText(rawText) {
    if (!rawText || rawText.trim().length === 0) {
      return [];
    }

    // Split pages on form feed or page markers
    const pagesRaw = rawText.split(/\f|\n---page---\n|\n--- PAGE \d+ ---\n/gi);
    return pagesRaw.map((pageText, pIdx) => {
      // Split on empty lines or linebreaks into paragraphs
      const lines = pageText
        .split(/\r?\n\r?\n+|\r?\n+/)
        .map(l => l.trim())
        .filter(l => l.length > 0);

      const paragraphs = lines.map((paraText, paraIdx) => ({
        para_id: `p${paraIdx + 1}`,
        text: paraText
      }));

      return {
        page_num: pIdx + 1,
        paragraphs: paragraphs.length > 0 ? paragraphs : [{ para_id: "p1", text: pageText.trim() }]
      };
    });
  }

  /**
   * Deterministic Extraction Stub (4.2)
   * Splits text into declarative sentences and populates structured fields via regex & heuristics.
   */
  function extractClaimsFromDocument(doc) {
    const extractedClaims = [];
    const evidenceLinks = [];

    doc.pages.forEach(page => {
      page.paragraphs.forEach(para => {
        // Split paragraph into candidate sentences
        const sentences = para.text.match(/[^.!?]+[.!?]+/g) || [para.text];

        sentences.forEach(sentence => {
          const trimmed = sentence.trim();
          if (trimmed.length < 8) return; // Skip trivial fragments

          // Structured field regex extractors
          // 1. Numeric value & units
          const qtyMatch = trimmed.match(/([0-9]{1,3}(?:,[0-9]{3})*|\d+)\s*(units|pieces|boxes|items|kg|lbs|tons|meters)?/i);
          let val = null;
          let unit = "";
          if (qtyMatch) {
            val = parseFloat(qtyMatch[1].replace(/,/g, ""));
            unit = qtyMatch[2] ? qtyMatch[2].toLowerCase() : "units";
          }

          // 2. Date extraction (ISO, "Sept 15", "September 15, 2026", etc.)
          const dateMatch = trimmed.match(/(?:\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2}(?:,?\s+\d{4})?|\d{4}-\d{2}-\d{2})/i);
          let dateStr = null;
          if (dateMatch) {
            dateStr = parseDateToISO(dateMatch[0]);
          }

          // 3. Status term & Requirement keywords
          let statusTerm = null;
          for (const key of Object.keys(STATUS_TERMS)) {
            if (trimmed.toLowerCase().includes(key)) {
              statusTerm = key;
              break;
            }
          }
          if (!statusTerm) {
            for (const req of REQUIREMENT_VERBS) {
              if (trimmed.toLowerCase().includes(req)) {
                statusTerm = req;
                break;
              }
            }
          }
          if (!statusTerm) {
            for (const qv of QUANTITY_VERBS) {
              if (trimmed.toLowerCase().includes(qv)) {
                statusTerm = qv;
                break;
              }
            }
          }

          // 4. Entity extraction
          let entity = "Model-X widgets";
          if (trimmed.toLowerCase().includes("iso")) entity = "Apex Quality System";
          else if (trimmed.toLowerCase().includes("contract")) entity = "Global Dynamics Supply";
          else if (trimmed.toLowerCase().includes("manifest") || trimmed.toLowerCase().includes("shipment")) entity = "Model-X widgets";

          // 5. Confidence heuristic (4.2):
          // High: contains a number, date, or entity pattern AND a metric or status keyword
          // Med: contains one of those patterns
          // Low: neither, or very short / very long
          let confidence = "Low";
          let rationale = "";

          const hasNumber = val !== null;
          const hasDate = dateStr !== null;
          const hasStatus = statusTerm !== null;
          const isExtremeLength = trimmed.length < 20 || trimmed.length > 250;

          if (isExtremeLength) {
            confidence = "Low";
            rationale = "Sentence is either too brief or unusually lengthy for a single factual claim.";
          } else if ((hasNumber || hasDate) && hasStatus) {
            confidence = "High";
            rationale = `Contains specific quantitative data (${hasNumber ? val + ' ' + unit : ''}${hasDate ? ', date ' + dateStr : ''}) with verified status keyword '${statusTerm}'.`;
          } else if (hasNumber || hasDate || hasStatus) {
            confidence = "Med";
            rationale = `Contains partial structured data (${hasNumber ? 'numeric value' : ''}${hasDate ? 'date' : ''}${hasStatus ? 'status keyword' : ''}) but missing full metric context.`;
          } else {
            confidence = "Low";
            rationale = "Lacks structured metrics, dates, and verifiable status keywords.";
          }

          // Calculate character offsets in the paragraph
          const charStart = para.text.indexOf(trimmed);
          const charEnd = charStart >= 0 ? charStart + trimmed.length : trimmed.length;

          const claimId = "claim-" + Math.random().toString(36).substr(2, 9);
          const evId = "ev-" + Math.random().toString(36).substr(2, 9);

          const lifecycle = confidence === "Low" ? "Suppressed" : "Candidate";

          const newClaim = {
            id: claimId,
            claim_text: trimmed,
            claim_type: hasNumber ? "Quantity & Fulfillment" : hasDate ? "Schedule & Delivery" : hasStatus ? "Requirement & Compliance" : "General Observation",
            doc_id: doc.id,
            doc_name: doc.name,
            source_location: `Page ${page.page_num}, Paragraph ${para.para_id}`,
            page: page.page_num,
            para_id: para.para_id,
            char_start: Math.max(0, charStart),
            char_end: charEnd,
            structured: {
              entity: entity,
              metric: hasNumber ? "units" : "specification",
              value: val,
              unit: unit,
              date: dateStr,
              status_term: statusTerm
            },
            lifecycle: lifecycle,
            confidence: confidence,
            confidence_rationale: rationale,
            auto_verdict: "NEEDS VERIFICATION",
            human_decision: null,
            history: [
              {
                timestamp: new Date().toISOString(),
                action: "EXTRACTION",
                actor: "Extraction Engine",
                details: `Extracted from ${doc.name} (Page ${page.page_num}, ${para.para_id}). Confidence: ${confidence}.`
              }
            ]
          };

          const newEvidence = {
            id: evId,
            claim_id: claimId,
            doc_id: doc.id,
            doc_name: doc.name,
            page: page.page_num,
            para_id: para.para_id,
            char_start: Math.max(0, charStart),
            char_end: charEnd,
            quoted_text: trimmed,
            annotation: "Automatically extracted source citation.",
            redacted: false
          };

          extractedClaims.push(newClaim);
          evidenceLinks.push(newEvidence);
        });
      });
    });

    return { claims: extractedClaims, evidence: evidenceLinks };
  }

  /**
   * Helper to normalize simple date strings into YYYY-MM-DD
   */
  function parseDateToISO(str) {
    if (!str) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

    const months = {
      jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
      jul: "07", aug: "08", sep: "09", sept: "09", oct: "10", nov: "11", dec: "12"
    };

    const match = str.match(/(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:,?\s+(\d{4}))?/i);
    if (match) {
      const month = months[match[1].toLowerCase()];
      const day = match[2].padStart(2, "0");
      const year = match[3] || "2026";
      return `${year}-${month}-${day}`;
    }
    return str;
  }

  /**
   * Computes days between two ISO date strings (4.4)
   */
  function dateDiffInDays(d1, d2) {
    const t1 = new Date(d1).getTime();
    const t2 = new Date(d2).getTime();
    if (isNaN(t1) || isNaN(t2)) return 0;
    return Math.round(Math.abs(t2 - t1) / (1000 * 60 * 60 * 24));
  }

  /**
   * Checks if two claims are comparable (4.3):
   * Different documents, matching normalized entity and metric family.
   */
  function areComparableClaims(c1, c2) {
    if (c1.doc_id === c2.doc_id) return false;
    if (c1.lifecycle === "Suppressed" || c2.lifecycle === "Suppressed") return false;
    if (c1.lifecycle === "Merged" || c2.lifecycle === "Merged") return false;

    // Entity comparison (normalized)
    const e1 = (c1.structured.entity || "").toLowerCase();
    const e2 = (c2.structured.entity || "").toLowerCase();
    const entityMatch = e1 === e2 || e1.includes("model-x") && e2.includes("model-x") || e1.includes("widget") && e2.includes("widget");

    // Metric family comparison
    const m1 = (c1.structured.metric || "").toLowerCase();
    const m2 = (c2.structured.metric || "").toLowerCase();
    const metricMatch = m1 === m2 || (m1.includes("unit") && m2.includes("unit"));

    return entityMatch && metricMatch;
  }

  /**
   * Contradiction Severity Formula with Adjustments (4.4)
   */
  function evaluateContradiction(c1, c2, allContradictionsForFacts = 0) {
    let conflictType = null;
    let baseSeverity = "Low";
    let rationale = "";

    // 1. Quantity Mismatch check: numeric values differ by > 5% or > 100 units
    if (c1.structured.value !== null && c2.structured.value !== null && typeof c1.structured.value === "number" && typeof c2.structured.value === "number") {
      const v1 = c1.structured.value;
      const v2 = c2.structured.value;
      const diff = Math.abs(v1 - v2);
      const maxVal = Math.max(v1, v2);
      const relDiff = maxVal > 0 ? (diff / maxVal) : 0;

      if (relDiff > 0.05 || diff > 100) {
        conflictType = "Quantity mismatch";
        if (relDiff > 0.10) {
          baseSeverity = "High";
          rationale = `Quantity differs by ${(relDiff * 100).toFixed(1)}% (${v1.toLocaleString()} vs ${v2.toLocaleString()}, > 10% threshold) → High`;
        } else if (relDiff >= 0.05) {
          baseSeverity = "Medium";
          rationale = `Quantity differs by ${(relDiff * 100).toFixed(1)}% (${v1.toLocaleString()} vs ${v2.toLocaleString()}, 5% to 10% range) → Medium`;
        } else {
          baseSeverity = "Low";
          rationale = `Quantity differs by ${(relDiff * 100).toFixed(1)}% (under 5%, flagged due to > 100-unit discrepancy: ${diff} units) → Low`;
        }
      }
    }

    // 2. Date Mismatch check
    if (!conflictType && c1.structured.date && c2.structured.date) {
      const daysDiff = dateDiffInDays(c1.structured.date, c2.structured.date);
      if (daysDiff > 0) {
        conflictType = "Date mismatch";
        if (daysDiff >= 3) {
          baseSeverity = "High";
          rationale = `Date mismatch of ${daysDiff} days (${c1.structured.date} vs ${c2.structured.date}, >= 3 days threshold) → High`;
        } else if (daysDiff === 2) {
          baseSeverity = "Medium";
          rationale = `Date mismatch of 2 days (${c1.structured.date} vs ${c2.structured.date}) → Medium`;
        } else {
          baseSeverity = "Low";
          rationale = `Date mismatch of 1 day (${c1.structured.date} vs ${c2.structured.date}) → Low`;
        }
      }
    }

    // 3. Status conflict check (e.g., certified vs not certified)
    if (!conflictType && c1.structured.status_term && c2.structured.status_term) {
      const s1 = STATUS_TERMS[c1.structured.status_term.toLowerCase()];
      const s2 = STATUS_TERMS[c2.structured.status_term.toLowerCase()];
      if (s1 && s2 && s1.canonical === s2.canonical && s1.positive !== s2.positive) {
        conflictType = "Status conflict";
        baseSeverity = "High";
        rationale = `Direct logical opposite status terms: '${c1.structured.status_term}' vs '${c2.structured.status_term}' → High`;
      }
    }

    // If no conflict found, return null
    if (!conflictType) {
      return null;
    }

    // Severity adjustments in order (4.4):
    // 1. +1 level if either underlying claim has High confidence.
    // 2. +1 level if the same fact is contradicted by 2+ other documents.
    // 3. -1 level (min Low) if both claims have Low confidence.
    // Unknown: only if required field is missing.
    const severityLevels = ["Low", "Medium", "High"];
    let levelIdx = severityLevels.indexOf(baseSeverity);

    if (c1.confidence === "High" || c2.confidence === "High") {
      if (levelIdx < 2) {
        levelIdx += 1;
        rationale += " [+1 adjustment: underlying claim has High confidence]";
      }
    }

    if (allContradictionsForFacts >= 2) {
      if (levelIdx < 2) {
        levelIdx += 1;
        rationale += " [+1 adjustment: fact contradicted across 2+ documents]";
      }
    }

    if (c1.confidence === "Low" && c2.confidence === "Low") {
      if (levelIdx > 0) {
        levelIdx -= 1;
        rationale += " [-1 adjustment: both claims have Low confidence]";
      }
    }

    const finalSeverity = severityLevels[levelIdx];

    return {
      conflict_type: conflictType,
      severity: finalSeverity,
      severity_rationale: rationale,
      explanation: `${conflictType} detected between ${c1.doc_name} ("${c1.claim_text}") and ${c2.doc_name} ("${c2.claim_text}").`
    };
  }

  /**
   * Evaluates Automated Verdict & Displayed Status (Section 4.5 - Strict Precedence)
   *
   * Precedence Order (top to bottom; first match wins):
   * 1. Human decision exists:
   *    - VERIFIED => SUPPORTED (with human-verified flag)
   *    - REJECTED => REJECTED
   *    - MORE_EVIDENCE => NEEDS VERIFICATION (with "Needs More Evidence" flag)
   * 2. No non-redacted evidence, OR confidence is Low, OR open contradiction with Unknown severity,
   *    OR reviewer requested verification => NEEDS VERIFICATION.
   * 3. At least one open contradiction with Medium or High severity against a claim from a different document => CONTRADICTED.
   * 4. Otherwise, with one or more evidence snippets => SUPPORTED.
   */
  function computeClaimVerdict(claim, allEvidence, allContradictions) {
    // 1. Human Decision Precedence
    if (claim.human_decision) {
      if (claim.human_decision === "VERIFIED") {
        return {
          auto_verdict: claim.auto_verdict || "SUPPORTED",
          displayed_status: "SUPPORTED",
          rule_applied: "Rule 1: Human reviewer verified claim as SUPPORTED.",
          flags: { human_verified: true }
        };
      }
      if (claim.human_decision === "REJECTED") {
        return {
          auto_verdict: claim.auto_verdict || "SUPPORTED",
          displayed_status: "REJECTED",
          rule_applied: "Rule 1: Human reviewer marked claim as REJECTED.",
          flags: {}
        };
      }
      if (claim.human_decision === "MORE_EVIDENCE") {
        return {
          auto_verdict: claim.auto_verdict || "NEEDS VERIFICATION",
          displayed_status: "NEEDS VERIFICATION",
          rule_applied: "Rule 1: Human reviewer flagged claim as REQUIRES MORE EVIDENCE.",
          flags: { needs_more_evidence: true }
        };
      }
    }

    // Check evidence snippets for this claim
    const claimEvidence = allEvidence.filter(e => e.claim_id === claim.id && !e.redacted);
    const hasActiveEvidence = claimEvidence.length > 0;

    // Check open contradictions involving this claim
    const openContradictions = allContradictions.filter(contra =>
      (contra.claim_a_id === claim.id || contra.claim_b_id === claim.id) &&
      (contra.state === "Open" || contra.state === "Escalated")
    );

    const hasUnknownSeverity = openContradictions.some(c => c.severity === "Unknown");
    const hasMedOrHighContradiction = openContradictions.some(c => c.severity === "Medium" || c.severity === "High");

    // 2. Rule 2
    if (!hasActiveEvidence || claim.confidence === "Low" || hasUnknownSeverity || claim.requested_verification) {
      let reason = "Rule 2: ";
      if (!hasActiveEvidence) reason += "No active non-redacted evidence snippets. ";
      if (claim.confidence === "Low") reason += "Low confidence extraction. ";
      if (hasUnknownSeverity) reason += "Involves open contradiction with Unknown severity. ";
      if (claim.requested_verification) reason += "Verification requested. ";

      return {
        auto_verdict: "NEEDS VERIFICATION",
        displayed_status: "NEEDS VERIFICATION",
        rule_applied: reason.trim(),
        flags: {}
      };
    }

    // 3. Rule 3
    if (hasMedOrHighContradiction) {
      return {
        auto_verdict: "CONTRADICTED",
        displayed_status: "CONTRADICTED",
        rule_applied: "Rule 3: Open Medium or High severity contradiction detected against a different document.",
        flags: {}
      };
    }

    // 4. Rule 4
    if (hasActiveEvidence) {
      return {
        auto_verdict: "SUPPORTED",
        displayed_status: "SUPPORTED",
        rule_applied: "Rule 4: Valid non-redacted evidence attached and no active Medium/High contradictions.",
        flags: {}
      };
    }

    return {
      auto_verdict: "NEEDS VERIFICATION",
      displayed_status: "NEEDS VERIFICATION",
      rule_applied: "Rule 2 (Fallback): Default to verification.",
      flags: {}
    };
  }

  /**
   * Recompute Engine (Section 4.7):
   * Re-evaluates contradictions and verdicts across all claims.
   * Maintains invariant: Supported + Contradicted + Needs Verification = Claims Extracted (4.8).
   */
  function recomputeAll(state) {
    const activeClaims = state.claims.filter(c => c.lifecycle === "Active" || c.lifecycle === "Candidate");

    // 1. Detect / Update Contradictions between all pairs of active claims
    const existingContradictions = [...state.contradictions];

    // For any non-resolved contradiction, re-evaluate magnitude
    existingContradictions.forEach(contra => {
      if (contra.state !== "Resolved") {
        const c1 = state.claims.find(c => c.id === contra.claim_a_id);
        const c2 = state.claims.find(c => c.id === contra.claim_b_id);
        if (!c1 || !c2 || c1.lifecycle === "Merged" || c2.lifecycle === "Merged") {
          contra.state = "Resolved";
          contra.explanation += " (Source claim removed or merged)";
        } else {
          const evalResult = evaluateContradiction(c1, c2);
          if (evalResult) {
            contra.severity = evalResult.severity;
            contra.severity_rationale = evalResult.severity_rationale;
          }
        }
      }
    });

    // Pairwise scan for new contradictions
    for (let i = 0; i < activeClaims.length; i++) {
      for (let j = i + 1; j < activeClaims.length; j++) {
        const c1 = activeClaims[i];
        const c2 = activeClaims[j];

        if (areComparableClaims(c1, c2)) {
          const alreadyExists = existingContradictions.find(c =>
            (c.claim_a_id === c1.id && c.claim_b_id === c2.id) ||
            (c.claim_a_id === c2.id && c.claim_b_id === c1.id)
          );

          const evalResult = evaluateContradiction(c1, c2);

          if (evalResult) {
            if (!alreadyExists) {
              existingContradictions.push({
                id: "contra-" + Math.random().toString(36).substr(2, 9),
                claim_a_id: c1.id,
                claim_b_id: c2.id,
                conflict_type: evalResult.conflict_type,
                severity: evalResult.severity,
                severity_rationale: evalResult.severity_rationale,
                explanation: evalResult.explanation,
                state: "Open",
                history: [
                  {
                    timestamp: new Date().toISOString(),
                    action: "DETECTED",
                    actor: "Contradiction Engine",
                    details: evalResult.explanation
                  }
                ]
              });
            }
          }
        }
      }
    }

    state.contradictions = existingContradictions;

    // 2. Recompute verdicts for all claims
    state.claims.forEach(claim => {
      const verdictResult = computeClaimVerdict(claim, state.evidence_links, state.contradictions);
      claim.auto_verdict = verdictResult.auto_verdict;
      claim.displayed_status = verdictResult.displayed_status;
      claim.rule_applied = verdictResult.rule_applied;
      claim.flags = verdictResult.flags;
    });

    return state;
  }

  /**
   * Computes Dashboard Metrics (Section 4.8)
   */
  function calculateMetrics(state) {
    const analyzedDocs = state.documents.filter(d => d.status === "Extraction complete").length;

    // Claims Extracted: Active + Candidate (excluding Suppressed, Merged, and REJECTED)
    const validExtractedClaims = state.claims.filter(c =>
      (c.lifecycle === "Active" || c.lifecycle === "Candidate") &&
      c.displayed_status !== "REJECTED"
    );

    const claimsExtractedCount = validExtractedClaims.length;

    const supportedCount = validExtractedClaims.filter(c => c.displayed_status === "SUPPORTED").length;
    const contradictedCount = validExtractedClaims.filter(c => c.displayed_status === "CONTRADICTED").length;
    const needsVerificationCount = validExtractedClaims.filter(c => c.displayed_status === "NEEDS VERIFICATION").length;

    // Total rejected claims (for small caption)
    const rejectedCount = state.claims.filter(c => c.displayed_status === "REJECTED").length;

    // High-Risk Issues: Contradictions that are Open or Escalated with severity High or Unknown
    const highRiskIssues = state.contradictions.filter(c =>
      (c.state === "Open" || c.state === "Escalated") &&
      (c.severity === "High" || c.severity === "Unknown")
    ).sort((a, b) => {
      if (a.severity === "High" && b.severity !== "High") return -1;
      if (b.severity === "High" && a.severity !== "High") return 1;
      return 0;
    });

    return {
      documents_analyzed: analyzedDocs,
      claims_extracted: claimsExtractedCount,
      supported_claims: supportedCount,
      contradicted_claims: contradictedCount,
      needs_verification_claims: needsVerificationCount,
      rejected_claims: rejectedCount,
      high_risk_issues: highRiskIssues
    };
  }

  return {
    computeHash,
    sanitizeAndExtractDocumentText,
    normalizeDocumentText,
    extractClaimsFromDocument,
    areComparableClaims,
    evaluateContradiction,
    computeClaimVerdict,
    recomputeAll,
    calculateMetrics
  };
})();
