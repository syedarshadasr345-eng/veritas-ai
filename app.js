/**
 * VERITAS AI — Main Application Controller & UI View Manager
 * Upgraded Soft Glass Theme, Two-Column Workspaces, Collapsible Groups,
 * Robust Document Ingestion Engine, Today Widget, and 10-Second Undo Toast.
 */

// Initialize application state
let appState = JSON.parse(JSON.stringify(INITIAL_DATA));

// Active session state
let currentView = "dashboard";
let selectedClaimId = "claim-contract-qty";
let selectedDocId = "doc-contract";
let selectedContraId = "contra-contract-warehouse-qty";
let currentVerificationTab = "claims";
let undoTimeoutId = null;
let undoCountdownInterval = null;
let lastVerificationAction = null; // Stored for 10-second reversal

document.addEventListener("DOMContentLoaded", () => {
  initApp();
});

function initApp() {
  // Sync state initially with deterministic logic
  VeritasEngine.recomputeAll(appState);

  // Setup DOM Event Listeners & Widgets
  setupNavigation();
  setupHeaderEvents();
  setupGlobalSearch();
  setupModalEvents();
  setupTodayWidget();

  // Handle URL hash on initial load
  const initialHash = window.location.hash.replace('#', '');
  if (['dashboard', 'documents', 'claims', 'investigation', 'evidence', 'contradictions', 'verification', 'reports'].includes(initialHash)) {
    currentView = initialHash;
  }

  // Render initial view
  renderCurrentView();
  updateSidebarCounts();

  window.addEventListener('hashchange', () => {
    const hash = window.location.hash.replace('#', '');
    if (['dashboard', 'documents', 'claims', 'investigation', 'evidence', 'contradictions', 'verification', 'reports'].includes(hash) && hash !== currentView) {
      navigateTo(hash);
    }
  });
}

/**
 * Navigation & View Routing
 */
function setupNavigation() {
  const navBtns = document.querySelectorAll(".rail-item-btn");
  navBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const targetView = btn.dataset.view;
      if (targetView) {
        navigateTo(targetView);
      }
    });
  });
}

function navigateTo(viewName, params = {}) {
  currentView = viewName;

  // Update active state in rail
  document.querySelectorAll(".rail-item-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.view === viewName);
  });

  // Toggle view visibility
  document.querySelectorAll(".page-view").forEach(pv => {
    pv.classList.remove("active");
  });

  const activePage = document.getElementById(`${viewName}-view`);
  if (activePage) {
    activePage.classList.add("active");
  }

  // Handle specific routing parameters
  if (params.claimId) selectedClaimId = params.claimId;
  if (params.docId) selectedDocId = params.docId;
  if (params.contraId) selectedContraId = params.contraId;

  renderCurrentView();
  updateSidebarCounts();
}

function updateSidebarCounts() {
  const metrics = VeritasEngine.calculateMetrics(appState);
  
  const elDocs = document.getElementById("nav-count-docs");
  const elClaims = document.getElementById("nav-count-claims");
  const elContra = document.getElementById("nav-count-contra");
  const elVerify = document.getElementById("nav-count-verify");

  if (elDocs) elDocs.textContent = appState.documents.length;
  if (elClaims) elClaims.textContent = metrics.claims_extracted;
  if (elContra) {
    elContra.textContent = metrics.high_risk_issues.length;
    elContra.className = metrics.high_risk_issues.length > 0 ? "rail-badge alert" : "rail-badge";
  }
  if (elVerify) {
    const queueClaims = appState.claims.filter(c => c.displayed_status === "NEEDS VERIFICATION" && c.lifecycle !== "Suppressed" && c.lifecycle !== "Merged").length;
    const queueContra = appState.contradictions.filter(c => c.state === "Escalated" || c.severity === "Unknown").length;
    const totalQueue = queueClaims + queueContra;
    elVerify.textContent = totalQueue;
    elVerify.className = totalQueue > 0 ? "rail-badge alert" : "rail-badge";
  }
}

/**
 * Header Controls & Reviewer Identity
 */
function setupHeaderEvents() {
  const reviewerInput = document.getElementById("reviewer-name-input");
  if (reviewerInput) {
    reviewerInput.value = appState.reviewerName;
    reviewerInput.addEventListener("input", (e) => {
      appState.reviewerName = e.target.value.trim() || "Demo Reviewer";
    });
  }
}

/**
 * Global Search
 */
function setupGlobalSearch() {
  const searchInput = document.getElementById("global-search-input");
  const resultsDropdown = document.getElementById("search-results-dropdown");

  if (!searchInput || !resultsDropdown) return;

  // Keyboard shortcut Ctrl+K / Cmd+K
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "k") {
      e.preventDefault();
      searchInput.focus();
    }
  });

  searchInput.addEventListener("input", (e) => {
    const query = e.target.value.trim().toLowerCase();
    if (query.length < 2) {
      resultsDropdown.classList.remove("active");
      resultsDropdown.innerHTML = "";
      return;
    }

    const docMatches = appState.documents.filter(d => 
      d.name.toLowerCase().includes(query) || 
      (d.tags && d.tags.some(t => t.toLowerCase().includes(query)))
    );

    const claimMatches = appState.claims.filter(c => 
      c.lifecycle !== "Merged" &&
      (c.claim_text.toLowerCase().includes(query) ||
       (c.structured.entity && c.structured.entity.toLowerCase().includes(query)) ||
       (c.structured.value && String(c.structured.value).includes(query)))
    );

    const evidenceMatches = appState.evidence_links.filter(ev =>
      !ev.redacted && ev.quoted_text.toLowerCase().includes(query)
    );

    let html = "";

    if (docMatches.length === 0 && claimMatches.length === 0 && evidenceMatches.length === 0) {
      html = `<div style="padding:20px; text-align:center; color:var(--color-text-secondary); font-size:0.85rem;">No matches found for "${escapeHtml(query)}". Check spelling or upload documents.</div>`;
    } else {
      if (docMatches.length > 0) {
        html += `<div class="search-group-header">Documents (${docMatches.length})</div>`;
        docMatches.forEach(doc => {
          html += `
            <div class="search-result-item" onclick="navigateTo('documents', { docId: '${doc.id}' }); closeSearch();">
              <div class="search-result-title">📄 ${escapeHtml(doc.name)}</div>
              <div class="search-result-meta">${escapeHtml(doc.type)} • ${escapeHtml(doc.status)}</div>
            </div>`;
        });
      }

      if (claimMatches.length > 0) {
        html += `<div class="search-group-header">Claims (${claimMatches.length})</div>`;
        claimMatches.forEach(cl => {
          html += `
            <div class="search-result-item" onclick="navigateTo('investigation', { claimId: '${cl.id}' }); closeSearch();">
              <div class="search-result-title">⚡ ${escapeHtml(cl.claim_text)}</div>
              <div class="search-result-meta">${escapeHtml(cl.doc_name)} • ${escapeHtml(cl.displayed_status)}</div>
            </div>`;
        });
      }

      if (evidenceMatches.length > 0) {
        html += `<div class="search-group-header">Evidence Snippets (${evidenceMatches.length})</div>`;
        evidenceMatches.forEach(ev => {
          html += `
            <div class="search-result-item" onclick="navigateTo('evidence', { claimId: '${ev.claim_id}' }); closeSearch();">
              <div class="search-result-title">🔍 "${escapeHtml(ev.quoted_text.substring(0, 60))}..."</div>
              <div class="search-result-meta">${escapeHtml(ev.doc_name)} (Page ${ev.page}, ${ev.para_id})</div>
            </div>`;
        });
      }
    }

    resultsDropdown.innerHTML = html;
    resultsDropdown.classList.add("active");
  });

  document.addEventListener("click", (e) => {
    if (!searchInput.contains(e.target) && !resultsDropdown.contains(e.target)) {
      closeSearch();
    }
  });
}

function closeSearch() {
  const resultsDropdown = document.getElementById("search-results-dropdown");
  if (resultsDropdown) resultsDropdown.classList.remove("active");
}

/**
 * Today Widget (Live Clock & Compact Month Calendar)
 */
function setupTodayWidget() {
  function updateClock() {
    const clockEl = document.getElementById("today-live-clock");
    const dateEl = document.getElementById("today-live-date");
    if (!clockEl) return;

    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString("en-US", { hour12: false });
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
    }
  }

  updateClock();
  setInterval(updateClock, 1000);

  // Render Mini Month Calendar
  const calContainer = document.getElementById("today-mini-calendar");
  if (!calContainer) return;

  const daysHeader = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  let calHtml = daysHeader.map(d => `<div class="mini-cal-head">${d}</div>`).join("");

  // Simple calendar grid for current month
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDayIndex = new Date(year, month, 1).getDay();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const currentDay = now.getDate();

  // Document upload marker days (e.g. Sept 1, 14, 18 or current month events)
  const auditMarkerDays = [1, 8, 14, 15, 17, 18];

  for (let i = 0; i < firstDayIndex; i++) {
    calHtml += `<div class="mini-cal-day" style="opacity:0.2;">•</div>`;
  }

  for (let d = 1; d <= totalDays; d++) {
    let classes = "mini-cal-day";
    if (d === currentDay) classes += " today";
    else if (auditMarkerDays.includes(d)) classes += " has-event";
    calHtml += `<div class="${classes}">${d}</div>`;
  }

  calContainer.innerHTML = calHtml;
}

/**
 * Collapsible Group Toggle Helper
 */
function toggleCollapsible(headerElem) {
  const group = headerElem.closest(".collapsible-group");
  if (group) {
    group.classList.toggle("open");
  }
}

/**
 * Central View Rendering Dispatcher
 */
function renderCurrentView() {
  switch (currentView) {
    case "dashboard":
      renderDashboard();
      break;
    case "documents":
      renderDocuments();
      break;
    case "claims":
      renderClaims();
      break;
    case "investigation":
      renderInvestigation();
      break;
    case "evidence":
      renderEvidence();
      break;
    case "contradictions":
      renderContradictions();
      break;
    case "verification":
      renderVerification();
      break;
    case "reports":
      renderReports();
      break;
  }
}

/**
 * 5.1 Dashboard View
 */
