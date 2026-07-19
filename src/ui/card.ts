import type { IndexedFacility, MatchConfidence } from "../types/extension.js";
import { generateSummary, formatDisposition } from "../summary/generator.js";
import { fetchViolations, type ViolationDetail } from "./violation-fetcher.js";
import { salienceScore } from "./violation-salience.js";
import cardStyles from "./card.css?inline";

export function createInspectionCard(
  facility: IndexedFacility,
  confidence: MatchConfidence,
  coLocatedCount = 1
): HTMLElement {
  const host = document.createElement("div");
  host.className = "platecheck-host";
  const shadow = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = cardStyles;
  shadow.appendChild(style);

  const card = document.createElement("div");
  card.className = "platecheck-card";
  card.dataset.expanded = "false";

  const sourceUrl = buildSourceUrl(facility);
  card.innerHTML = buildCardHTML(facility, confidence, coLocatedCount, sourceUrl);
  shadow.appendChild(card);

  const header = card.querySelector(".platecheck-header")!;
  const toggleExpanded = () => {
    const expanded = card.dataset.expanded === "true";
    card.dataset.expanded = String(!expanded);
    header.setAttribute("aria-expanded", String(!expanded));
  };
  header.addEventListener("click", toggleExpanded);
  header.addEventListener("keydown", (e) => {
    const key = (e as KeyboardEvent).key;
    if (key === "Enter" || key === " ") {
      e.preventDefault();
      toggleExpanded();
    }
  });

  const total = facility.hp + facility.im + facility.ba;
  if (total > 0) {
    wireViolationsToggle(card, facility, sourceUrl, total);
  }

  return host;
}

function wireViolationsToggle(
  card: Element,
  fac: IndexedFacility,
  url: string,
  total: number
): void {
  const toggle = card.querySelector(
    ".platecheck-violations-toggle"
  ) as HTMLButtonElement | null;
  const list = card.querySelector(
    ".platecheck-violations-list"
  ) as HTMLElement | null;
  if (!toggle || !list) return;

  let fetched = false;

  toggle.addEventListener("click", async (e) => {
    e.stopPropagation();
    const expanded = toggle.getAttribute("aria-expanded") === "true";

    if (!expanded) {
      toggle.setAttribute("aria-expanded", "true");
      toggle.innerHTML = `Hide violations ▴`;
      list.hidden = false;

      if (!fetched) {
        fetched = true;
        list.innerHTML = `<span class="platecheck-viol-loading">Loading…</span>`;
        try {
          const violations = await fetchViolations(fac);
          list.innerHTML = renderViolationList(violations, url, fac);
        } catch {
          list.innerHTML = `<span class="platecheck-viol-error">Could not load violations. <a class="platecheck-source-link" href="${escHtml(url)}" target="_blank" rel="noopener">View on DBPR</a></span>`;
        }
      }
    } else {
      toggle.setAttribute("aria-expanded", "false");
      toggle.innerHTML = `Show violations (${total}) ▾`;
      list.hidden = true;
    }
  });
}

function renderViolationList(
  violations: ViolationDetail[],
  url: string,
  fac: IndexedFacility
): string {
  const sourceName = fac.j === "nyc" ? "NYC Open Data" : "DBPR";
  if (violations.length === 0) {
    return `<p class="platecheck-viol-empty">No violation details found. <a class="platecheck-source-link" href="${escHtml(url)}" target="_blank" rel="noopener">View on ${sourceName}</a></p>`;
  }

  // Group labels use the issuing authority's own vocabulary.
  const groups: Array<{
    key: "high" | "intermediate" | "basic";
    label: string;
  }> = fac.j === "nyc"
    ? [
        { key: "high", label: "Critical" },
        { key: "basic", label: "Not Critical" },
      ]
    : [
        { key: "high", label: "High Priority" },
        { key: "intermediate", label: "Intermediate" },
        { key: "basic", label: "Basic" },
      ];

  return groups
    .map(({ key, label }) => {
      const group = violations
        .filter((v) => v.priority === key)
        .sort((a, b) => salienceScore(b.description) - salienceScore(a.description));
      if (group.length === 0) return "";
      return `
        <div class="platecheck-viol-group" data-priority="${key}">
          <div class="platecheck-viol-group-header">${label}</div>
          ${group
            .map(
              (v) => `
            <div class="platecheck-viol-item">
              <div class="platecheck-viol-item-top">
                <span class="platecheck-viol-code">${escHtml(v.code)}</span>
                ${v.isRepeat ? `<span class="platecheck-viol-tag platecheck-viol-tag--repeat">Repeat</span>` : ""}
                ${v.correctedOnSite ? `<span class="platecheck-viol-tag platecheck-viol-tag--corrected">Corrected on site</span>` : ""}
              </div>
              <div class="platecheck-viol-desc">${escHtml(v.description)}</div>
            </div>
          `
            )
            .join("")}
        </div>
      `;
    })
    .join("");
}

