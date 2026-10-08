# VERITAS AI — Evidence Intelligence for Better Decisions

**Product Specification (Corrected, v2)** — Hackathon MVP

## 1. Overview

VERITAS AI is an Evidence Intelligence platform that extracts factual claims from uploaded documents, maps each claim to traceable source evidence, detects cross-document contradictions (quantity, date, requirement, status, identity mismatches), and routes uncertain or conflicting items to human verification. This hackathon MVP delivers a complete, traceable end-to-end workflow with deterministic, auditable analysis logic: no guessing, no invented evidence.

**Core principle:** Evidence must be traceable to an exact source location in an uploaded document. The app never invents, infers, or places evidence outside the document text.

## 2. Look & Feel

**Layout:** Top header (product name, global search, and a *Reviewer name* field that defaults to "Demo Reviewer"), persistent left navigation with the seven main pages (Dashboard, Documents, Claims, Evidence, Contradictions, Verification, Reports), and a central content canvas. Large context panels use cards and table views; an optional right side panel shows context (selected document/claim summary).

**Responsive behavior:** The layout reflows to a single column on phones. Below the tablet breakpoint, multi-column tables become stacked cards (one card per row, key fields first), side-by-side evidence becomes vertical, and the left navigation collapses to a bottom bar or menu. Touch targets are at least 44×44 px.

**Visual theme:** Enterprise SaaS — neutral slate background, white content cards, subtle shadows, professional sans-serif typography. Primary accent: deep navy.

**Status colors (used identically on every page):**

| Status | Color | Text color | Icon / label |
|---|---|---|---|
| SUPPORTED | Green #1fa463 | White | ✓ SUPPORTED |
| CONTRADICTED | Red #d64545 | White | ✕ CONTRADICTED |
| NEEDS VERIFICATION | Amber #f0a500 | Dark navy (for contrast) | ! NEEDS VERIFICATION |
| REJECTED | Grey #6b7280 | White | ⊘ REJECTED |

Secondary flags: "Needs More Evidence" (slate-blue outline pill), "Unreviewed" (grey outline pill, for candidate claims), "Human-verified" (small check mark on the badge).

**Accessibility:** Color is never the only signal; every badge carries an icon and a text label. Text and background combinations must meet WCAG AA contrast. All controls are keyboard-focusable with visible focus rings.

**UI elements:** Cards, sortable tables, pill/status badges, compact document list tiles with upload date, inline source snippets, and modals for quick edits. Clear hierarchy, readable line lengths, consistent spacing.

**Global search:** Searches document names, tags, claim text, and evidence snippets. Results are grouped by type (Documents / Claims / Evidence) and each result links to its page or anchor. Empty result shows "No matches" with a suggestion to check spelling or upload documents.

## 3. Data Model (user-facing definitions)

The app remembers the following, in plain language.

### 3.1 Documents
Uploaded files with name, tags, upload time, file type, content hash, processing status, and extracted text stored as a **normalized structure**: document → page → numbered paragraph (`para_id`). All anchors point into this normalized text.

### 3.2 Claims
Extracted or manually created factual claims. Each claim has:
- `claim_text`, `claim_type` (category tag), source document, source location
- **Structured fields (extracted by deterministic rules):** `entity`, `metric`, `value`, `unit`, `date`, `status_term` (any may be empty)
- `lifecycle`: Candidate (shown as "Unreviewed"), Active, Merged, or Suppressed (low-confidence candidate hidden by default)
- `confidence`: Low / Med / High, with a visible rationale
- **`auto_verdict`**: SUPPORTED / CONTRADICTED / NEEDS VERIFICATION (computed by the system)
- **`human_decision`**: none / VERIFIED / REJECTED / MORE_EVIDENCE (set only by a reviewer)
- **Displayed status** = the human decision if one exists, otherwise the automated verdict (see 4.5)
- Revision history of edits and verification actions