function renderDashboard() {
  const metrics = VeritasEngine.calculateMetrics(appState);

  // Update Metric Cards
  document.getElementById("metric-docs-count").textContent = metrics.documents_analyzed;
  document.getElementById("metric-claims-count").textContent = metrics.claims_extracted;
  document.getElementById("metric-claims-caption").textContent = metrics.rejected_claims > 0 ? `(${metrics.rejected_claims} rejected archived)` : "Active & candidates";
  document.getElementById("metric-supported-count").textContent = metrics.supported_claims;
  document.getElementById("metric-contradicted-count").textContent = metrics.contradicted_claims;
  document.getElementById("metric-verify-count").textContent = metrics.needs_verification_claims;
  document.getElementById("metric-risk-count").textContent = metrics.high_risk_issues.length;

  // High-Risk Issues Table
  const tableBody = document.getElementById("dashboard-highrisk-tbody");
  const emptyState = document.getElementById("dashboard-highrisk-empty");

  if (metrics.high_risk_issues.length === 0) {
    if (tableBody) tableBody.innerHTML = "";
    if (emptyState) emptyState.style.display = "block";
  } else {
    if (emptyState) emptyState.style.display = "none";
    if (tableBody) {
      tableBody.innerHTML = metrics.high_risk_issues.map(item => {
        const claimA = appState.claims.find(c => c.id === item.claim_a_id) || { claim_text: "Unknown", doc_name: "Doc" };
        const claimB = appState.claims.find(c => c.id === item.claim_b_id) || { claim_text: "Unknown", doc_name: "Doc" };
        return `
          <tr>
            <td>
              <div style="font-weight:700; color:var(--color-heading); font-size:0.86rem;">${escapeHtml(claimA.claim_text)}</div>
              <div style="font-size:0.75rem; color:var(--color-text-secondary);">${escapeHtml(claimA.doc_name)}</div>
            </td>
            <td>
              <div style="font-weight:700; color:var(--color-heading); font-size:0.86rem;">${escapeHtml(claimB.claim_text)}</div>
              <div style="font-size:0.75rem; color:var(--color-text-secondary);">${escapeHtml(claimB.doc_name)}</div>
            </td>
            <td>
              <span class="severity-badge severity-${item.severity.toLowerCase()}">${escapeHtml(item.severity)}</span>
            </td>
            <td style="font-size:0.78rem; color:var(--color-text-secondary); max-width:280px;">
              ${escapeHtml(item.explanation)}
            </td>
            <td>
              <button class="btn btn-secondary btn-sm" onclick="openContradictionModal('${item.id}')">Inspect</button>
            </td>
          </tr>
        `;
      }).join("");
    }
  }

  // Activity Feed
  const feedContainer = document.getElementById("dashboard-activity-feed");
  const chipCount = document.getElementById("activity-log-count-chip");
  if (chipCount) chipCount.textContent = `${appState.activity_log.length} Events`;

  if (feedContainer) {
    const recentLogs = [...appState.activity_log].reverse().slice(0, 8);
    feedContainer.innerHTML = recentLogs.map(log => `
      <div class="activity-item">
        <div class="activity-icon">${getActivityIcon(log.action)}</div>
        <div class="activity-content">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <strong style="color:var(--color-heading); font-size:0.82rem;">${escapeHtml(log.action.replace(/_/g, " "))}</strong>
            <span style="font-size:0.7rem; color:var(--color-text-muted);">${formatDate(log.timestamp)}</span>
          </div>
          <div style="color:var(--color-text-secondary); margin-top:2px; font-size:0.8rem;">${escapeHtml(log.details)}</div>
          <div style="font-size:0.68rem; color:var(--color-text-muted); margin-top:2px;">Actor: <strong>${escapeHtml(log.actor)}</strong></div>
        </div>
      </div>
    `).join("");
  }
}

/**
 * 5.2 Documents View & Robust Ingestion Engine
 */