function buildCardHTML(
  fac: IndexedFacility,
  confidence: MatchConfidence,
  coLocatedCount: number,
  sourceUrl: string
): string {
  const nyc = fac.j === "nyc";
  const disposition = formatDisposition(fac.di);
  const total = fac.hp + fac.im + fac.ba;
  const summary = generateSummary(fac);
  const confidenceLabel = confidence === "confirmed" ? "Matched" : "Partial match";

  return `
    <div class="platecheck-header" role="button" tabindex="0" aria-expanded="false" aria-label="Inspection info for ${escHtml(fac.n)}">
      <div class="platecheck-summary-line">
        <span class="platecheck-brand">
          <span class="platecheck-brand-dot"></span>
          PlateCheck
        </span>
        <span class="platecheck-date">${escHtml(fac.d)}</span>
        <span class="platecheck-disposition">${escHtml(disposition)}</span>
        ${buildGradeBadge(fac)}
        ${buildViolationBadges(fac, total)}
      </div>
      <span class="platecheck-confidence" data-level="${confidence}">${escHtml(confidenceLabel)}</span>
      <span class="platecheck-expand-icon" aria-hidden="true">▾</span>
    </div>
    <div class="platecheck-details">
      <div class="platecheck-detail-grid">
        <span class="platecheck-detail-label">Business</span>
        <span class="platecheck-detail-value">${escHtml(fac.n)}</span>
        <span class="platecheck-detail-label">${nyc ? "CAMIS" : "License"}</span>
        <span class="platecheck-detail-value">${escHtml(fac.ln)}</span>
        <span class="platecheck-detail-label">Address</span>
        <span class="platecheck-detail-value">${escHtml(fac.a)}, ${escHtml(fac.c)} ${escHtml(fac.z)}</span>
        <span class="platecheck-detail-label">${nyc ? "Borough" : "County"}</span>
        <span class="platecheck-detail-value">${escHtml(fac.co)}</span>
        <span class="platecheck-detail-label">Inspection</span>
        <span class="platecheck-detail-value">${escHtml(fac.t)} — ${escHtml(fac.d)}</span>
        <span class="platecheck-detail-label">${nyc ? "Action" : "Disposition"}</span>
        <span class="platecheck-detail-value">${escHtml(fac.di)}</span>
        ${nyc && (fac.g === "A" || fac.g === "B" || fac.g === "C") ? `
        <span class="platecheck-detail-label">Posted grade</span>
        <span class="platecheck-detail-value">${escHtml(fac.g)} (posted by NYC DOHMH)</span>
        ` : ""}
        <span class="platecheck-detail-label">${nyc ? "Critical" : "High priority"}</span>
        <span class="platecheck-detail-value">${fac.hp}</span>
        ${nyc ? "" : `
        <span class="platecheck-detail-label">Intermediate</span>
        <span class="platecheck-detail-value">${fac.im}</span>
        `}
        <span class="platecheck-detail-label">${nyc ? "Not critical" : "Basic"}</span>
        <span class="platecheck-detail-value">${fac.ba}</span>
        ${fac.ic > 1 ? `
        <span class="platecheck-detail-label">Inspections</span>
        <span class="platecheck-detail-value">${fac.ic} ${nyc ? "on record" : "in current fiscal year"}</span>
        ` : ""}
      </div>
      <div class="platecheck-summary-text">${escHtml(summary)}</div>
      ${total > 0 ? `
      <div class="platecheck-violations-section">
        <button class="platecheck-violations-toggle" aria-expanded="false">
          Show violations (${total}) ▾
        </button>
        <div class="platecheck-violations-list" hidden></div>
      </div>
      ` : ""}
      ${coLocatedCount > 1 ? `
      <div class="platecheck-colocated-note">
        ${coLocatedCount} licensed entities share this address (e.g. separate floors or units). Showing one of them.
      </div>
      ` : ""}
      <div class="platecheck-disclaimer">
        ${nyc ? `
        NYC DOHMH inspection records are historical snapshots reflecting
        conditions observed on the date of inspection. Letter grades shown
        are posted by NYC DOHMH.
        ` : `
        DBPR inspection records are historical snapshots reflecting conditions
        observed on the date of inspection. Establishments are not graded or rated.
        `}
        <br>
        <a class="platecheck-source-link" href="${escHtml(sourceUrl)}"
           target="_blank" rel="noopener">
          ${nyc ? "View official NYC inspection results (ABC Eats)" : "View official DBPR inspection record"}
        </a>
      </div>
    </div>
  `;
}

export function buildSourceUrl(fac: IndexedFacility): string {
  if (fac.j === "nyc") {
    // ABC Eats has no stable per-restaurant URL; link its official search.
    return "https://a816-health.nyc.gov/ABCEatsRestaurants/#!/Search";
  }
  if (fac.vid && fac.lid) {
    return `https://www.myfloridalicense.com/inspectionDetail.asp?InspVisitID=${encodeURIComponent(fac.vid)}&licid=${encodeURIComponent(fac.lid)}`;
  }
  return "https://www2.myfloridalicense.com/hotels-restaurants/public-records/";
}

function buildGradeBadge(fac: IndexedFacility): string {
  if (fac.j !== "nyc") return "";
  if (fac.g === "A" || fac.g === "B" || fac.g === "C") {
    return `<span class="platecheck-grade">Grade ${escHtml(fac.g)}</span>`;
  }
  if (fac.g === "P" || fac.g === "Z") {
    return `<span class="platecheck-grade">Grade pending</span>`;
  }
  return "";
}

function buildViolationBadges(fac: IndexedFacility, total: number): string {
  if (total === 0) {
    return `<span class="platecheck-viol-badge" data-severity="none">0 violations</span>`;
  }
  const nyc = fac.j === "nyc";
  const parts: string[] = [];
  if (fac.hp > 0) {
    parts.push(`<span class="platecheck-viol-badge" data-severity="high">${fac.hp}<span class="platecheck-viol-label"> ${nyc ? "critical" : "high"}</span></span>`);
  }
  if (fac.im > 0) {
    parts.push(`<span class="platecheck-viol-badge" data-severity="intermediate">${fac.im}<span class="platecheck-viol-label"> intermed.</span></span>`);
  }
  if (fac.ba > 0) {
    parts.push(`<span class="platecheck-viol-badge" data-severity="basic">${fac.ba}<span class="platecheck-viol-label"> ${nyc ? "not critical" : "basic"}</span></span>`);
  }
  return `<span class="platecheck-violations">${parts.join("")}</span>`;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