### 3.3 Evidence links
For each claim, one or more exact snippets quoted from documents. Each snippet stores the document name, page, `para_id`, character start/end offsets within that paragraph, and the quoted text. Evidence is never invented. An evidence item can be **redacted** (excluded from verdict calculation and shown struck-through, but kept for audit) and can carry a free-text annotation.

**Human-readable breadcrumb on every evidence card:** `Document name → Page n → Paragraph p → chars a–b`.

### 3.4 Contradiction records
Pairs of claims flagged as conflicting, with:
- conflict type (Quantity mismatch, Date mismatch, Requirement mismatch, Status conflict, Identity conflict)
- severity (Low / Medium / High / Unknown) and the computed severity rationale
- explanation text
- `state`: Open, Escalated, or Resolved
- history of resolution attempts

### 3.5 Verification actions
Human decisions and notes attached to claims and contradictions. Each action records timestamp, reviewer name, decision, and note.

### 3.6 Activity log
An **append-only (immutable)** log of every automated decision and human action (edit, verification, resolution, merge, redaction, undo). Entries are never edited or deleted; reversals are recorded as new entries.

### 3.7 Reports
Saved analysis summaries built from selected documents and a date range, with a stored snapshot of metrics and the included claim count.

### 3.8 Default and empty states
- No documents: no claims, contradictions, or reports; the user is guided to upload.
- Uploading a document produces new candidate claims and contradictions, or a "no findings" note.
- Manual edits and verification actions update statuses and histories of claims and contradictions.

## 4. Rules & Logic (MVP — deterministic and auditable)

### 4.1 Document ingestion and anchoring
- Supported formats: PDF, DOCX, plain text. **Size limit: 10 MB per file** (larger files show an informative size-limit error).
- On upload, every file is converted to normalized numbered paragraphs. Anchors (page, `para_id`, character offsets) are stored against this normalized text, so the viewer can always open and highlight the exact location.
- If a PDF yields no extractable text (e.g., scanned image), the document is marked **Needs Attention** with the message "Scanned or unreadable PDF — no text could be extracted. Upload a text-based version." Corrupted files show a clear error and a **Retry upload** option.
- **Duplicate detection:** the file's content hash is compared with existing documents. On a match, the user is asked to "Keep both" or "Cancel".

### 4.2 Extraction stub
Runs automatically (asynchronously) on upload.
1. Splits the text into sentences and keeps declarative sentences as **candidate claims**.
2. Assigns a confidence level by simple heuristics:
   - **High:** contains a number, a date, or a recognized entity pattern *and* a metric or status keyword
   - **Med:** contains one of those patterns
   - **Low:** neither, or very short/very long sentence
3. Fills the structured fields (`entity`, `metric`, `value`, `unit`, `date`, `status_term`) with regular expressions plus a small dictionary.
4. Shows the rationale for each confidence level in the claim detail.
5. Low-confidence candidates are **Suppressed** (hidden by default) and available behind the "Candidate claims available" toggle.

Users can accept, edit, or delete candidate claims; **accepting turns a candidate into an Active claim**. Candidates (unreviewed) **do** participate in contradiction detection but are labeled "Unreviewed" everywhere. Suppressed candidates do not participate until accepted.

### 4.3 Contradiction detection

**Normalization.** Before comparison, claims are normalized with a small synonym map, for example:
- *quantity verbs:* delivered = received = shipped = arrived = dispatched
- *requirement verbs:* required = must = needs to = shall
- *status terms:* certified ≠ not certified (negation detection)
- Dates are parsed into ISO format; numbers are parsed with thousands separators removed.

**Comparable claims.** Two claims from **different documents** are comparable only if their normalized `entity` and `metric` family match (for example, "units" for a named order or product). The comparison pass runs after extraction, and again for affected claims after any change (see 4.7).

**Conflict types:**
- **Quantity mismatch:** numeric values differ by more than 5% **or** by more than 100 units.
- **Date mismatch:** dates differ for the same event or deadline (e.g., required vs. actual).
- **Requirement mismatch:** requirements oppose each other (e.g., "required by Sept 15" vs. "must be delayed").
- **Status conflict:** opposing status terms (e.g., "certified" vs. "not certified").
- **Identity conflict:** the same identifier or role is linked to different entities (e.g., the same order number tied to different suppliers).