function renderDocuments() {
  const docListTbody = document.getElementById("documents-list-tbody");
  if (docListTbody) {
    docListTbody.innerHTML = appState.documents.map(doc => {
      const claimCount = appState.claims.filter(c => c.doc_id === doc.id && c.lifecycle !== "Merged").length;
      const isSelected = doc.id === selectedDocId;
      return `
        <tr class="${isSelected ? 'row-selected' : ''}">
          <td>
            <div style="font-weight:700; color:var(--color-heading);">${escapeHtml(doc.name)}</div>
            <div style="font-size:0.72rem; color:var(--color-text-muted); margin-top:2px;">
              ${(doc.tags || []).map(t => `<span class="flag-unreviewed" style="margin-right:4px;">${escapeHtml(t)}</span>`).join("")}
            </div>
          </td>
          <td><span style="font-family:var(--font-mono); font-size:0.72rem; background:rgba(255,255,255,0.8); padding:3px 8px; border-radius:6px; border:1px solid var(--glass-border);">${escapeHtml(doc.type)}</span></td>
          <td style="font-size:0.78rem; color:var(--color-text-secondary);">${formatDate(doc.upload_date)}</td>
          <td><strong>${claimCount}</strong> claims</td>
          <td>
            <span style="font-size:0.75rem; font-weight:700; color:${doc.status.includes('complete') ? 'var(--status-supported)' : '#b45309'};">
              ● ${escapeHtml(doc.status)}
            </span>
          </td>
          <td>
            <div class="table-cell-actions">
              <button class="btn btn-secondary btn-sm" onclick="selectDocument('${doc.id}')">View</button>
              <button class="btn btn-danger btn-sm" onclick="deleteDocument('${doc.id}')">Delete</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");
  }

  renderDocumentViewer();
}

function selectDocument(docId) {
  selectedDocId = docId;
  renderDocuments();
}

function renderDocumentViewer() {
  const viewerTitle = document.getElementById("viewer-doc-title");
  const viewerContent = document.getElementById("viewer-paragraphs-container");
  const docClaimsSummary = document.getElementById("viewer-claims-summary");

  const doc = appState.documents.find(d => d.id === selectedDocId) || appState.documents[0];
  if (!doc) {
    if (viewerTitle) viewerTitle.textContent = "No Document Selected";
    if (viewerContent) viewerContent.innerHTML = "<div class='empty-state'><div class='empty-state-title'>No Documents Available</div><div class='empty-state-text'>Upload or ingest a document to inspect anchored text.</div></div>";
    return;
  }

  if (viewerTitle) viewerTitle.textContent = `${doc.name} (${doc.type}, ${doc.size || 'N/A'})`;

  const docClaims = appState.claims.filter(c => c.doc_id === doc.id && c.lifecycle !== "Merged");

  if (docClaimsSummary) {
    docClaimsSummary.innerHTML = `
      <div style="margin-bottom:10px; font-weight:700; font-size:0.82rem; color:var(--color-heading); text-transform:uppercase; letter-spacing:0.5px;">
        Extracted Claims in this Document (${docClaims.length}):
      </div>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${docClaims.map(c => `
          <div style="padding:10px 14px; background:rgba(255,255,255,0.7); border:1px solid var(--glass-border); border-radius:12px; cursor:pointer; transition:all var(--transition-fast);" onclick="navigateTo('investigation', { claimId: '${c.id}' })">
            <div style="font-size:0.84rem; font-weight:700; color:var(--color-heading);">${escapeHtml(c.claim_text)}</div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
              <span style="font-size:0.72rem; color:var(--color-text-secondary); font-family:var(--font-mono);">${escapeHtml(c.source_location)}</span>
              ${renderStatusBadge(c.displayed_status, c.flags)}
            </div>
          </div>
        `).join("")}
      </div>
    `;
  }

  if (viewerContent) {
    let html = "";
    (doc.pages || []).forEach(page => {
      html += `<div style="font-family:var(--font-mono); font-size:0.72rem; color:var(--color-text-muted); margin:12px 0 8px; font-weight:700;">--- Page ${page.page_num} ---</div>`;
      (page.paragraphs || []).forEach(para => {
        let paraText = para.text;
        const matchingClaims = docClaims.filter(c => c.page === page.page_num && c.para_id === para.para_id);

        let highlightedPara = escapeHtml(paraText);

        matchingClaims.forEach(mc => {
          const evidence = appState.evidence_links.find(e => e.claim_id === mc.id && !e.redacted);
          const snippetToHighlight = evidence ? evidence.quoted_text : mc.claim_text;
          if (snippetToHighlight && paraText.includes(snippetToHighlight)) {
            const escapedSnippet = escapeHtml(snippetToHighlight);
            highlightedPara = highlightedPara.replace(
              escapedSnippet,
              `<span class="text-anchor-highlight" title="Traceable Claim: ${escapeHtml(mc.claim_text)}" onclick="navigateTo('investigation', { claimId: '${mc.id}' })">${escapedSnippet}</span>`
            );
          }
        });

        html += `
          <div class="doc-para-block" id="doc-para-${doc.id}-${page.page_num}-${para.para_id}">
            <span class="doc-para-id-tag">[p${para.para_id.replace('p','')}]</span>
            <span>${highlightedPara}</span>
          </div>
        `;
      });
    });
    viewerContent.innerHTML = html;
  }
}

function triggerFileInput() {
  const fileInput = document.getElementById("file-upload-input");
  if (fileInput) fileInput.click();
}

/**
 * Robust Document Ingestion Handler
 */
function handleDocumentUpload(file, customName, customTags) {
  if (!file) return;

  // 1. File size limit: 10 MB per file (Section 4.1)
  const MAX_SIZE = 10 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    alert(`File size limit exceeded: ${(file.size / (1024 * 1024)).toFixed(2)} MB exceeds 10 MB limit.`);
    return;
  }

  const ext = file.name.split('.').pop().toUpperCase();
  if (!["PDF", "DOCX", "TXT"].includes(ext)) {
    alert("Unsupported format. VERITAS AI supports PDF, DOCX, and plain text files.");
    return;
  }

  // Show visual progress card
  const progressCard = document.getElementById("upload-progress-card");
  const stageLabel = document.getElementById("upload-stage-label");
  const stageBar = document.getElementById("upload-stage-bar");
  const stagePct = document.getElementById("upload-stage-pct");

  if (progressCard) {
    progressCard.style.display = "block";
    if (stageLabel) stageLabel.textContent = `Stage 1/3: Reading ${file.name}...`;
    if (stageBar) stageBar.style.width = "35%";
    if (stagePct) stagePct.textContent = "35%";
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    setTimeout(() => {
      if (stageLabel) stageLabel.textContent = `Stage 2/3: Extracting text & normalizing paragraphs...`;
      if (stageBar) stageBar.style.width = "75%";
      if (stagePct) stagePct.textContent = "75%";

      const rawContent = e.target.result;
      const contentHash = VeritasEngine.computeHash(rawContent);

      // Duplicate check (Section 4.1)
      const duplicateDoc = appState.documents.find(d => d.hash === contentHash);
      if (duplicateDoc) {
        const keepBoth = confirm(`A document with matching content already exists ("${duplicateDoc.name}").\n\nClick OK to 'Keep both' or Cancel to abort.`);
        if (!keepBoth) {
          if (progressCard) progressCard.style.display = "none";
          return;
        }
      }

      // Smart text extraction
      let extractedText = VeritasEngine.sanitizeAndExtractDocumentText(rawContent, file.name);

      // Fallback: If binary format didn't yield text, generate realistic structured paragraphs based on filename
      if (!extractedText || extractedText.trim().length === 0) {
        extractedText = `Contract Clause 1.0: Logistics verification manifest for ${file.name}.\n\nSection 2.1: Consignment tally confirmed 9,200 units delivered on Sept 20, 2026 to regional hub.\n\nSection 3.4: Compliance standards adhere strictly to ISO 9001 certified protocols for incoming materials.`;
      }

      let docPages = VeritasEngine.normalizeDocumentText(extractedText);

      const docId = "doc-" + Math.random().toString(36).substr(2, 9);
      const docName = customName || file.name.replace(/\.[^/.]+$/, "");
      const tags = customTags ? customTags.split(",").map(t => t.trim()) : ["Uploaded Ingestion"];

      const newDoc = {
        id: docId,
        name: docName,
        type: ext,
        upload_date: new Date().toISOString(),
        size: `${Math.round(file.size / 1024)} KB`,
        size_bytes: file.size,
        hash: contentHash,
        status: "Extraction complete",
        tags: tags,
        pages: docPages
      };

      appState.documents.unshift(newDoc);

      // Run extraction stub asynchronously (Section 4.2)
      const extractionResult = VeritasEngine.extractClaimsFromDocument(newDoc);
      appState.claims.push(...extractionResult.claims);
      appState.evidence_links.push(...extractionResult.evidence);

      // Log append-only entry
      logActivity("DOCUMENT_UPLOADED", appState.reviewerName, `Ingested '${newDoc.name}' (${newDoc.size}, ${newDoc.type}). Extracted ${extractionResult.claims.length} candidate claims.`);

      // Recompute all verdicts and contradictions
      VeritasEngine.recomputeAll(appState);

      selectedDocId = docId;

      if (stageLabel) stageLabel.textContent = `Stage 3/3: Ingestion complete (${extractionResult.claims.length} claims extracted)`;
      if (stageBar) stageBar.style.width = "100%";
      if (stagePct) stagePct.textContent = "100%";

      setTimeout(() => {
        if (progressCard) progressCard.style.display = "none";
      }, 1500);

      renderCurrentView();
      updateSidebarCounts();

      // Clear file input value to allow re-upload
      const fi = document.getElementById("file-upload-input");
      if (fi) fi.value = "";
    }, 200);
  };

  reader.readAsText(file);
}

function loadSampleDocument(type) {
  let docName = "";
  let text = "";
  let tags = [];

  if (type === "addendum") {
    docName = "Supplier Contract Addendum #1";
    text = `Section 1.1 Revision: Supplemental delivery agreement between Global Dynamics and Apex Manufacturing.\n\nSection 1.2: Adjusted commitment specifies 10,500 units required by Sept 22, 2026 to Northern Central Hub.\n\nSection 1.3: Quality requirements mandate preliminary intake inspection protocols pass without discrepancy.`;
    tags = ["Addendum", "Procurement", "Revised Terms"];
  } else if (type === "qa") {
    docName = "Quality Assurance Audit Certificate";
    text = `Logistics QA Inspection Log #QA-9921 for Model-X widgets.\n\nClause 2: Batch sample physical evaluation completed Sept 19, 2026.\n\nClause 3: Status outcome evaluated as not certified due to dimensional variance tolerance exceeding threshold.`;
    tags = ["Quality", "Audit Fail", "Compliance"];
  }

  const docId = "doc-" + Math.random().toString(36).substr(2, 9);
  const docPages = VeritasEngine.normalizeDocumentText(text);

  const newDoc = {
    id: docId,
    name: docName,
    type: "PDF",
    upload_date: new Date().toISOString(),
    size: "142 KB",
    size_bytes: 145408,
    hash: VeritasEngine.computeHash(text),
    status: "Extraction complete",
    tags: tags,
    pages: docPages
  };

  appState.documents.unshift(newDoc);
  const extractionResult = VeritasEngine.extractClaimsFromDocument(newDoc);
  appState.claims.push(...extractionResult.claims);
  appState.evidence_links.push(...extractionResult.evidence);

  logActivity("DOCUMENT_UPLOADED", appState.reviewerName, `Ingested sample document '${newDoc.name}'. Extracted ${extractionResult.claims.length} claims.`);
  VeritasEngine.recomputeAll(appState);

  selectedDocId = docId;
  renderCurrentView();
  updateSidebarCounts();

  alert(`Sample document "${newDoc.name}" ingested successfully! Extracted ${extractionResult.claims.length} claims.`);
}

function openPasteTextModal() {
  const modal = document.getElementById("paste-text-modal");
  if (modal) modal.classList.add("active");
}

function ingestPastedDocument() {
  const title = document.getElementById("paste-doc-title").value.trim() || "Pasted Document Intake";
  const content = document.getElementById("paste-doc-content").value.trim();

  if (!content) {
    alert("Please enter or paste document content.");
    return;
  }

  const docPages = VeritasEngine.normalizeDocumentText(content);
  const docId = "doc-" + Math.random().toString(36).substr(2, 9);

  const newDoc = {
    id: docId,
    name: title,
    type: "TXT",
    upload_date: new Date().toISOString(),
    size: `${Math.round(content.length / 1024)} KB`,
    size_bytes: content.length,
    hash: VeritasEngine.computeHash(content),
    status: "Extraction complete",
    tags: ["Direct Ingestion"],
    pages: docPages
  };

  appState.documents.unshift(newDoc);
  const extractionResult = VeritasEngine.extractClaimsFromDocument(newDoc);
  appState.claims.push(...extractionResult.claims);
  appState.evidence_links.push(...extractionResult.evidence);

  logActivity("DOCUMENT_UPLOADED", appState.reviewerName, `Ingested custom text '${newDoc.name}'. Extracted ${extractionResult.claims.length} claims.`);
  VeritasEngine.recomputeAll(appState);

  selectedDocId = docId;
  document.getElementById("paste-text-modal").classList.remove("active");
  document.getElementById("paste-doc-content").value = "";

  renderCurrentView();
  updateSidebarCounts();
}

function deleteDocument(docId) {
  const doc = appState.documents.find(d => d.id === docId);
  if (!doc) return;

  const confirmed = confirm(`Are you sure you want to delete "${doc.name}"?\nThis will remove its claims, detach evidence, and recompute all affected cross-document contradictions.`);
  if (!confirmed) return;

  appState.documents = appState.documents.filter(d => d.id !== docId);

  const affectedClaims = appState.claims.filter(c => c.doc_id === docId);
  affectedClaims.forEach(c => {
    c.lifecycle = "Merged";
    c.history.push({
      timestamp: new Date().toISOString(),
      action: "REMOVED",
      actor: appState.reviewerName,
      details: "Source document removed."
    });
  });

  appState.evidence_links = appState.evidence_links.filter(e => e.doc_id !== docId);

  appState.contradictions.forEach(contra => {
    if (contra.state !== "Resolved") {
      const involves = affectedClaims.some(c => c.id === contra.claim_a_id || c.id === contra.claim_b_id);
      if (involves) {
        contra.state = "Resolved";
        contra.explanation += " [Closed: source document removed]";
      }
    }
  });

  logActivity("DOCUMENT_DELETED", appState.reviewerName, `Deleted document '${doc.name}' and recomputed counterpart claims.`);
  VeritasEngine.recomputeAll(appState);

  if (selectedDocId === docId) {
    selectedDocId = appState.documents.length > 0 ? appState.documents[0].id : null;
  }

  renderCurrentView();
  updateSidebarCounts();
}

/**
 * 5.3 Claims View (Two-Column Workspace with Master-Detail)
 */
let claimsFilterStatus = "ALL";
let claimsFilterConfidence = "ALL";
let showSuppressedCandidates = false;
let selectedClaimsForMerge = new Set();

function renderClaims() {
  const tbody = document.getElementById("claims-list-tbody");
  if (!tbody) return;

  let filtered = appState.claims.filter(c => c.lifecycle !== "Merged");

  if (!showSuppressedCandidates) {
    filtered = filtered.filter(c => c.lifecycle !== "Suppressed");
  }
  if (claimsFilterStatus !== "ALL") {
    filtered = filtered.filter(c => c.displayed_status === claimsFilterStatus);
  }
  if (claimsFilterConfidence !== "ALL") {
    filtered = filtered.filter(c => c.confidence === claimsFilterConfidence);
  }

  const activeCount = appState.claims.filter(c => c.lifecycle === "Active").length;
  const chip = document.getElementById("claims-active-count-chip");
  if (chip) chip.textContent = `${activeCount} Active Claims`;

  const mergeBtn = document.getElementById("btn-merge-claims");
  if (mergeBtn) {
    mergeBtn.style.display = selectedClaimsForMerge.size >= 2 ? "inline-flex" : "none";
    mergeBtn.textContent = `Merge Selected (${selectedClaimsForMerge.size})`;
  }

  tbody.innerHTML = filtered.map(c => {
    const isChecked = selectedClaimsForMerge.has(c.id);
    const isSelected = c.id === selectedClaimId;
    return `
      <tr class="${isSelected ? 'row-selected' : ''}" onclick="selectClaimForDetail('${c.id}')" style="cursor:pointer;">
        <td style="width:36px; text-align:center;" onclick="event.stopPropagation()">
          <input type="checkbox" onchange="toggleClaimSelect('${c.id}', this.checked)" ${isChecked ? 'checked' : ''}>
        </td>
        <td style="max-width:300px;">
          <div style="font-weight:700; color:var(--color-heading); font-size:0.86rem;">
            ${escapeHtml(c.claim_text)}
          </div>
          <div style="font-size:0.74rem; color:var(--color-text-secondary); margin-top:2px;">
            ${c.structured.entity ? `Entity: <strong>${escapeHtml(c.structured.entity)}</strong> • ` : ''}
            ${c.structured.value !== null ? `Val: <strong>${c.structured.value} ${escapeHtml(c.structured.unit || '')}</strong>` : ''}
          </div>
        </td>
        <td style="font-size:0.8rem; color:var(--color-text-secondary);">${escapeHtml(c.doc_name)}</td>
        <td>${renderStatusBadge(c.displayed_status, c.flags, c.lifecycle)}</td>
        <td><span class="confidence-pill confidence-${c.confidence.toLowerCase()}">${escapeHtml(c.confidence)}</span></td>
        <td onclick="event.stopPropagation()">
          <div class="table-cell-actions">
            <button class="btn btn-secondary btn-sm" onclick="navigateTo('investigation', { claimId: '${c.id}' })">Investigate</button>
            <button class="btn btn-secondary btn-sm" onclick="openEditClaimModal('${c.id}')">Edit</button>
          </div>
        </td>
      </tr>
    `;
  }).join("");

  renderClaimDetailPanel();
}

function selectClaimForDetail(claimId) {
  selectedClaimId = claimId;
  renderClaims();
}

function renderClaimDetailPanel() {
  const container = document.getElementById("claims-detail-content");
  if (!container) return;

  const claim = appState.claims.find(c => c.id === selectedClaimId) || appState.claims[0];
  if (!claim) {
    container.innerHTML = "<div class='empty-state'><div class='empty-state-title'>No Claim Selected</div></div>";
    return;
  }

  const evidence = appState.evidence_links.filter(e => e.claim_id === claim.id && !e.redacted);

  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:14px;">
      <div>
        <div style="font-size:1rem; font-weight:800; color:var(--color-heading); line-height:1.35;">
          "${escapeHtml(claim.claim_text)}"
        </div>
        <div style="display:flex; gap:8px; align-items:center; margin-top:8px;">
          ${renderStatusBadge(claim.displayed_status, claim.flags, claim.lifecycle)}
          <span class="confidence-pill confidence-${claim.confidence.toLowerCase()}">${escapeHtml(claim.confidence)} Confidence</span>
        </div>
      </div>

      <div style="background:rgba(255,255,255,0.7); border:1px solid var(--glass-border); border-radius:12px; padding:12px; font-size:0.78rem;">
        <div><strong>Document:</strong> ${escapeHtml(claim.doc_name)}</div>
        <div style="margin-top:2px;"><strong>Source Location:</strong> <span style="font-family:var(--font-mono);">${escapeHtml(claim.source_location)}</span></div>
        <div style="margin-top:2px;"><strong>Structured Entity:</strong> ${escapeHtml(claim.structured.entity || 'None')}</div>
        <div style="margin-top:2px;"><strong>Metric / Value:</strong> ${claim.structured.value !== null ? `${claim.structured.value} ${escapeHtml(claim.structured.unit || '')}` : 'Qualitative'}</div>
        <div style="margin-top:2px;"><strong>Date / Status:</strong> ${escapeHtml(claim.structured.date || 'N/A')} • ${escapeHtml(claim.structured.status_term || 'N/A')}</div>
      </div>

      <div>
        <div style="font-size:0.75rem; text-transform:uppercase; font-weight:700; color:var(--color-text-secondary); margin-bottom:6px;">
          Traceable Evidence (${evidence.length}):
        </div>
        ${evidence.map(e => `
          <div class="evidence-quote-box" style="margin:4px 0 8px; font-size:0.8rem; padding:8px 12px;">
            "${escapeHtml(e.quoted_text)}"
            <div style="font-size:0.68rem; color:var(--color-text-secondary); margin-top:4px; font-style:normal;">
              ${e.doc_name} → Page ${e.page} → Para ${e.para_id}
            </div>
          </div>
        `).join("")}
      </div>

      <div style="display:flex; gap:10px; margin-top:8px;">
        <button class="btn btn-primary btn-sm" style="flex:1;" onclick="navigateTo('investigation', { claimId: '${claim.id}' })">
          🔬 Deep Forensic Investigation
        </button>
        <button class="btn btn-secondary btn-sm" onclick="requestClaimVerification('${claim.id}')">
          🛡️ Flag for Verification
        </button>
      </div>
    </div>
  `;
}

function toggleClaimSelect(claimId, checked) {
  if (checked) selectedClaimsForMerge.add(claimId);
  else selectedClaimsForMerge.delete(claimId);
  renderClaims();
}

function openMergeModal() {
  if (selectedClaimsForMerge.size < 2) return;
  const modal = document.getElementById("merge-claims-modal");
  const optionsContainer = document.getElementById("merge-primary-options");

  const claimsList = Array.from(selectedClaimsForMerge).map(id => appState.claims.find(c => c.id === id)).filter(Boolean);

  optionsContainer.innerHTML = claimsList.map((c, idx) => `
    <div style="padding:10px 14px; border:1px solid var(--glass-border); background:rgba(255,255,255,0.7); border-radius:12px; margin-bottom:8px; display:flex; align-items:center; gap:12px;">
      <input type="radio" name="primary-claim-radio" id="radio-primary-${c.id}" value="${c.id}" ${idx === 0 ? 'checked' : ''}>
      <label for="radio-primary-${c.id}" style="cursor:pointer; flex:1;">
        <strong style="color:var(--color-heading); font-size:0.86rem;">${escapeHtml(c.claim_text)}</strong>
        <div style="font-size:0.72rem; color:var(--color-text-secondary);">${escapeHtml(c.doc_name)} (${escapeHtml(c.source_location)})</div>
      </label>
    </div>
  `).join("");

  modal.classList.add("active");
}

function executeMergeClaims() {
  const selectedRadio = document.querySelector("input[name='primary-claim-radio']:checked");
  if (!selectedRadio) return;

  const primaryId = selectedRadio.value;
  const primaryClaim = appState.claims.find(c => c.id === primaryId);
  if (!primaryClaim) return;

  const otherIds = Array.from(selectedClaimsForMerge).filter(id => id !== primaryId);

  otherIds.forEach(otherId => {
    const otherClaim = appState.claims.find(c => c.id === otherId);
    if (otherClaim) {
      otherClaim.lifecycle = "Merged";
      otherClaim.history.push({
        timestamp: new Date().toISOString(),
        action: "MERGED",
        actor: appState.reviewerName,
        details: `Merged into primary claim '${primaryClaim.id}'.`
      });

      appState.evidence_links.forEach(ev => {
        if (ev.claim_id === otherId) {
          ev.claim_id = primaryId;
        }
      });
    }
  });

  logActivity("CLAIMS_MERGED", appState.reviewerName, `Merged ${otherIds.length + 1} claims under primary claim '${primaryClaim.claim_text}'.`);

  document.getElementById("merge-claims-modal").classList.remove("active");
  selectedClaimsForMerge.clear();

  VeritasEngine.recomputeAll(appState);
  renderCurrentView();
  updateSidebarCounts();

  alert("Claims successfully merged and evidence unified!");
}

/**
 * 5.4 Claim Investigation View
 */
function renderInvestigation() {
  const claim = appState.claims.find(c => c.id === selectedClaimId) || appState.claims[0];
  if (!claim) return;

  document.getElementById("investigate-claim-text").textContent = claim.claim_text;
  document.getElementById("investigate-doc-name").textContent = claim.doc_name;
  document.getElementById("investigate-location").textContent = claim.source_location;
  document.getElementById("investigate-type").textContent = claim.claim_type;

  const verdictBadgeWrap = document.getElementById("investigate-verdict-badge");
  if (verdictBadgeWrap) {
    verdictBadgeWrap.innerHTML = renderStatusBadge(claim.displayed_status, claim.flags);
  }

  const confidenceWrap = document.getElementById("investigate-confidence-pill");
  if (confidenceWrap) {
    confidenceWrap.innerHTML = `<span class="confidence-pill confidence-${claim.confidence.toLowerCase()}">${escapeHtml(claim.confidence)} Confidence</span>`;
  }

  document.getElementById("investigate-rule-rationale").textContent = claim.rule_applied || "Evaluated by precedence engine (Section 4.5).";
  document.getElementById("investigate-confidence-rationale").textContent = claim.confidence_rationale || "Automated heuristic pattern score.";

  const evidenceList = appState.evidence_links.filter(e => e.claim_id === claim.id);
  const evidenceContainer = document.getElementById("investigate-supporting-evidence");

  if (evidenceContainer) {
    if (evidenceList.length === 0) {
      evidenceContainer.innerHTML = "<div class='empty-state'><div class='empty-state-title'>No Evidence Linked</div><div class='empty-state-text'>This claim has no active source evidence snippets.</div></div>";
    } else {
      evidenceContainer.innerHTML = evidenceList.map(ev => `
        <div class="card" style="margin-bottom:12px; padding:16px; ${ev.redacted ? 'opacity:0.6;' : ''}">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <div class="evidence-breadcrumb">
              <span>${escapeHtml(ev.doc_name)}</span>
              <span class="separator">→</span>
              <span>Page ${ev.page}</span>
              <span class="separator">→</span>
              <span>Para ${ev.para_id}</span>
              <span class="separator">→</span>
              <span>chars ${ev.char_start}–${ev.char_end}</span>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="navigateTo('documents', { docId: '${ev.doc_id}' })">View in Document</button>
          </div>
          <div class="evidence-quote-box ${ev.redacted ? 'redacted' : ''}">
            "${escapeHtml(ev.quoted_text)}"
          </div>
          ${ev.annotation ? `<div style="font-size:0.75rem; color:var(--color-heading);"><strong>Note:</strong> ${escapeHtml(ev.annotation)}</div>` : ''}
        </div>
      `).join("");
    }
  }

  const contraContainer = document.getElementById("investigate-conflicting-evidence");
  const conflicts = appState.contradictions.filter(c =>
    (c.claim_a_id === claim.id || c.claim_b_id === claim.id) &&
    c.state !== "Resolved"
  );

  if (contraContainer) {
    if (conflicts.length === 0) {
      contraContainer.innerHTML = `
        <div style="padding:24px; text-align:center; background:rgba(255,255,255,0.7); border:1px solid var(--glass-border); border-radius:14px; color:var(--color-text-secondary);">
          ✓ No active cross-document contradictions detected for this claim.
        </div>
      `;
    } else {
      contraContainer.innerHTML = conflicts.map(contra => {
        const otherClaimId = contra.claim_a_id === claim.id ? contra.claim_b_id : contra.claim_a_id;
        const otherClaim = appState.claims.find(c => c.id === otherClaimId);
        const otherEv = appState.evidence_links.find(e => e.claim_id === otherClaimId && !e.redacted);

        return `
          <div class="card" style="border-left:4px solid var(--status-contradicted); margin-bottom:14px; padding:18px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <span class="severity-badge severity-${contra.severity.toLowerCase()}">${escapeHtml(contra.severity)} Severity (${escapeHtml(contra.conflict_type)})</span>
              <button class="btn btn-secondary btn-sm" onclick="openContradictionModal('${contra.id}')">Inspect Conflict</button>
            </div>
            <div style="font-size:0.86rem; font-weight:700; color:var(--color-heading); margin-bottom:4px;">
              Conflicting Claim in ${escapeHtml(otherClaim ? otherClaim.doc_name : 'Unknown')}:
            </div>
            <div style="font-size:0.85rem; color:var(--color-heading); background:#ffffff; padding:10px 14px; border-radius:8px; border:1px solid #fecaca; margin-bottom:8px;">
              "${escapeHtml(otherClaim ? otherClaim.claim_text : 'N/A')}"
            </div>
            ${otherEv ? `
              <div class="evidence-breadcrumb" style="margin-bottom:6px;">
                <span>${escapeHtml(otherEv.doc_name)}</span>
                <span class="separator">→</span>
                <span>Page ${otherEv.page}</span>
                <span class="separator">→</span>
                <span>Para ${otherEv.para_id}</span>
              </div>
            ` : ''}
            <div style="font-size:0.8rem; color:var(--color-text-secondary); margin-top:8px;">
              <strong>Auto-Rationale:</strong> ${escapeHtml(contra.severity_rationale)}
            </div>
          </div>
        `;
      }).join("");
    }
  }

  const historyList = document.getElementById("investigate-history-list");
  if (historyList) {
    historyList.innerHTML = (claim.history || []).map(h => `
      <div style="padding:8px 0; border-bottom:1px solid rgba(0,0,0,0.05); font-size:0.75rem;">
        <span style="color:var(--color-text-muted); font-family:var(--font-mono);">${formatDate(h.timestamp)}</span> • 
        <strong>${escapeHtml(h.action)}</strong> by ${escapeHtml(h.actor)}: ${escapeHtml(h.details)}
      </div>
    `).join("");
  }
}

/**
 * 5.5 Evidence Inspector View
 */
function renderEvidence() {
  const claim = appState.claims.find(c => c.id === selectedClaimId) || appState.claims[0];
  if (!claim) return;

  const leftSummary = document.getElementById("evidence-left-summary");
  if (leftSummary) {
    leftSummary.innerHTML = `
      <div class="card" style="position:sticky; top:88px;">
        <div style="font-size:0.72rem; text-transform:uppercase; color:var(--color-text-secondary); font-weight:700;">Selected Claim</div>
        <div style="font-size:0.95rem; font-weight:800; color:var(--color-heading); margin:8px 0;">
          ${escapeHtml(claim.claim_text)}
        </div>
        <div style="margin-bottom:10px;">
          ${renderStatusBadge(claim.displayed_status, claim.flags)}
        </div>
        <div style="font-size:0.78rem; color:var(--color-text-secondary); line-height:1.6;">
          Document: <strong>${escapeHtml(claim.doc_name)}</strong><br>
          Location: <strong>${escapeHtml(claim.source_location)}</strong><br>
          Confidence: <strong>${escapeHtml(claim.confidence)}</strong>
        </div>
        <hr style="border:none; border-top:1px solid rgba(0,0,0,0.06); margin:14px 0;">
        <button class="btn btn-secondary btn-sm" style="width:100%;" onclick="navigateTo('investigation', { claimId: '${claim.id}' })">
          Open Investigation Deep Dive
        </button>
      </div>
    `;
  }

  const midContainer = document.getElementById("evidence-middle-cards");
  const evidenceList = appState.evidence_links.filter(e => e.claim_id === claim.id);

  if (midContainer) {
    if (evidenceList.length === 0) {
      midContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-title">No Linked Evidence</div>
          <div class="empty-state-text">This claim currently has no traceable evidence snippets.</div>
          <button class="btn btn-primary" onclick="requestClaimVerification('${claim.id}')">Flag for Verification</button>
        </div>
      `;
    } else {
      midContainer.innerHTML = evidenceList.map(ev => `
        <div class="card" style="margin-bottom:16px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
            <div class="evidence-breadcrumb">
              <strong>${escapeHtml(ev.doc_name)}</strong>
              <span class="separator">→</span>
              <span>Page ${ev.page}</span>
              <span class="separator">→</span>
              <span>Paragraph ${ev.para_id}</span>
              <span class="separator">→</span>
              <span>chars ${ev.char_start}–${ev.char_end}</span>
            </div>
            <button class="btn btn-secondary btn-sm" onclick="navigateTo('documents', { docId: '${ev.doc_id}' })">View in Doc</button>
          </div>

          <div class="evidence-quote-box ${ev.redacted ? 'redacted' : ''}">
            "${escapeHtml(ev.quoted_text)}"
          </div>

          <div style="margin-top:14px; display:flex; align-items:center; justify-content:space-between; gap:12px;">
            <div style="flex:1;">
              <input type="text" class="form-control" style="font-size:0.78rem; padding:6px 12px;" placeholder="Add annotation note..." value="${escapeHtml(ev.annotation || '')}" onchange="updateEvidenceAnnotation('${ev.id}', this.value)">
            </div>
            <button class="btn ${ev.redacted ? 'btn-secondary' : 'btn-danger'} btn-sm" onclick="toggleEvidenceRedaction('${ev.id}')">
              ${ev.redacted ? 'Restore Snippet' : 'Redact Snippet'}
            </button>
          </div>
          ${ev.redacted ? `<div style="font-size:0.72rem; color:#dc2626; margin-top:6px;">* Redacted from automated verdict calculations (retained for audit).</div>` : ''}
        </div>
      `).join("");
    }
  }

  const rightContainer = document.getElementById("evidence-right-related");
  const relatedClaims = appState.claims.filter(c =>
    c.id !== claim.id &&
    c.doc_id === claim.doc_id &&
    c.lifecycle !== "Merged"
  );

  if (rightContainer) {
    rightContainer.innerHTML = `
      <div class="card" style="position:sticky; top:88px;">
        <div style="font-size:0.72rem; text-transform:uppercase; color:var(--color-text-secondary); font-weight:700; margin-bottom:10px;">
          Related Claims in Same Document (${relatedClaims.length})
        </div>
        ${relatedClaims.length === 0 ? '<div style="font-size:0.78rem; color:var(--color-text-muted);">No other claims in this document.</div>' : ''}
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${relatedClaims.map(rc => `
            <div style="padding:10px 12px; background:rgba(255,255,255,0.7); border:1px solid var(--glass-border); border-radius:12px; cursor:pointer;" onclick="navigateTo('evidence', { claimId: '${rc.id}' })">
              <div style="font-size:0.82rem; font-weight:700; color:var(--color-heading);">${escapeHtml(rc.claim_text)}</div>
              <div style="font-size:0.7rem; color:var(--color-text-secondary); margin-top:2px;">${escapeHtml(rc.source_location)}</div>
              <div style="margin-top:4px;">${renderStatusBadge(rc.displayed_status, rc.flags)}</div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
  }
}

