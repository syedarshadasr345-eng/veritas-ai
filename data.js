/**
 * VERITAS AI — Initial Data Store
 * Implements the complete pre-loaded demo case from Section 9 of VERITAS_SPEC.md.
 * Includes documents with normalized paragraphs, claims, evidence snippets,
 * cross-document contradictions, and immutable activity logs.
 */

const INITIAL_DATA = {
  reviewerName: "Demo Reviewer",

  documents: [
    {
      id: "doc-contract",
      name: "Supplier Contract",
      type: "PDF",
      upload_date: "2026-09-01T09:30:00Z",
      size: "245 KB",
      size_bytes: 250880,
      hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      status: "Extraction complete",
      tags: ["Procurement", "Legal", "Master Agreement"],
      pages: [
        {
          page_num: 1,
          paragraphs: [
            {
              para_id: "p1",
              text: "Master Supply Agreement entered into between Global Dynamics Corp and Apex Manufacturing Ltd."
            },
            {
              para_id: "p2",
              text: "Section 3.1 Delivery Schedule: The Supplier shall deliver exactly 10,000 units of Model-X widgets required by Sept 15, 2026 to designated distribution hubs."
            },
            {
              para_id: "p3",
              text: "Section 4.2 Quality Standards: All parts must pass preliminary incoming inspection protocols as per standard operating procedures."
            },
            {
              para_id: "p4",
              text: "Section 9.0 Penalty Clause: Any delays exceeding 48 hours shall incur a 2% daily penalty on invoice valuation."
            }
          ]
        }
      ]
    },
    {
      id: "doc-delivery",
      name: "Delivery Report",
      type: "PDF",
      upload_date: "2026-09-14T17:15:00Z",
      size: "180 KB",
      size_bytes: 184320,
      hash: "8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4",
      status: "Extraction complete",
      tags: ["Logistics", "Carrier Manifest"],
      pages: [
        {
          page_num: 1,
          paragraphs: [
            {
              para_id: "p1",
              text: "Logistics Manifest #TR-8891: Consolidated shipment of 10,000 units delivered Sept 14, 2026 via Carrier Express to Northern Central Warehouse."
            },
            {
              para_id: "p2",
              text: "Consignment condition verified intact upon transfer from transport fleet dock without visible container damage."
            }
          ]
        }
      ]
    },
    {
      id: "doc-warehouse",
      name: "Warehouse Report",
      type: "PDF",
      upload_date: "2026-09-18T08:00:00Z",
      size: "310 KB",
      size_bytes: 317440,
      hash: "ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb",
      status: "Extraction complete",
      tags: ["Intake Audit", "Inventory", "Discrepancy"],
      pages: [
        {
          page_num: 1,
          paragraphs: [
            {
              para_id: "p1",
              text: "Warehouse Inbound Verification Audit Log — Facility 4B."
            },
            {
              para_id: "p2",
              text: "Inbound shipment intake completed. Physical tally confirmed only 8,500 units received Sept 17, 2026 after dock sorting and carton scanning."
            },
            {
              para_id: "p3",
              text: "Discrepancy noted in inventory ledger; shortfall of 1,500 units flagged for vendor reconciliation and invoice hold."
            }
          ]
        }
      ]
    },
    {
      id: "doc-compliance",
      name: "Compliance Certificate",
      type: "PDF",
      upload_date: "2026-01-10T11:00:00Z",
      size: "95 KB",
      size_bytes: 97280,
      hash: "a591a6d40bf420404a011733cfb7b190d62c65bf0bcda32b57b277d9ad9f146e",
      status: "Extraction complete",
      tags: ["Quality", "ISO", "Audit Certificate"],
      pages: [
        {
          page_num: 1,
          paragraphs: [
            {
              para_id: "p1",
              text: "International Standardization Audit Body: Certificate of Registration."
            },
            {
              para_id: "p2",
              text: "This certifies that Apex Manufacturing Ltd operates quality systems conforming to ISO 9001 certified standards for precision mechanical assembly."
            }
          ]
        }
      ]
    }
  ],

  claims: [
    {
      id: "claim-contract-qty",
      claim_text: "10,000 units required by Sept 15",
      claim_type: "Delivery & Schedule",
      doc_id: "doc-contract",
      doc_name: "Supplier Contract",
      source_location: "Page 1, Paragraph 2",
      page: 1,
      para_id: "p2",
      char_start: 57,
      char_end: 89,
      structured: {
        entity: "Model-X widgets",
        metric: "units",
        value: 10000,
        unit: "units",
        date: "2026-09-15",
        status_term: "required"
      },
      lifecycle: "Active", // Active, Candidate, Merged, Suppressed
      confidence: "High",
      confidence_rationale: "Contains specific numeric quantity (10,000), ISO deadline date (Sept 15), and requirement term 'required'.",
      auto_verdict: "CONTRADICTED",
      human_decision: null, // null | 'VERIFIED' | 'REJECTED' | 'MORE_EVIDENCE'
      history: [
        {
          timestamp: "2026-09-01T09:30:15Z",
          action: "EXTRACTION",
          actor: "System Engine",
          details: "Claim extracted automatically from Supplier Contract (Page 1, Para 2)."
        },
        {
          timestamp: "2026-09-18T08:00:25Z",
          action: "CONTRADICTION_FLAGGED",
          actor: "System Engine",
          details: "Quantity and Date conflicts detected with Warehouse Report."
        }
      ]
    },
    {
      id: "claim-delivery-qty",
      claim_text: "10,000 units delivered Sept 14",
      claim_type: "Logistics Manifest",
      doc_id: "doc-delivery",
      doc_name: "Delivery Report",
      source_location: "Page 1, Paragraph 1",
      page: 1,
      para_id: "p1",
      char_start: 41,
      char_end: 71,
      structured: {
        entity: "Model-X widgets",
        metric: "units",
        value: 10000,
        unit: "units",
        date: "2026-09-14",
        status_term: "delivered"
      },
      lifecycle: "Active",
      confidence: "High",
      confidence_rationale: "Contains specific numeric quantity (10,000), arrival date (Sept 14), and delivery status term.",
      auto_verdict: "CONTRADICTED",
      human_decision: null,
      history: [
        {
          timestamp: "2026-09-14T17:15:20Z",
          action: "EXTRACTION",
          actor: "System Engine",
          details: "Claim extracted automatically from Delivery Report (Page 1, Para 1)."
        },
        {
          timestamp: "2026-09-18T08:00:25Z",
          action: "CONTRADICTION_FLAGGED",
          actor: "System Engine",
          details: "Quantity mismatch flagged against Warehouse Report."
        }
      ]
    },
    {
      id: "claim-warehouse-qty",
      claim_text: "8,500 units received Sept 17",
      claim_type: "Inventory Intake",
      doc_id: "doc-warehouse",
      doc_name: "Warehouse Report",
      source_location: "Page 1, Paragraph 2",
      page: 1,
      para_id: "p2",
      char_start: 56,
      char_end: 84,
      structured: {
        entity: "Model-X widgets",
        metric: "units",
        value: 8500,
        unit: "units",
        date: "2026-09-17",
        status_term: "received"
      },
      lifecycle: "Active",
      confidence: "High",
      confidence_rationale: "Contains intake quantity count (8,500), arrival date (Sept 17), and reception status term.",
      auto_verdict: "CONTRADICTED",
      human_decision: null,
      history: [
        {
          timestamp: "2026-09-18T08:00:15Z",
          action: "EXTRACTION",
          actor: "System Engine",
          details: "Claim extracted automatically from Warehouse Report (Page 1, Para 2)."
        },
        {
          timestamp: "2026-09-18T08:00:25Z",
          action: "CONTRADICTION_FLAGGED",
          actor: "System Engine",
          details: "Quantity conflict (15% deficit) against Contract and Delivery Report."
        }
      ]
    },
    {
      id: "claim-compliance-iso",
      claim_text: "ISO 9001 certified for quality management systems",
      claim_type: "Quality & Compliance",
      doc_id: "doc-compliance",
      doc_name: "Compliance Certificate",
      source_location: "Page 1, Paragraph 2",
      page: 1,
      para_id: "p2",
      char_start: 73,
      char_end: 122,
      structured: {
        entity: "Apex Manufacturing Ltd",
        metric: "certification",
        value: "ISO 9001",
        unit: "",
        date: "2026-01-10",
        status_term: "certified"
      },
      lifecycle: "Active",
      confidence: "High",
      confidence_rationale: "Recognized standard entity ISO 9001 and affirmative status keyword 'certified'.",
      auto_verdict: "SUPPORTED",
      human_decision: null,
      history: [
        {
          timestamp: "2026-01-10T11:00:25Z",
          action: "EXTRACTION",
          actor: "System Engine",
          details: "Claim extracted automatically from Compliance Certificate (Page 1, Para 2)."
        }
      ]
    },
    {
      id: "claim-candidate-spec",
      claim_text: "All parts must pass preliminary incoming inspection protocols",
      claim_type: "Operational Requirement",
      doc_id: "doc-contract",
      doc_name: "Supplier Contract",
      source_location: "Page 1, Paragraph 3",
      page: 1,
      para_id: "p3",
      char_start: 32,
      char_end: 93,
      structured: {
        entity: "All parts",
        metric: "inspection",
        value: null,
        unit: "",
        date: null,
        status_term: "must pass"
      },
      lifecycle: "Candidate", // Displays as "Unreviewed"
      requested_verification: true,
      confidence: "Med",
      confidence_rationale: "Contains requirement modal 'must pass' but lacks quantitative values or dates.",
      auto_verdict: "NEEDS VERIFICATION",
      human_decision: null,
      history: [
        {
          timestamp: "2026-09-01T09:30:18Z",
          action: "EXTRACTION",
          actor: "System Engine",
          details: "Candidate claim generated from declarative sentence."
        }
      ]
    },
    {
      id: "claim-suppressed-note",
      claim_text: "Consolidated shipment via Carrier Express to Northern Central Warehouse",
      claim_type: "General Note",
      doc_id: "doc-delivery",
      doc_name: "Delivery Report",
      source_location: "Page 1, Paragraph 1",
      page: 1,
      para_id: "p1",
      char_start: 24,
      char_end: 95,
      structured: {
        entity: "Consolidated shipment",
        metric: "transport",
        value: null,
        unit: "",
        date: null,
        status_term: null
      },
      lifecycle: "Suppressed", // Low-confidence candidate hidden by default
      confidence: "Low",
      confidence_rationale: "Descriptive sentence without structured numerical metrics, deadline dates, or verifiable status keywords.",
      auto_verdict: "NEEDS VERIFICATION",
      human_decision: null,
      history: [
        {
          timestamp: "2026-09-14T17:15:22Z",
          action: "EXTRACTION",
          actor: "System Engine",
          details: "Suppressed candidate claim (low confidence heuristic score)."
        }
      ]
    }
  ],

  evidence_links: [
    {
      id: "ev-1",
      claim_id: "claim-contract-qty",
      doc_id: "doc-contract",
      doc_name: "Supplier Contract",
      page: 1,
      para_id: "p2",
      char_start: 57,
      char_end: 89,
      quoted_text: "10,000 units of Model-X widgets required by Sept 15, 2026",
      annotation: "Primary clause governing procurement volume and commitment deadline.",
      redacted: false
    },
    {
      id: "ev-2",
      claim_id: "claim-delivery-qty",
      doc_id: "doc-delivery",
      doc_name: "Delivery Report",
      page: 1,
      para_id: "p1",
      char_start: 41,
      char_end: 71,
      quoted_text: "10,000 units delivered Sept 14",
      annotation: "Carrier receipt and dispatch manifest record.",
      redacted: false
    },
    {
      id: "ev-3",
      claim_id: "claim-warehouse-qty",
      doc_id: "doc-warehouse",
      doc_name: "Warehouse Report",
      page: 1,
      para_id: "p2",
      char_start: 56,
      char_end: 84,
      quoted_text: "8,500 units received Sept 17",
      annotation: "Physical barcode scan tally record recorded by intake crew.",
      redacted: false
    },
    {
      id: "ev-4",
      claim_id: "claim-compliance-iso",
      doc_id: "doc-compliance",
      doc_name: "Compliance Certificate",
      page: 1,
      para_id: "p2",
      char_start: 73,
      char_end: 122,
      quoted_text: "conforming to ISO 9001 certified standards for precision mechanical assembly",
      annotation: "Official registrar accreditation stamp.",
      redacted: false
    },
    {
      id: "ev-5",
      claim_id: "claim-candidate-spec",
      doc_id: "doc-contract",
      doc_name: "Supplier Contract",
      page: 1,
      para_id: "p3",
      char_start: 32,
      char_end: 93,
      quoted_text: "All parts must pass preliminary incoming inspection protocols",
      annotation: "Standard QA inspection guideline citation.",
      redacted: false
    }
  ],

  contradictions: [
    {
      id: "contra-contract-warehouse-qty",
      claim_a_id: "claim-contract-qty",
      claim_b_id: "claim-warehouse-qty",
      conflict_type: "Quantity mismatch",
      severity: "High",
      severity_rationale: "Quantity differs by 15.0% (10,000 vs 8,500, > 10% threshold) → High",
      explanation: "Contract specifies 10,000 units required; Warehouse tally confirms only 8,500 units received (deficit of 1,500 units / 15%).",
      state: "Open", // 'Open', 'Escalated', 'Resolved'
      history: [
        {
          timestamp: "2026-09-18T08:00:25Z",
          action: "DETECTED",
          actor: "Contradiction Engine",
          details: "Automated comparison matched entity 'Model-X widgets' with metric 'units'."
        }
      ]
    },
    {
      id: "contra-delivery-warehouse-qty",
      claim_a_id: "claim-delivery-qty",
      claim_b_id: "claim-warehouse-qty",
      conflict_type: "Quantity mismatch",
      severity: "High",
      severity_rationale: "Quantity differs by 15.0% (10,000 vs 8,500, > 10% threshold) → High",
      explanation: "Carrier manifest records 10,000 units delivered; Warehouse intake reports 8,500 units received.",
      state: "Open",
      history: [
        {
          timestamp: "2026-09-18T08:00:25Z",
          action: "DETECTED",
          actor: "Contradiction Engine",
          details: "Automated comparison between Delivery Report and Warehouse Report."
        }
      ]
    },
    {
      id: "contra-delivery-warehouse-date",
      claim_a_id: "claim-delivery-qty",
      claim_b_id: "claim-warehouse-qty",
      conflict_type: "Date mismatch",
      severity: "High",
      severity_rationale: "Date mismatch of 3 days (Sept 14 vs Sept 17, >= 3 days threshold) → High",
      explanation: "Delivery report records delivery on Sept 14, whereas Warehouse receipt is logged as Sept 17 (3-day transit latency discrepancy).",
      state: "Open",
      history: [
        {
          timestamp: "2026-09-18T08:00:25Z",
          action: "DETECTED",
          actor: "Contradiction Engine",
          details: "Date delta threshold check: Sept 14 vs Sept 17 = 3 days."
        }
      ]
    },
    {
      id: "contra-contract-warehouse-date",
      claim_a_id: "claim-contract-qty",
      claim_b_id: "claim-warehouse-qty",
      conflict_type: "Date mismatch",
      severity: "High",
      severity_rationale: "Date differs by 2 days (Medium) +1 adjustment for High claim confidence → High",
      explanation: "Contract required delivery by Sept 15; Warehouse received shipment on Sept 17 (2 days late delivery breach).",
      state: "Open",
      history: [
        {
          timestamp: "2026-09-18T08:00:25Z",
          action: "DETECTED",
          actor: "Contradiction Engine",
          details: "Date delta calculation: Sept 15 vs Sept 17 = 2 days (+1 High confidence boost applied)."
        }
      ]
    }
  ],

  activity_log: [
    {
      id: "act-1",
      timestamp: "2026-09-01T09:30:00Z",
      action: "DOCUMENT_UPLOADED",
      actor: "Demo Reviewer",
      details: "Uploaded 'Supplier Contract' (245 KB, PDF). Normalized into 1 page, 4 paragraphs."
    },
    {
      id: "act-2",
      timestamp: "2026-09-14T17:15:00Z",
      action: "DOCUMENT_UPLOADED",
      actor: "Demo Reviewer",
      details: "Uploaded 'Delivery Report' (180 KB, PDF). Normalized into 1 page, 2 paragraphs."
    },
    {
      id: "act-3",
      timestamp: "2026-09-18T08:00:00Z",
      action: "DOCUMENT_UPLOADED",
      actor: "Demo Reviewer",
      details: "Uploaded 'Warehouse Report' (310 KB, PDF). Normalized into 1 page, 3 paragraphs."
    },
    {
      id: "act-4",
      timestamp: "2026-09-18T08:00:25Z",
      action: "CONTRADICTION_DETECTED",
      actor: "System Engine",
      details: "Flagged High-Risk quantity mismatch: Supplier Contract (10,000 units) vs Warehouse Report (8,500 units)."
    },
    {
      id: "act-5",
      timestamp: "2026-09-18T08:00:26Z",
      action: "CONTRADICTION_DETECTED",
      actor: "System Engine",
      details: "Flagged High-Risk date mismatch: Delivery Report (Sept 14) vs Warehouse Report (Sept 17)."
    }
  ],

  saved_reports: [
    {
      id: "rep-demo-1",
      title: "Widget Order #4088 Audit & Intake Discrepancy Report",
      created_at: "2026-09-18T10:00:00Z",
      date_range_start: "2026-09-01",
      date_range_end: "2026-09-18",
      included_doc_ids: ["doc-contract", "doc-delivery", "doc-warehouse", "doc-compliance"],
      claim_count: 5,
      metrics_snapshot: {
        documents_analyzed: 4,
        claims_extracted: 5,
        supported_claims: 1,
        contradicted_claims: 3,
        needs_verification_claims: 1,
        high_risk_issues: 4
      },
      summary_text: "Initial audit of procurement order #4088 reveals critical quantity deficit of 1,500 units between the Supplier Contract / Delivery Manifest (10,000 units) and physical Warehouse receipt tally (8,500 units). Date analysis also confirms intake receipt occurred two days past contractual deadline."
    }
  ]
};