### 4.4 Severity formula

Severity is computed from magnitude, then adjusted:

| Conflict type | Low | Medium | High |
|---|---|---|---|
| Quantity mismatch (relative difference) | under 5% (flagged only because of the 100-unit rule) | 5% to 10% | over 10% |
| Date mismatch (difference in days) | 1 day | 2 days | 3 days or more |
| Requirement / Status / Identity conflict | paraphrase-level wording difference | possible conflict with explainable context | direct logical opposite |

**Adjustments (applied in order, capped at High):**
1. +1 level if either underlying claim has High confidence.
2. +1 level if the same fact is contradicted by two or more other documents.
3. −1 level (minimum Low) if both claims have Low confidence.

**Unknown:** only when a required field (value, date, or negation) is missing and magnitude cannot be computed. Unknown contradictions are automatically sent to the Verification queue.

Every severity shows its rationale (e.g., "Quantity differs by 15% (10,000 vs 8,500) → High").

**Severity actions:**

| Severity | Meaning | App action |
|---|---|---|
| High | Clear, material conflict across reliable snippets | Appears atop the High-Risk list and requires verification |
| Medium | Noticeable but possibly explainable discrepancy | Visually flagged; recommended for review |
| Low | Minor or paraphrase-level difference | Shown in Contradictions at low priority |
| Unknown | Insufficient context to score | Auto-sent to Verification queue |

### 4.5 Verdict rules (single precedence order)

The displayed status is determined by checking these rules **top to bottom; the first match wins**:

1. **Human decision exists** → show it: VERIFIED displays as SUPPORTED (with the "Human-verified" mark), REJECTED displays as REJECTED, MORE_EVIDENCE displays as NEEDS VERIFICATION with the "Needs More Evidence" flag.
2. **No (non-redacted) evidence, or confidence is Low, or an open contradiction with Unknown severity exists, or a reviewer requested verification** → NEEDS VERIFICATION.
3. **At least one open contradiction with Medium or High severity against a claim from a different document** → CONTRADICTED.
4. **Otherwise, with one or more evidence snippets** → SUPPORTED.

A contradiction that is Resolved, or a Low-severity contradiction, does not change the verdict. Automated verdicts are always recomputed; human decisions are never overwritten.

### 4.6 Claim status transitions

| From | To | Allowed by |
|---|---|---|
| Candidate | SUPPORTED | User accepts (and rule 4.5 yields SUPPORTED), or reviewer verifies |
| Candidate | NEEDS VERIFICATION | System flags low confidence, or user requests verification |
| SUPPORTED | CONTRADICTED | System detects an open Medium/High contradiction, or reviewer marks contradictory |
| CONTRADICTED | SUPPORTED / NEEDS VERIFICATION | Contradiction resolved, edited away, or underlying claim changed (system recompute) |
| NEEDS VERIFICATION | SUPPORTED (VERIFIED) | Human reviewer marks VERIFIED with evidence |
| NEEDS VERIFICATION | NEEDS VERIFICATION + "Needs More Evidence" flag | Reviewer marks REQUIRES MORE EVIDENCE |
| ANY | REJECTED | Human reviewer marks REJECTED |

A later reviewer action can supersede an earlier one, but the earlier entries stay in the log.

### 4.7 Recompute rules
- **Claim edited:** re-extract structured fields, re-run the comparison pass for that claim only, and recompute its verdict. Any contradiction that involved the claim and was Resolved is reopened if the compared values changed.
- **Document deleted:** its claims are marked Merged/Removed in history, their evidence is detached, and every contradiction that involved them is closed with the reason "source document removed". Affected counterpart claims are recomputed.
- **Evidence attached, redacted, or detached:** recompute the claim's verdict.
- **Human decisions are never overwritten** by recompute.