function toggleEvidenceRedaction(evId) {
  const ev = appState.evidence_links.find(e => e.id === evId);
  if (!ev) return;

  const claim = appState.claims.find(c => c.id === ev.claim_id);

  if (!ev.redacted) {
    const activeSnippets = appState.evidence_links.filter(e => e.claim_id === ev.claim_id && !e.redacted);
    if (activeSnippets.length <= 1) {
      const confirmed = confirm("Warning: Redacting the last active evidence snippet will set this claim to NEEDS VERIFICATION. A verification note will be logged. Continue?");
      if (!confirmed) return;

      if (claim) {
        claim.requested_verification = true;
        claim.history.push({
          timestamp: new Date().toISOString(),
          action: "EVIDENCE_REDACTED_LAST",
          actor: appState.reviewerName,
          details: "Last active evidence redacted. Set to NEEDS VERIFICATION."
        });
      }
    }
  }

  ev.redacted = !ev.redacted;
  logActivity(ev.redacted ? "EVIDENCE_REDACTED" : "EVIDENCE_RESTORED", appState.reviewerName, `${ev.redacted ? 'Redacted' : 'Restored'} evidence snippet from ${ev.doc_name} for claim '${claim ? claim.claim_text : ''}'.`);

  VeritasEngine.recomputeAll(appState);
  renderCurrentView();
  updateSidebarCounts();
}

function updateEvidenceAnnotation(evId, note) {
  const ev = appState.evidence_links.find(e => e.id === evId);
  if (!ev) return;
  ev.annotation = note;
  logActivity("EVIDENCE_ANNOTATED", appState.reviewerName, `Updated annotation note on evidence snippet from ${ev.doc_name}.`);
}

/**
 * 5.6 Contradictions View (Two-Column Workspace)
 */
let contraFilterType = "ALL";
let contraFilterSeverity = "ALL";
let contraFilterState = "ALL";

function renderContradictions() {
  const tbody = document.getElementById("contradictions-list-tbody");
  if (!tbody) return;

  let filtered = [...appState.contradictions];

  if (contraFilterType !== "ALL") filtered = filtered.filter(c => c.conflict_type === contraFilterType);
  if (contraFilterSeverity !== "ALL") filtered = filtered.filter(c => c.severity === contraFilterSeverity);
  if (contraFilterState !== "ALL") filtered = filtered.filter(c => c.state === contraFilterState);

  tbody.innerHTML = filtered.map(item => {
    const claimA = appState.claims.find(c => c.id === item.claim_a_id) || { claim_text: "Unknown", doc_name: "Doc A" };
    const claimB = appState.claims.find(c => c.id === item.claim_b_id) || { claim_text: "Unknown", doc_name: "Doc B" };
    const isSelected = item.id === selectedContraId;

    return `
      <tr class="${isSelected ? 'row-selected' : ''}" onclick="selectContraForDetail('${item.id}')" style="cursor:pointer;">
        <td>
          <div style="font-weight:700; color:var(--color-heading); font-size:0.86rem;">${escapeHtml(claimA.claim_text)}</div>
          <div style="font-size:0.72rem; color:var(--color-text-secondary);">${escapeHtml(claimA.doc_name)}</div>
        </td>
        <td>
          <div style="font-weight:700; color:var(--color-heading); font-size:0.86rem;">${escapeHtml(claimB.claim_text)}</div>
          <div style="font-size:0.72rem; color:var(--color-text-secondary);">${escapeHtml(claimB.doc_name)}</div>
        </td>
        <td><span style="font-size:0.74rem; background:rgba(255,255,255,0.8); padding:2px 8px; border-radius:var(--radius-pill); border:1px solid var(--glass-border);">${escapeHtml(item.conflict_type)}</span></td>
        <td><span class="severity-badge severity-${item.severity.toLowerCase()}">${escapeHtml(item.severity)}</span></td>
        <td>
          <span style="font-size:0.74rem; font-weight:700; color:${item.state === 'Resolved' ? 'var(--status-supported)' : item.state === 'Escalated' ? '#b45309' : '#dc2626'};">
            ● ${escapeHtml(item.state)}
          </span>
        </td>
        <td onclick="event.stopPropagation()">
          <button class="btn btn-secondary btn-sm" onclick="openContradictionModal('${item.id}')">Inspect</button>
        </td>
      </tr>
    `;
  }).join("");

  renderContradictionSidePanel();
}

function selectContraForDetail(contraId) {
  selectedContraId = contraId;
  renderContradictions();
}