### 4.8 Dashboard metric definitions
- **Documents Analyzed:** documents with extraction complete.
- **Claims Extracted:** all Active and Candidate claims, excluding Suppressed, Merged, and REJECTED. (Count of rejected claims appears as a small caption under the card.)
- **Supported / Contradicted / Claims Needing Verification:** counts by displayed status. **Supported + Contradicted + Needs Verification = Claims Extracted** at all times.
- **High-Risk Issues:** contradictions that are Open or Escalated with severity High or Unknown. Sorted High first, then Unknown, then by confidence.

## 5. Primary Pages & Features

### 5.1 Dashboard
**What the user does:** Lands here for a high-level view.

**What the product does:** Presents six metric cards and a prioritized "High-Risk Issues" list.
- **Metric cards (top row):** Documents Analyzed, Claims Extracted, Supported Claims, Contradicted Claims, Claims Needing Verification, High-Risk Issues. Each shows a numeric total (definitions in 4.8).
- **High-Risk Issues card:** opens a table of top contradictions sorted by severity. Each row: truncated Claim A text, Source A name, truncated Claim B text, Source B name, Severity badge, and an "Open" action.
- **Recent activity feed** below: uploads, manual verifications, resolutions, and merges (taken from the activity log).
- **Empty state:** If there are no documents, cards show zero and a prominent "Upload first document" CTA that links to the Documents page. The High-Risk list is replaced by upload guidance.
- **Failure path:** If metrics cannot be computed (temporary processing queue), show "Processing…" placeholders and a refresh action.

### 5.2 Documents
**Purpose:** Upload, preview, and manage business documents.

**User actions:**
- **Upload:** drag-and-drop area and an "Upload file" button (PDF, DOCX, plain text; 10 MB limit). After upload the user may enter a Document Name and optional Tags.
- **Document list:** table with columns Name, Type, Upload Date, Processing Status. Selecting a document opens a preview or detail panel.
- **Delete document:** removes it after confirmation, applying the recompute rules in 4.7.

**Product response:**
- On upload: store the file, run extraction automatically (asynchronously), and show a progress card with stages **Uploaded → Extraction in progress → Extraction complete** (or **Needs Attention**).
- **Document detail panel:** file metadata, extracted claim count, and a link to the highlighted text viewer.

**Document preview:**
- Inline viewer with text selection. It highlights the exact source location for every linked claim and lets the user manually select additional evidence (highlight text → "Create/Attach Claim").
- Manually created claims and attached snippets use the same anchoring as extracted ones.

**States:**
- **Empty:** instructions and an upload CTA.
- **Invalid or failed upload:** a clear error (unsupported format, corrupted file, scanned/unreadable PDF, or size limit exceeded) with a retry option.
- **Heavy documents:** show "Processing…" without blocking the UI.

### 5.3 Claims
**Purpose:** Centralized list of extracted factual claims with core metadata and actions to edit, merge, or reclassify.

**List view columns:** Claim text (clickable), Source document (link), Source location (page/paragraph), Claim type (category tag), Status badge (SUPPORTED / CONTRADICTED / NEEDS VERIFICATION / REJECTED, plus "Unreviewed" for candidates), Confidence (Low/Med/High), Actions (View Evidence, Edit, Flag for Verification). Sorting and filtering by status, type, confidence, and document.

**Merge claims:** the user selects two or more claims and chooses "Merge". They pick a primary claim; the primary keeps its text, the evidence of all merged claims is combined under it, and the others become Merged (hidden from lists and metrics, but kept in history). A merge is logged and can be reversed through the activity history. Contradictions are recomputed after a merge.

**Claim detail view:**
- Full claim text and structured fields
- All linked evidence snippets (quoted text and breadcrumb to exact location)
- History of automated decisions and human actions
- Confidence score rationale
- An "Investigate" button that opens Claim Investigation

**Edit inline:** the user can correct the claim text, change the type, or reassign supporting snippets. Editing creates a revision entry and triggers recompute (4.7).

**Empty state:** No claims yet — instruct the user to upload documents. If extraction produced suppressed low-confidence candidates, show a "Candidate claims available" toggle to review and accept them.

**Failure paths:** If extraction fails for a document, the Claims list shows a per-document warning with a "Run Extraction" retry or a link to review the document manually.

### 5.4 Claim Investigation
**Purpose:** Deep dive into a single claim, its evidence, contradictions, and recommended verdict.

**Entry point:** From the Claims list, clicking "Investigate".

**Screen composition:**
- **Claim header:** full claim text, type, source document, source location.
- **Verdict summary:** current status badge and confidence (Low/Med/High), with the rule from 4.5 that produced the verdict.
- **Supporting evidence:** all linked evidence snippets, each with quoted text, document name, exact location (page/paragraph), and a "View in document" link.
- **Conflicting evidence:** if contradictions exist, side-by-side conflicting claims from other documents with their evidence snippets.
- **Explanation:** auto-generated rationale (e.g., "Quantity mismatch detected: Claim A states 10,000 units; Claim B states 8,500 units received.").
- **Recommendation:** suggested next steps (e.g., "Human verification recommended due to date conflict").
- **Action:** "Request Verification" moves the claim to the Verification queue; the user may add a note.
- **Empty state:** If there are no contradictions, the conflicting evidence section shows "No conflicts detected."

### 5.5 Evidence
**Purpose:** For any selected claim, present the precise source evidence that justifies it.

**Entry points:** From the Claims list, document preview, or Claim Investigation.

**Evidence view composition:**
- **Left column:** claim summary (text, status badge, confidence).
- **Middle:** source evidence card(s). Each card: source document name, exact location, quoted snippet with context lines, and a "View in document" link that opens the viewer at that anchor.
- **Right:** "Related claims" panel showing claims that reference the same snippet or nearby text (same page and within a few paragraphs).

**User actions:**
- Attach additional snippets (highlight in the document viewer → "Attach to claim").
- Redact a snippet if irrelevant (excluded from verdict logic, kept for audit).
- Add a free-text annotation to an evidence item.

**Traceability guarantee:** Every evidence card shows the breadcrumb Document name → Page/Section → Paragraph anchor and character range. The UI prevents detaching or redacting the last evidence of a claim without a verification action: if the user continues, the claim is set to NEEDS VERIFICATION and a verification note is required.

**Empty state:** If a claim has no evidence, the view shows a warning badge "No linked evidence — mark for verification" and a single "Flag for Verification" button.

**Rule:** Evidence must be traceable to exact source location. The app never invents, infers, or places evidence outside the document text.

### 5.6 Contradictions
**Purpose:** Surface and explain cross-document conflicts between claims.

**What the product shows:** A paginated table of contradiction records. Each row: Claim A (text preview), Source A, Claim B, Source B, Conflict type, Severity (Low / Med / High / Unknown), Explanation (short auto-generated rationale), and State (Open / Escalated / Resolved). Filters by type, severity, and state.

**Contradiction detail modal** (opened by clicking a row): side-by-side evidence snippets, timeline/context, severity rationale, and next-step actions:
- **Mark Contradiction as Resolved:** requires a note. The contradiction stops influencing verdicts but remains in the log and can be reopened.
- **Escalate to Verification:** sets the state to Escalated and adds it to the Contradictions queue in Verification.
- **Merge claims:** merges the two claims as described in 5.3 (for duplicates or paraphrases), then recomputes.

**How contradictions are created:** The comparison pass runs after extraction and after relevant changes. A candidate contradiction is created when two comparable claims differ beyond the thresholds in 4.3–4.4.

**Empty state:** "No contradictions detected" with guidance to upload contradictory documents or manually create a comparison (select two claims → "Compare").

**Failure path:** If severity cannot be scored (insufficient context), the contradiction is created with Severity = Unknown and placed in the Verification queue automatically.

### 5.7 Verification
**Purpose:** Human reviewers resolve uncertain claims and contradictions.

**Queue interface:** Two tabs — **Claims Needing Verification** and **Contradictions Needing Verification**. Each item shows the claim(s), linked evidence, confidence, and a brief explanation of why verification is required.