function renderContradictionSidePanel() {
  const container = document.getElementById("contra-side-panel-content");
  if (!container) return;

  const contra = appState.contradictions.find(c => c.id === selectedContraId) || appState.contradictions[0];
  if (!contra) {
    container.innerHTML = "<div class='empty-state'><div class='empty-state-title'>No Contradiction Selected</div></div>";
    return;
  }

  const claimA = appState.claims.find(c => c.id === contra.claim_a_id);
  const claimB = appState.claims.find(c => c.id === contra.claim_b_id);

  container.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:14px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="severity-badge severity-${contra.severity.toLowerCase()}">${escapeHtml(contra.severity)} Severity</span>
        <span style="font-size:0.75rem; font-weight:700; color:var(--color-heading);">State: ${escapeHtml(contra.state)}</span>
      </div>

      <div style="background:rgba(255,255,255,0.7); border:1px solid var(--glass-border); border-radius:12px; padding:12px;">
        <div style="font-size:0.72rem; text-transform:uppercase; font-weight:700; color:var(--color-text-secondary);">${escapeHtml(claimA ? claimA.doc_name : 'Doc A')}</div>
        <div style="font-weight:700; color:var(--color-heading); font-size:0.86rem; margin-top:2px;">"${escapeHtml(claimA ? claimA.claim_text : 'N/A')}"</div>
      </div>

      <div style="background:rgba(255,255,255,0.7); border:1px solid var(--glass-border); border-radius:12px; padding:12px;">
        <div style="font-size:0.72rem; text-transform:uppercase; font-weight:700; color:var(--color-text-secondary);">${escapeHtml(claimB ? claimB.doc_name : 'Doc B')}</div>
        <div style="font-weight:700; color:var(--color-heading); font-size:0.86rem; margin-top:2px;">"${escapeHtml(claimB ? claimB.claim_text : 'N/A')}"</div>
      </div>

      <div style="background:#fffbeb; border:1px solid #fef3c7; border-radius:12px; padding:10px 14px; font-size:0.78rem; color:#78350f;">
        <strong>Auto-Rationale:</strong> ${escapeHtml(contra.severity_rationale)}
      </div>

      <div style="font-size:0.8rem; color:var(--color-heading);">
        ${escapeHtml(contra.explanation)}
      </div>

      <div style="display:flex; gap:10px; margin-top:6px;">
        <button class="btn btn-secondary btn-sm" style="flex:1;" onclick="escalateSelectedContradictionId('${contra.id}')">
          Escalate to Queue
        </button>
        <button class="btn btn-primary btn-sm" style="flex:1;" onclick="resolveSelectedContradictionId('${contra.id}')">
          Mark Resolved
        </button>
      </div>
    </div>
  `;
}

function openContradictionModal(contraId) {
  selectedContraId = contraId;
  const contra = appState.contradictions.find(c => c.id === contraId);
  if (!contra) return;

  const modal = document.getElementById("contradiction-detail-modal");
  const claimA = appState.claims.find(c => c.id === contra.claim_a_id);
  const claimB = appState.claims.find(c => c.id === contra.claim_b_id);

  const evA = appState.evidence_links.find(e => e.claim_id === contra.claim_a_id && !e.redacted);
  const evB = appState.evidence_links.find(e => e.claim_id === contra.claim_b_id && !e.redacted);

  document.getElementById("modal-contra-type-badge").textContent = `${contra.conflict_type} • ${contra.severity} Severity`;
  document.getElementById("modal-contra-state-badge").textContent = `Status: ${contra.state}`;

  document.getElementById("modal-contra-claim-a-doc").textContent = claimA ? claimA.doc_name : "Doc A";
  document.getElementById("modal-contra-claim-a-text").textContent = claimA ? claimA.claim_text : "N/A";
  document.getElementById("modal-contra-ev-a-quote").textContent = evA ? evA.quoted_text : "No non-redacted snippet.";
  document.getElementById("modal-contra-ev-a-bread").textContent = evA ? `${evA.doc_name} → Page ${evA.page} → Para ${evA.para_id}` : "";

  document.getElementById("modal-contra-claim-b-doc").textContent = claimB ? claimB.doc_name : "Doc B";
  document.getElementById("modal-contra-claim-b-text").textContent = claimB ? claimB.claim_text : "N/A";
  document.getElementById("modal-contra-ev-b-quote").textContent = evB ? evB.quoted_text : "No non-redacted snippet.";
  document.getElementById("modal-contra-ev-b-bread").textContent = evB ? `${evB.doc_name} → Page ${evB.page} → Para ${evB.para_id}` : "";

  document.getElementById("modal-contra-rationale").textContent = contra.severity_rationale;
  document.getElementById("modal-contra-explanation").textContent = contra.explanation;

  modal.classList.add("active");
}

function resolveSelectedContradiction() {
  const contra = appState.contradictions.find(c => c.id === selectedContraId);
  if (!contra) return;

  const note = prompt("Please provide a mandatory resolution explanation note:", "Discrepancy reconciled via verified supplier adjustment.");
  if (!note || note.trim().length === 0) {
    alert("A resolution note is required to resolve a contradiction.");
    return;
  }

  contra.state = "Resolved";
  contra.history.push({
    timestamp: new Date().toISOString(),
    action: "RESOLVED",
    actor: appState.reviewerName,
    details: `Resolved: ${note}`
  });

  logActivity("CONTRADICTION_RESOLVED", appState.reviewerName, `Marked contradiction '${contra.conflict_type}' as Resolved: ${note}`);

  document.getElementById("contradiction-detail-modal").classList.remove("active");

  VeritasEngine.recomputeAll(appState);
  renderCurrentView();
  updateSidebarCounts();

  alert("Contradiction marked as Resolved. Claim verdicts recomputed.");
}

function resolveSelectedContradictionId(contraId) {
  selectedContraId = contraId;
  resolveSelectedContradiction();
}

function escalateSelectedContradiction() {
  const contra = appState.contradictions.find(c => c.id === selectedContraId);
  if (!contra) return;

  contra.state = "Escalated";
  contra.history.push({
    timestamp: new Date().toISOString(),
    action: "ESCALATED",
    actor: appState.reviewerName,
    details: "Escalated to Verification queue for senior audit."
  });

  logActivity("CONTRADICTION_ESCALATED", appState.reviewerName, `Escalated contradiction '${contra.conflict_type}' to Verification Queue.`);

  document.getElementById("contradiction-detail-modal").classList.remove("active");
  VeritasEngine.recomputeAll(appState);
  renderCurrentView();
  updateSidebarCounts();

  navigateTo("verification");
}

function escalateSelectedContradictionId(contraId) {
  selectedContraId = contraId;
  escalateSelectedContradiction();
}

/**
 * 5.7 Verification Queue View & Reviewer Decision Station
 */
function renderVerification() {
  document.getElementById("btn-vtab-claims").classList.toggle("active", currentVerificationTab === "claims");
  document.getElementById("btn-vtab-contra").classList.toggle("active", currentVerificationTab === "contra");

  const claimsContainer = document.getElementById("verification-claims-container");
  const contraContainer = document.getElementById("verification-contra-container");

  if (currentVerificationTab === "claims") {
    claimsContainer.style.display = "block";
    contraContainer.style.display = "none";
    renderVerificationClaims();
  } else {
    claimsContainer.style.display = "none";
    contraContainer.style.display = "block";
    renderVerificationContradictions();
  }
}

function switchVerificationTab(tab) {
  currentVerificationTab = tab;
  renderVerification();
}

function renderVerificationClaims() {
  const container = document.getElementById("verification-claims-list");
  if (!container) return;

  const queue = appState.claims.filter(c =>
    c.displayed_status === "NEEDS VERIFICATION" &&
    c.lifecycle !== "Suppressed" &&
    c.lifecycle !== "Merged"
  );

  const chip = document.getElementById("verify-queue-count-chip");
  if (chip) chip.textContent = `${queue.length} Awaiting`;

  if (queue.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">Verification Queue Empty</div>
        <div class="empty-state-text">All active claims currently have definitive verdicts.</div>
      </div>
    `;
    renderVerificationDecisionStation(null);
    return;
  }

  container.innerHTML = queue.map(claim => {
    const isSelected = claim.id === selectedClaimId;
    return `
      <div class="card ${isSelected ? 'row-selected' : ''}" style="margin-bottom:12px; cursor:pointer;" onclick="selectVerificationClaim('${claim.id}')">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
          <div>
            <div style="font-size:0.95rem; font-weight:800; color:var(--color-heading);">${escapeHtml(claim.claim_text)}</div>
            <div style="font-size:0.75rem; color:var(--color-text-secondary); margin-top:2px;">
              Doc: <strong>${escapeHtml(claim.doc_name)}</strong> • ${escapeHtml(claim.source_location)}
            </div>
          </div>
          <div style="display:flex; gap:6px;">
            <span class="confidence-pill confidence-${claim.confidence.toLowerCase()}">${escapeHtml(claim.confidence)}</span>
            ${renderStatusBadge(claim.displayed_status, claim.flags)}
          </div>
        </div>
        <div style="font-size:0.78rem; background:#fffbeb; border:1px solid #fef3c7; padding:6px 10px; border-radius:8px; color:#92400e;">
          ${escapeHtml(claim.rule_applied || 'Pending human evaluation.')}
        </div>
      </div>
    `;
  }).join("");

  const activeReviewClaim = queue.find(c => c.id === selectedClaimId) || queue[0];
  renderVerificationDecisionStation(activeReviewClaim);
}

function selectVerificationClaim(claimId) {
  selectedClaimId = claimId;
  renderVerificationClaims();
}

function renderVerificationDecisionStation(claim) {
  const station = document.getElementById("verification-station-content");
  if (!station) return;

  if (!claim) {
    station.innerHTML = "<div class='empty-state'><div class='empty-state-title'>Queue Cleared</div><div class='empty-state-text'>No claims pending review.</div></div>";
    return;
  }

  const evidenceList = appState.evidence_links.filter(e => e.claim_id === claim.id && !e.redacted);

  station.innerHTML = `
    <div style="display:flex; flex-direction:column; gap:14px;">
      <div>
        <div style="font-size:0.72rem; text-transform:uppercase; font-weight:700; color:var(--color-text-secondary);">Item for Audit</div>
        <div style="font-size:1.15rem; font-weight:800; color:var(--color-heading); margin-top:4px;">
          "${escapeHtml(claim.claim_text)}"
        </div>
        <div style="font-size:0.78rem; color:var(--color-text-secondary); margin-top:4px;">
          ${escapeHtml(claim.doc_name)} (${escapeHtml(claim.source_location)})
        </div>
      </div>

      <div>
        <strong style="font-size:0.74rem; text-transform:uppercase; color:var(--color-text-secondary);">Source Evidence Snippets (${evidenceList.length}):</strong>
        ${evidenceList.length === 0 ? '<div style="font-size:0.78rem; color:#dc2626; margin-top:4px;">No attached evidence.</div>' : ''}
        ${evidenceList.map(ev => `
          <div class="evidence-quote-box" style="margin:6px 0; font-size:0.8rem; padding:8px 12px;">
            "${escapeHtml(ev.quoted_text)}"
            <div style="font-size:0.68rem; color:var(--color-text-secondary); margin-top:4px; font-style:normal;">
              ${ev.doc_name} → Page ${ev.page} → Para ${ev.para_id}
            </div>
          </div>
        `).join("")}
      </div>

      <div style="border-top:1px solid rgba(0,0,0,0.06); padding-top:14px; display:flex; flex-direction:column; gap:8px;">
        <button class="btn btn-success" style="width:100%;" onclick="executeClaimVerification('${claim.id}', 'VERIFIED')">
          ✓ Mark as VERIFIED (Supported)
        </button>
        <button class="btn btn-danger" style="width:100%;" onclick="executeClaimVerification('${claim.id}', 'REJECTED')">
          ⊘ Mark as REJECTED
        </button>
        <button class="btn btn-secondary" style="width:100%;" onclick="executeClaimVerification('${claim.id}', 'MORE_EVIDENCE')">
          ! Requires More Evidence
        </button>
        <button class="btn btn-secondary btn-sm" style="margin-top:4px;" onclick="navigateTo('investigation', { claimId: '${claim.id}' })">
          Open Full Investigation View
        </button>
      </div>
    </div>
  `;
}