**Reviewer actions per claim:**
- **Mark as VERIFIED:** the claim is confirmed as SUPPORTED. The app records an audit entry (timestamp, reviewer name, note) and removes the item from the queue.
- **Mark as REJECTED:** the claim is flagged REJECTED (grey badge). Evidence stays attached for audit. The item leaves the queue.
- **Mark as REQUIRES MORE EVIDENCE:** the claim stays active with a "Needs More Evidence" flag. **This is the only action that keeps the item in the queue.**

**Reviewer actions per contradiction:** Mark Resolved (with note), Confirm conflict (keeps it Open with the reviewer's note and sets the affected claims' verdicts accordingly), or Requires more evidence (stays in the queue).

**UI behavior:**
- After VERIFIED or REJECTED, the item is removed from the queue and a success toast appears with "Undo" for **10 seconds**.
- **Undo** appends a reversal entry to the log and restores the previous status; no entry is ever deleted, so the audit trail stays immutable.
- All verification actions add notes visible in the claim history. A permanent audit card shows actions, timestamps, and reviewer names.
- Reviewer identity comes from the header "Reviewer name" field (default "Demo Reviewer"); the MVP has no authentication.

**Note:** Verification decisions are separate from automated verdicts (`human_decision` vs `auto_verdict`). Human decisions override automated verdicts but remain fully auditable.

**Empty state:** No items in the queue → recommended next steps, and suggestions to upload documents or run extraction.

**Invalid action:** Verifying or rejecting without any attached evidence prompts a mandatory confirmation: "There is no attached evidence — do you still want to VERIFY/REJECT?"

### 5.8 Reports
**Purpose:** Generate an evidence-based summary of the analysis for review and export.

**Report composition:**
- Header with title, date range (selectable), and documents included.
- Summary metrics (same definitions as the Dashboard), then three sections: **Supported claims** (sample list), **Contradictions** (prioritized by severity), and **Verification actions** (log of human verifications).
- For each claim in the report: claim text, status badge, source(s) with snippets, and confidence.

**User actions:**
- Build a report (select documents and date range), preview it, and click "Generate Report", which creates a document stored in the Reports list.
- **Download format:** PDF, generated from the print-styled in-app report. Reports can also be opened in the app.
- Each saved report shows its included claim count and a **Recompute** option that refreshes the metrics from current data (a new snapshot; the previous snapshot stays in the report history).

**Empty state:** No reports yet → "Create first report" CTA.

## 6. User Flows

1. **Upload → Auto-analyze:** The user uploads files on the Documents page. The app stores them, runs the extraction stub, and shows progress. On completion, candidate claims appear in the Claims list with confidence labels, and contradictions appear if found.
2. **Review claim → Investigate → Verify:** The user opens a claim, clicks "Investigate" to see evidence and contradictions, reviews the verdict recommendation, and either accepts it or clicks "Request Verification".
3. **Detect contradiction → Resolve:** The system lists contradictions with type and severity. The user opens one, reads the side-by-side evidence, then chooses "Escalate to Verification", "Mark Contradiction as Resolved", or "Merge claims".
4. **Verification handling:** The reviewer opens the queue, inspects an item, reviews evidence and explanation, chooses VERIFIED / REJECTED / REQUIRES MORE EVIDENCE, adds a note, and confirms. Statuses update and the Dashboard reflects changes instantly.
5. **Dashboard and Reporting:** The user views the Dashboard, selects a date range and documents, generates a Report, and downloads it or opens it in the app.

## 7. Auditability & Traceability
- Every claim and contradiction displays exact evidence snippets with a human-readable source anchor.
- All automated decisions include the rationale used (confidence heuristics, severity formula, verdict rule number).
- Every human action (edit, verification, resolution, merge, redaction, undo) is recorded in the append-only activity log attached to the claim, contradiction, or report.