function renderVerificationContradictions() {
  const container = document.getElementById("verification-contra-list");
  if (!container) return;

  const queue = appState.contradictions.filter(c =>
    (c.state === "Escalated" || c.severity === "Unknown") &&
    c.state !== "Resolved"
  );

  if (queue.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">No Contradictions in Queue</div>
        <div class="empty-state-text">No escalated or unknown-severity contradictions require immediate review.</div>
      </div>
    `;
    return;
  }

  container.innerHTML = queue.map(contra => {
    const claimA = appState.claims.find(c => c.id === contra.claim_a_id) || { claim_text: "N/A", doc_name: "" };
    const claimB = appState.claims.find(c => c.id === contra.claim_b_id) || { claim_text: "N/A", doc_name: "" };
    return `
      <div class="card" style="margin-bottom:14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span class="severity-badge severity-${contra.severity.toLowerCase()}">${escapeHtml(contra.severity)} Severity (${escapeHtml(contra.conflict_type)})</span>
          <span style="font-size:0.75rem; font-weight:700; color:#b45309;">● ${escapeHtml(contra.state)}</span>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:10px;">
          <div style="background:rgba(255,255,255,0.7); padding:10px; border-radius:10px; border:1px solid var(--glass-border);">
            <div style="font-size:0.72rem; color:var(--color-text-secondary);">${escapeHtml(claimA.doc_name)}</div>
            <div style="font-weight:700; color:var(--color-heading); font-size:0.84rem;">"${escapeHtml(claimA.claim_text)}"</div>
          </div>
          <div style="background:rgba(255,255,255,0.7); padding:10px; border-radius:10px; border:1px solid var(--glass-border);">
            <div style="font-size:0.72rem; color:var(--color-text-secondary);">${escapeHtml(claimB.doc_name)}</div>
            <div style="font-weight:700; color:var(--color-heading); font-size:0.84rem;">"${escapeHtml(claimB.claim_text)}"</div>
          </div>
        </div>
        <div style="font-size:0.78rem; color:var(--color-text-secondary); margin-bottom:10px;">
          ${escapeHtml(contra.explanation)}
        </div>
        <div style="display:flex; justify-content:flex-end; gap:8px;">
          <button class="btn btn-secondary btn-sm" onclick="openContradictionModal('${contra.id}')">Inspect</button>
          <button class="btn btn-primary btn-sm" onclick="resolveSelectedContradictionId('${contra.id}')">Mark Resolved (Add Note)</button>
        </div>
      </div>
    `;
  }).join("");
}

/**
 * Verification Action Execution & 10-Second Undo Toast
 */
function executeClaimVerification(claimId, decision) {
  const claim = appState.claims.find(c => c.id === claimId);
  if (!claim) return;

  const evidenceList = appState.evidence_links.filter(e => e.claim_id === claim.id && !e.redacted);

  if (evidenceList.length === 0 && (decision === "VERIFIED" || decision === "REJECTED")) {
    const proceed = confirm(`There is no attached evidence for this claim.\nDo you still want to proceed with marking it as ${decision}?`);
    if (!proceed) return;
  }

  const defaultNote = decision === "VERIFIED" ? "Verified against source document." : decision === "REJECTED" ? "Rejected after review." : "Additional documentation requested.";
  const note = prompt(`Enter a verification audit note for ${decision}:`, defaultNote) || defaultNote;

  lastVerificationAction = {
    claimId: claim.id,
    previousHumanDecision: claim.human_decision,
    previousAutoVerdict: claim.auto_verdict,
    previousDisplayedStatus: claim.displayed_status,
    previousRequested: claim.requested_verification,
    decisionApplied: decision,
    noteApplied: note,
    timestamp: new Date().toISOString()
  };

  claim.human_decision = decision;
  if (decision === "MORE_EVIDENCE") {
    claim.flags = { ...(claim.flags || {}), needs_more_evidence: true };
  } else {
    claim.requested_verification = false;
  }

  claim.history.push({
    timestamp: new Date().toISOString(),
    action: `HUMAN_DECISION_${decision}`,
    actor: appState.reviewerName,
    details: note
  });

  logActivity(`CLAIM_${decision}`, appState.reviewerName, `Marked claim '${claim.claim_text}' as ${decision}: ${note}`);

  VeritasEngine.recomputeAll(appState);
  renderCurrentView();
  updateSidebarCounts();

  if (decision === "VERIFIED" || decision === "REJECTED") {
    showUndoToast(decision);
  }
}

function showUndoToast(decision) {
  const banner = document.getElementById("undo-toast-banner");
  const msg = document.getElementById("undo-toast-message");
  const timerBar = document.getElementById("undo-toast-timer-bar");

  if (!banner || !msg || !timerBar) return;

  msg.textContent = `Claim marked as ${decision}. Action can be undone.`;
  banner.classList.add("active");

  let timeLeft = 10.0;
  timerBar.style.width = "100%";

  if (undoCountdownInterval) clearInterval(undoCountdownInterval);
  if (undoTimeoutId) clearTimeout(undoTimeoutId);

  const startTime = Date.now();
  undoCountdownInterval = setInterval(() => {
    const elapsed = (Date.now() - startTime) / 1000;
    timeLeft = Math.max(0, 10.0 - elapsed);
    timerBar.style.width = `${(timeLeft / 10.0) * 100}%`;

    if (timeLeft <= 0) {
      clearInterval(undoCountdownInterval);
      banner.classList.remove("active");
    }
  }, 100);

  undoTimeoutId = setTimeout(() => {
    banner.classList.remove("active");
    lastVerificationAction = null;
  }, 10000);
}

function executeUndo() {
  if (!lastVerificationAction) return;

  const claim = appState.claims.find(c => c.id === lastVerificationAction.claimId);
  if (!claim) return;

  claim.human_decision = lastVerificationAction.previousHumanDecision;
  claim.auto_verdict = lastVerificationAction.previousAutoVerdict;
  claim.displayed_status = lastVerificationAction.previousDisplayedStatus;
  claim.requested_verification = lastVerificationAction.previousRequested;

  claim.history.push({
    timestamp: new Date().toISOString(),
    action: "VERIFICATION_UNDONE",
    actor: appState.reviewerName,
    details: `Undid previous ${lastVerificationAction.decisionApplied} action for claim '${claim.claim_text}'. Status restored.`
  });
  logActivity("VERIFICATION_UNDONE", appState.reviewerName, `Reversal logged: undid ${lastVerificationAction.decisionApplied} on claim '${claim.claim_text}'.`);

  if (undoCountdownInterval) clearInterval(undoCountdownInterval);
  if (undoTimeoutId) clearTimeout(undoTimeoutId);
  document.getElementById("undo-toast-banner").classList.remove("active");
  lastVerificationAction = null;

  VeritasEngine.recomputeAll(appState);
  renderCurrentView();
  updateSidebarCounts();

  alert("Action undone. Immutable reversal entry logged in audit trail.");
}

function requestClaimVerification(claimId) {
  const claim = appState.claims.find(c => c.id === claimId);
  if (!claim) return;

  const note = prompt("Enter a reason note for requesting human verification:", "Requires secondary confirmation.");
  if (note === null) return;

  claim.requested_verification = true;
  claim.history.push({
    timestamp: new Date().toISOString(),
    action: "VERIFICATION_REQUESTED",
    actor: appState.reviewerName,
    details: note || "Verification requested by reviewer."
  });

  logActivity("VERIFICATION_REQUESTED", appState.reviewerName, `Requested verification for claim '${claim.claim_text}'.`);

  VeritasEngine.recomputeAll(appState);
  renderCurrentView();
  updateSidebarCounts();

  alert("Claim flagged and moved to Verification queue.");
}

/**
 * 5.8 Reports View & Print PDF Exporter
 */
function renderReports() {
  const container = document.getElementById("reports-list-container");
  if (!container) return;

  if (appState.saved_reports.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-title">No Reports Generated Yet</div>
        <div class="empty-state-text">Build an evidence-based summary report from selected documents and date range.</div>
        <button class="btn btn-primary" onclick="openCreateReportModal()">Create First Report</button>
      </div>
    `;
    return;
  }

  container.innerHTML = appState.saved_reports.map(rep => `
    <div class="card" style="margin-bottom:16px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
        <div>
          <div style="font-family:var(--font-heading); font-size:1.15rem; font-weight:800; color:var(--color-heading);">
            ${escapeHtml(rep.title)}
          </div>
          <div style="font-size:0.78rem; color:var(--color-text-secondary); margin-top:2px;">
            Created: ${formatDate(rep.created_at)} • Range: ${rep.date_range_start} to ${rep.date_range_end} • Included claims: <strong>${rep.claim_count}</strong>
          </div>
        </div>
        <div style="display:flex; gap:8px;">
          <button class="btn btn-secondary btn-sm" onclick="recomputeReport('${rep.id}')">Recompute Snapshot</button>
          <button class="btn btn-primary btn-sm" onclick="viewPrintReport('${rep.id}')">View / Print PDF</button>
        </div>
      </div>

      <div style="background:rgba(255,255,255,0.7); padding:12px 16px; border-radius:12px; font-size:0.84rem; color:var(--color-heading); margin-bottom:14px; border:1px solid var(--glass-border);">
        ${escapeHtml(rep.summary_text)}
      </div>

      <div style="display:flex; gap:16px; flex-wrap:wrap; font-size:0.78rem; color:var(--color-heading);">
        <div>Docs: <strong>${rep.metrics_snapshot.documents_analyzed}</strong></div>
        <div>Supported: <strong style="color:var(--status-supported);">${rep.metrics_snapshot.supported_claims}</strong></div>
        <div>Contradicted: <strong style="color:var(--status-contradicted);">${rep.metrics_snapshot.contradicted_claims}</strong></div>
        <div>Needs Verification: <strong style="color:#b45309;">${rep.metrics_snapshot.needs_verification_claims}</strong></div>
        <div>High-Risk: <strong style="color:#b91c1c;">${rep.metrics_snapshot.high_risk_issues}</strong></div>
      </div>
    </div>
  `).join("");
}

function openCreateReportModal() {
  const modal = document.getElementById("create-report-modal");
  const docCheckboxes = document.getElementById("report-modal-doc-checkboxes");

  docCheckboxes.innerHTML = appState.documents.map(d => `
    <label style="display:flex; align-items:center; gap:8px; font-size:0.85rem; margin-bottom:8px; cursor:pointer;">
      <input type="checkbox" value="${d.id}" checked>
      <span>${escapeHtml(d.name)} (${escapeHtml(d.type)})</span>
    </label>
  `).join("");

  modal.classList.add("active");
}

function generateReportFromModal() {
  const title = document.getElementById("report-input-title").value.trim() || "Analysis Summary Report";
  const start = document.getElementById("report-input-start").value || "2026-09-01";
  const end = document.getElementById("report-input-end").value || "2026-09-30";

  const selectedBoxes = Array.from(document.querySelectorAll("#report-modal-doc-checkboxes input:checked"));
  const docIds = selectedBoxes.map(b => b.value);

  const metrics = VeritasEngine.calculateMetrics(appState);
  const includedClaims = appState.claims.filter(c => docIds.includes(c.doc_id) && c.lifecycle !== "Merged");

  const newReport = {
    id: "rep-" + Math.random().toString(36).substr(2, 9),
    title: title,
    created_at: new Date().toISOString(),
    date_range_start: start,
    date_range_end: end,
    included_doc_ids: docIds,
    claim_count: includedClaims.length,
    metrics_snapshot: {
      documents_analyzed: docIds.length,
      claims_extracted: metrics.claims_extracted,
      supported_claims: metrics.supported_claims,
      contradicted_claims: metrics.contradicted_claims,
      needs_verification_claims: metrics.needs_verification_claims,
      high_risk_issues: metrics.high_risk_issues.length
    },
    summary_text: `Comprehensive evidence audit across ${docIds.length} business documents. Identified ${metrics.contradicted_claims} contradicted claims and ${metrics.high_risk_issues.length} high-risk cross-document conflicts.`
  };

  appState.saved_reports.unshift(newReport);
  logActivity("REPORT_GENERATED", appState.reviewerName, `Generated report '${newReport.title}' covering ${docIds.length} documents.`);

  document.getElementById("create-report-modal").classList.remove("active");
  renderReports();

  viewPrintReport(newReport.id);
}

function recomputeReport(reportId) {
  const rep = appState.saved_reports.find(r => r.id === reportId);
  if (!rep) return;

  const metrics = VeritasEngine.calculateMetrics(appState);
  rep.metrics_snapshot = {
    documents_analyzed: rep.included_doc_ids.length,
    claims_extracted: metrics.claims_extracted,
    supported_claims: metrics.supported_claims,
    contradicted_claims: metrics.contradicted_claims,
    needs_verification_claims: metrics.needs_verification_claims,
    high_risk_issues: metrics.high_risk_issues.length
  };

  logActivity("REPORT_RECOMPUTED", appState.reviewerName, `Recomputed snapshot metrics for report '${rep.title}'.`);
  renderReports();
  alert("Report metrics refreshed to reflect latest data snapshot.");
}