## 8. Non-functional & Constraints (MVP)
- No authentication, payments, social features, or external integrations. (Reviewer name is a free-text field.)
- No advanced third-party AI: analysis uses deterministic, auditable extraction and comparison stubs. The UI and data model are built so future AI components can replace or augment the stubs without changing the visible artifacts.
- All processing and file storage happen inside the app instance (platform-provided storage); no external APIs are required.
- **Performance:** extraction runs asynchronously, users see progress, and heavy documents show a "Processing…" state without blocking the UI.
- **Limits:** 10 MB per file; supported formats PDF, DOCX, plain text; duplicates detected by content hash.
- **Responsive and accessible:** see Section 2.

## 9. Pre-loaded Demo Case

The app ships with this example as pre-loaded data so judges immediately see contradiction detection and the verification flow:

| Document | Key claim |
|---|---|
| Supplier Contract | 10,000 units required by Sept 15 |
| Delivery Report | 10,000 units delivered Sept 14 |
| Warehouse Report | 8,500 units received Sept 17 |
| Compliance Certificate | ISO 9001 |

**Expected results under the rules above:**

| Comparison | Conflict type | Severity (with rationale) | Outcome |
|---|---|---|---|
| Contract 10,000 required vs Warehouse 8,500 received | Quantity mismatch | High (15% > 10%) | Both claims CONTRADICTED; appears in High-Risk list |
| Delivery 10,000 delivered vs Warehouse 8,500 received | Quantity mismatch | High (15% > 10%) | Delivery claim CONTRADICTED |
| Delivery Sept 14 vs Warehouse Sept 17 | Date mismatch | High (3 days) | Escalated to verification recommended |
| Contract Sept 15 required vs Warehouse Sept 17 received | Date mismatch | Medium (2 days) +1 for High confidence → High | Warehouse date claim CONTRADICTED |
| Contract 10,000 required vs Delivery 10,000 delivered | none | — | No conflict |
| Compliance Certificate: ISO 9001 | none | — | SUPPORTED (shows a mix of statuses) |

The demo recommends human verification, and judges can walk through Investigate → Request Verification → VERIFIED/REJECTED → Undo → Dashboard update → Report.

## 10. Implementation Notes for the Builder
- Every claim list item links to its exact evidence snippet, and the document viewer opens at that anchor.
- Keep status badges and colors consistent across all pages (Section 2), with icon and text label on every badge.
- Store `auto_verdict` and `human_decision` as separate fields; compute the displayed status with the single precedence order in 4.5.
- Provide a 10-second undo for verification actions, implemented as reversal log entries, plus a full audit trail for every item.
- Give every empty state a clear next step so new users get value within minutes (upload → review → verify).
- Preserve the principle: evidence must be traceable to an exact source location. Never invent, infer, or assign evidence outside uploaded documents.
- Build the demo case as pre-loaded data.

## Appendix: What was corrected from v1

| Area | Problem in v1 | Correction in v2 |
|---|---|---|
| Status model | VERIFIED / REJECTED overlapped with verdicts; REJECTED had no color | Separate `auto_verdict` and `human_decision`; grey REJECTED badge |
| Verdict rules | Medium contradictions fit no rule; table said High only | One top-to-bottom precedence order (4.5) |
| Comparison logic | "Same subject area" undefined | Claim schema, synonym map, comparable-claim rule (4.2–4.3) |
| Severity | No formula | Threshold table plus adjustments; demo yields High |
| Verification | REQUIRES MORE EVIDENCE vs removal from queue; immutable log vs Undo; reviewer identity vs no auth | Clarified queue behavior, reversal-based Undo, reviewer name field |
| Resolve / Merge | No defined effects | Defined in 5.3 and 5.6 |
| Anchoring | PDF/DOCX fragile | Normalized paragraphs and offset anchors, scanned-PDF error |
| Candidates | Unclear role in detection | Included and labeled "Unreviewed" |
| Recompute | Missing | Defined (4.7) |
| Metrics | Undefined | Definitions and invariant (4.8) |
| Mobile / accessibility | Tables, contrast, color-only badges | Stacked cards, dark text on amber, icons and labels |
| Gaps | Size limit, duplicates, report format, demo outcomes | Specified (4.1, 5.8, Section 9) |