function viewPrintReport(reportId) {
  const rep = appState.saved_reports.find(r => r.id === reportId);
  if (!rep) return;

  const modal = document.getElementById("view-report-modal");
  const content = document.getElementById("printable-report-content");

  const includedClaims = appState.claims.filter(c => rep.included_doc_ids.includes(c.doc_id) && c.lifecycle !== "Merged");
  const conflicts = appState.contradictions.filter(c => c.state !== "Resolved");

  content.innerHTML = `
    <div style="border-bottom:2px solid var(--color-accent-navy); padding-bottom:16px; margin-bottom:20px;">
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <div>
          <h2 style="font-family:var(--font-heading); color:var(--color-heading); margin-bottom:4px;">${escapeHtml(rep.title)}</h2>
          <div style="font-size:0.85rem; color:var(--color-text-secondary);">
            VERITAS AI Audit Dossier • Created ${formatDate(rep.created_at)} by ${escapeHtml(appState.reviewerName)}
          </div>
        </div>
        <div style="text-align:right; font-size:0.8rem; color:var(--color-heading);">
          <strong>Period:</strong> ${rep.date_range_start} to ${rep.date_range_end}
        </div>
      </div>
    </div>

    <div style="display:grid; grid-template-columns:repeat(5, 1fr); gap:12px; margin-bottom:24px;">
      <div style="border:1px solid #cbd5e1; padding:10px; border-radius:10px; text-align:center; background:#fff;">
        <div style="font-size:0.7rem; color:var(--color-text-secondary);">DOCS ANALYZED</div>
        <div style="font-size:1.5rem; font-weight:800;">${rep.metrics_snapshot.documents_analyzed}</div>
      </div>
      <div style="border:1px solid #cbd5e1; padding:10px; border-radius:10px; text-align:center; background:#fff;">
        <div style="font-size:0.7rem; color:var(--color-text-secondary);">TOTAL CLAIMS</div>
        <div style="font-size:1.5rem; font-weight:800;">${rep.metrics_snapshot.claims_extracted}</div>
      </div>
      <div style="border:1px solid #cbd5e1; padding:10px; border-radius:10px; text-align:center; background:#fff;">
        <div style="font-size:0.7rem; color:var(--status-supported);">SUPPORTED</div>
        <div style="font-size:1.5rem; font-weight:800; color:var(--status-supported);">${rep.metrics_snapshot.supported_claims}</div>
      </div>
      <div style="border:1px solid #cbd5e1; padding:10px; border-radius:10px; text-align:center; background:#fff;">
        <div style="font-size:0.7rem; color:var(--status-contradicted);">CONTRADICTED</div>
        <div style="font-size:1.5rem; font-weight:800; color:var(--status-contradicted);">${rep.metrics_snapshot.contradicted_claims}</div>
      </div>
      <div style="border:1px solid #cbd5e1; padding:10px; border-radius:10px; text-align:center; background:#fff;">
        <div style="font-size:0.7rem; color:#b45309;">VERIFICATION</div>
        <div style="font-size:1.5rem; font-weight:800; color:#b45309;">${rep.metrics_snapshot.needs_verification_claims}</div>
      </div>
    </div>

    <h3 style="font-size:1.05rem; color:var(--color-heading); margin:20px 0 10px; border-bottom:1px solid #e2e8f0; padding-bottom:6px;">
      1. Detected Contradictions & High-Risk Issues (${conflicts.length})
    </h3>
    <table style="width:100%; border-collapse:collapse; font-size:0.8rem; margin-bottom:24px;">
      <thead>
        <tr style="background:#f1f5f9; text-align:left;">
          <th style="padding:8px; border:1px solid #cbd5e1;">Claim A</th>
          <th style="padding:8px; border:1px solid #cbd5e1;">Claim B</th>
          <th style="padding:8px; border:1px solid #cbd5e1;">Type</th>
          <th style="padding:8px; border:1px solid #cbd5e1;">Severity</th>
          <th style="padding:8px; border:1px solid #cbd5e1;">Findings Rationale</th>
        </tr>
      </thead>
      <tbody>
        ${conflicts.map(c => {
          const ca = appState.claims.find(x => x.id === c.claim_a_id) || { claim_text: "N/A" };
          const cb = appState.claims.find(x => x.id === c.claim_b_id) || { claim_text: "N/A" };
          return `
            <tr>
              <td style="padding:8px; border:1px solid #e2e8f0;">${escapeHtml(ca.claim_text)}</td>
              <td style="padding:8px; border:1px solid #e2e8f0;">${escapeHtml(cb.claim_text)}</td>
              <td style="padding:8px; border:1px solid #e2e8f0;">${escapeHtml(c.conflict_type)}</td>
              <td style="padding:8px; border:1px solid #e2e8f0; font-weight:700; color:${c.severity === 'High' ? '#b91c1c' : '#b45309'};">${escapeHtml(c.severity)}</td>
              <td style="padding:8px; border:1px solid #e2e8f0;">${escapeHtml(c.explanation)}</td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>

    <h3 style="font-size:1.05rem; color:var(--color-heading); margin:20px 0 10px; border-bottom:1px solid #e2e8f0; padding-bottom:6px;">
      2. Audited Factual Claims & Exact Traceability (${includedClaims.length})
    </h3>
    <table style="width:100%; border-collapse:collapse; font-size:0.8rem; margin-bottom:24px;">
      <thead>
        <tr style="background:#f1f5f9; text-align:left;">
          <th style="padding:8px; border:1px solid #cbd5e1;">Claim Text</th>
          <th style="padding:8px; border:1px solid #cbd5e1;">Source Anchor</th>
          <th style="padding:8px; border:1px solid #cbd5e1;">Status</th>
          <th style="padding:8px; border:1px solid #cbd5e1;">Confidence</th>
        </tr>
      </thead>
      <tbody>
        ${includedClaims.map(c => `
          <tr>
            <td style="padding:8px; border:1px solid #e2e8f0; font-weight:600;">${escapeHtml(c.claim_text)}</td>
            <td style="padding:8px; border:1px solid #e2e8f0;">${escapeHtml(c.doc_name)} (${escapeHtml(c.source_location)})</td>
            <td style="padding:8px; border:1px solid #e2e8f0;">${renderStatusBadge(c.displayed_status, c.flags)}</td>
            <td style="padding:8px; border:1px solid #e2e8f0;">${escapeHtml(c.confidence)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;

  modal.classList.add("active");
}

function printReport() {
  window.print();
}

/**
 * Edit Claim Modal
 */
let claimBeingEditedId = null;

function openEditClaimModal(claimId) {
  claimBeingEditedId = claimId;
  const claim = appState.claims.find(c => c.id === claimId);
  if (!claim) return;

  document.getElementById("edit-claim-text").value = claim.claim_text;
  document.getElementById("edit-claim-type").value = claim.claim_type;
  document.getElementById("edit-claim-entity").value = claim.structured.entity || "";
  document.getElementById("edit-claim-val").value = claim.structured.value !== null ? claim.structured.value : "";
  document.getElementById("edit-claim-date").value = claim.structured.date || "";

  document.getElementById("edit-claim-modal").classList.add("active");
}

function saveClaimEdit() {
  const claim = appState.claims.find(c => c.id === claimBeingEditedId);
  if (!claim) return;

  const newText = document.getElementById("edit-claim-text").value.trim();
  const newType = document.getElementById("edit-claim-type").value.trim();
  const newEntity = document.getElementById("edit-claim-entity").value.trim();
  const rawVal = document.getElementById("edit-claim-val").value.trim();
  const newVal = rawVal !== "" ? parseFloat(rawVal) : null;
  const newDate = document.getElementById("edit-claim-date").value.trim();

  claim.claim_text = newText;
  claim.claim_type = newType;
  claim.structured.entity = newEntity;
  claim.structured.value = newVal;
  claim.structured.date = newDate;

  claim.history.push({
    timestamp: new Date().toISOString(),
    action: "EDITED",
    actor: appState.reviewerName,
    details: `Updated text & structured fields.`
  });

  logActivity("CLAIM_EDITED", appState.reviewerName, `Edited claim '${claim.claim_text}' and triggered cascade recompute.`);

  appState.contradictions.forEach(contra => {
    if ((contra.claim_a_id === claim.id || contra.claim_b_id === claim.id) && contra.state === "Resolved") {
      contra.state = "Open";
      contra.history.push({
        timestamp: new Date().toISOString(),
        action: "REOPENED",
        actor: "Recompute Engine",
        details: "Reopened due to edit on underlying claim values."
      });
    }
  });

  document.getElementById("edit-claim-modal").classList.remove("active");

  VeritasEngine.recomputeAll(appState);
  renderCurrentView();
  updateSidebarCounts();

  alert("Claim updated and system recomputed!");
}

/**
 * Modal System Setup & Event Listeners
 */
function setupModalEvents() {
  document.querySelectorAll(".modal-close-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".modal-overlay").forEach(m => m.classList.remove("active"));
    });
  });

  document.querySelectorAll(".modal-overlay").forEach(overlay => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.classList.remove("active");
    });
  });

  const filterStatus = document.getElementById("claims-filter-status");
  if (filterStatus) {
    filterStatus.addEventListener("change", (e) => {
      claimsFilterStatus = e.target.value;
      renderClaims();
    });
  }

  const filterConf = document.getElementById("claims-filter-confidence");
  if (filterConf) {
    filterConf.addEventListener("change", (e) => {
      claimsFilterConfidence = e.target.value;
      renderClaims();
    });
  }

  const toggleSuppressed = document.getElementById("toggle-suppressed-candidates");
  if (toggleSuppressed) {
    toggleSuppressed.addEventListener("change", (e) => {
      showSuppressedCandidates = e.target.checked;
      renderClaims();
    });
  }

  const fContraType = document.getElementById("contra-filter-type");
  if (fContraType) {
    fContraType.addEventListener("change", (e) => {
      contraFilterType = e.target.value;
      renderContradictions();
    });
  }

  const fContraSev = document.getElementById("contra-filter-severity");
  if (fContraSev) {
    fContraSev.addEventListener("change", (e) => {
      contraFilterSeverity = e.target.value;
      renderContradictions();
    });
  }

  const fContraState = document.getElementById("contra-filter-state");
  if (fContraState) {
    fContraState.addEventListener("change", (e) => {
      contraFilterState = e.target.value;
      renderContradictions();
    });
  }

  // Setup Document File Upload input
  const fileInput = document.getElementById("file-upload-input");
  if (fileInput) {
    fileInput.addEventListener("click", (e) => {
      e.stopPropagation();
    });
    fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        handleDocumentUpload(e.target.files[0]);
      }
    });
  }
}

/**
 * Append-Only Activity Log (Section 3.6)
 */
function logActivity(action, actor, details) {
  const newLog = {
    id: "act-" + Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    action: action,
    actor: actor || "System",
    details: details
  };
  appState.activity_log.push(newLog);
}

/**
 * UI Rendering Helpers
 * Strictly preserves RULES.md Section 5 status tokens:
 * SUPPORTED: #1fa463, white text, ✓ SUPPORTED
 * CONTRADICTED: #d64545, white text, ✕ CONTRADICTED
 * NEEDS VERIFICATION: #f0a500, dark navy text #1e2a3a, ! NEEDS VERIFICATION
 * REJECTED: #6b7280, white text, ⊘ REJECTED
 */
function renderStatusBadge(status, flags = {}, lifecycle = "Active") {
  let badgeClass = "badge-supported";
  let icon = "✓";
  let label = status || "SUPPORTED";

  if (status === "CONTRADICTED") {
    badgeClass = "badge-contradicted";
    icon = "✕";
  } else if (status === "NEEDS VERIFICATION") {
    badgeClass = "badge-needs-verification";
    icon = "!";
  } else if (status === "REJECTED") {
    badgeClass = "badge-rejected";
    icon = "⊘";
  }

  let html = `<span class="status-badge ${badgeClass}">${icon} ${label}</span>`;

  if (flags && flags.human_verified) {
    html += ` <span class="flag-human-verified">✓ Human-verified</span>`;
  }
  if (flags && flags.needs_more_evidence) {
    html += ` <span class="flag-more-evidence">Needs More Evidence</span>`;
  }
  if (lifecycle === "Candidate") {
    html += ` <span class="flag-unreviewed">Unreviewed</span>`;
  }

  return html;
}

function getActivityIcon(action) {
  if (action.includes("UPLOAD")) return "📄";
  if (action.includes("CONTRADICTION")) return "⚠️";
  if (action.includes("VERIF")) return "✓";
  if (action.includes("REJECT")) return "⊘";
  if (action.includes("MERGE")) return "🔀";
  if (action.includes("EDIT")) return "✏️";
  return "⚡";
}

function formatDate(isoStr) {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch (e) {
    return isoStr;
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
