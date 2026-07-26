import type { IndexedFacility, MatchConfidence } from "../types/extension.js";
import { generateSummary, formatDisposition } from "../summary/generator.js";
import {
  fetchViolations,
  fetchColumbusInspection,
  type ViolationDetail,
  type ColumbusInspection,
} from "./violation-fetcher.js";
import { salienceScore } from "./violation-salience.js";
import cardStyles from "./card.css?inline";
// The PlateCheck mark. Imported so the build inlines it as a data URI
// (icon48 is well under Vite's asset inline limit), keeping the card
// self-contained — no web_accessible_resources entry and no network or
// extension-URL fetch from the page.
import logoUrl from "../../icons/icon48.png";

// `prominent` renders the panel variant: identical structure and
// behavior to the standard card (collapsed by default, same expandable
// sections), just larger. Used when the user searched for or selected
// one specific restaurant (knowledge panel) rather than browsing a list.
export function createInspectionCard(
  facility: IndexedFacility,
  confidence: MatchConfidence,
  coLocatedCount = 1,
  prominent = false
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
  card.dataset.variant = prominent ? "prominent" : "standard";

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
  if (facility.j === "columbus") {
    // Columbus bundles no counts; the latest inspection + violations are
    // always fetched on demand, so the section is wired unconditionally.
    wireColumbusInspection(card, facility, sourceUrl);
  } else if (total > 0) {
    wireViolationsToggle(card, facility, sourceUrl, total);
  }

  return host;
}

// Columbus: on first expand, fetch the facility's EnvisionConnect record,
// then render its latest inspection date + critical violations and surface
// the discovered date in the header and detail grid (both blank until now).
function wireColumbusInspection(
  card: Element,
  fac: IndexedFacility,
  url: string
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
      toggle.innerHTML = `Hide latest inspection ▴`;
      list.hidden = false;

      if (!fetched) {
        fetched = true;
        list.innerHTML = `<span class="platecheck-viol-loading">Loading…</span>`;
        try {
          const insp = await fetchColumbusInspection(fac);
          list.innerHTML = renderColumbusInspection(insp, url);
          if (insp?.date) {
            const dateEl = card.querySelector(".platecheck-date");
            if (dateEl) dateEl.textContent = insp.date;
            const inspEl = card.querySelector(".platecheck-inspection-value");
            if (inspEl) {
              inspEl.textContent = insp.type
                ? `${insp.type} — ${insp.date}`
                : insp.date;
            }
          }
        } catch {
          list.innerHTML = `<span class="platecheck-viol-error">Could not load inspection. <a class="platecheck-source-link" href="${escHtml(url)}" target="_blank" rel="noopener">View on Columbus Public Health</a></span>`;
        }
      }
    } else {
      toggle.setAttribute("aria-expanded", "false");
      toggle.innerHTML = `Show latest inspection ▾`;
      list.hidden = true;
    }
  });
}

function renderColumbusInspection(
  insp: ColumbusInspection | null,
  url: string
): string {
  if (!insp) {
    return `<p class="platecheck-viol-empty">No inspection records found. <a class="platecheck-source-link" href="${escHtml(url)}" target="_blank" rel="noopener">View on Columbus Public Health</a></p>`;
  }

  const header = `<p class="platecheck-viol-empty">Latest inspection: ${escHtml(insp.date)}${insp.type ? " — " + escHtml(insp.type) : ""}.</p>`;

  // The portal details critical violations; Ohio's other tier is "not
  // critical". Report using that official vocabulary.
  const critical = insp.violations.filter((v) => v.priority === "high");
  if (critical.length === 0) {
    return (
      header +
      `<p class="platecheck-viol-empty">No critical violations cited at this inspection.</p>`
    );
  }

  const items = critical
    .sort((a, b) => salienceScore(b.description) - salienceScore(a.description))
    .map(
      (v) => `
      <div class="platecheck-viol-item">
        <div class="platecheck-viol-item-top">
          <span class="platecheck-viol-code">${escHtml(v.code)}</span>
        </div>
        <div class="platecheck-viol-desc">${escHtml(v.description)}</div>
        ${v.comments ? `<div class="platecheck-viol-comments"><span class="platecheck-viol-comments-label">Inspector notes:</span> ${escHtml(v.comments)}</div>` : ""}
      </div>`
    )
    .join("");

  return (
    header +
    `
    <div class="platecheck-viol-group" data-priority="high">
      <div class="platecheck-viol-group-header">Critical violations</div>
      ${items}
    </div>`
  );
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
  const columbus = fac.j === "columbus";
  const disposition = formatDisposition(fac.di);
  const total = fac.hp + fac.im + fac.ba;
  const summary = generateSummary(fac);
  const confidenceLabel = confidence === "confirmed" ? "Matched" : "Partial match";

  const idLabel = columbus ? "Facility ID" : nyc ? "CAMIS" : "License";

  return `
    <div class="platecheck-header" role="button" tabindex="0" aria-expanded="false" aria-label="Inspection info for ${escHtml(fac.n)}">
      <div class="platecheck-summary-line">
        <span class="platecheck-brand">
          <img class="platecheck-logo" src="${logoUrl}" alt="" aria-hidden="true">
          PlateCheck
        </span>
        <span class="platecheck-date">${escHtml(fac.d)}</span>
        <span class="platecheck-disposition">${escHtml(disposition)}</span>
        ${buildGradeBadge(fac)}
        ${columbus ? "" : buildViolationBadges(fac, total)}
      </div>
      <span class="platecheck-confidence" data-level="${confidence}">${escHtml(confidenceLabel)}</span>
      <span class="platecheck-expand-icon" aria-hidden="true">▾</span>
    </div>
    <div class="platecheck-details">
      <div class="platecheck-detail-grid">
        <span class="platecheck-detail-label">Business</span>
        <span class="platecheck-detail-value">${escHtml(fac.n)}</span>
        <span class="platecheck-detail-label">${idLabel}</span>
        <span class="platecheck-detail-value">${escHtml(fac.ln)}</span>
        <span class="platecheck-detail-label">Address</span>
        <span class="platecheck-detail-value">${escHtml(fac.a)}, ${escHtml(fac.c)} ${escHtml(fac.z)}</span>
        ${columbus ? "" : `
        <span class="platecheck-detail-label">${nyc ? "Borough" : "County"}</span>
        <span class="platecheck-detail-value">${escHtml(fac.co)}</span>
        `}
        <span class="platecheck-detail-label">Inspection</span>
        <span class="platecheck-detail-value platecheck-inspection-value">${columbus ? "Expand to load the latest inspection" : `${escHtml(fac.t)} — ${escHtml(fac.d)}`}</span>
        <span class="platecheck-detail-label">${columbus ? "Status" : nyc ? "Action" : "Disposition"}</span>
        <span class="platecheck-detail-value">${escHtml(fac.di)}${columbus ? " (Columbus Public Health)" : ""}</span>
        ${nyc && (fac.g === "A" || fac.g === "B" || fac.g === "C") ? `
        <span class="platecheck-detail-label">Posted grade</span>
        <span class="platecheck-detail-value">${escHtml(fac.g)} (posted by NYC DOHMH)</span>
        ` : ""}
        ${columbus ? "" : `
        <span class="platecheck-detail-label">${nyc ? "Critical" : "High priority"}</span>
        <span class="platecheck-detail-value">${fac.hp}</span>
        ${nyc ? "" : `
        <span class="platecheck-detail-label">Intermediate</span>
        <span class="platecheck-detail-value">${fac.im}</span>
        `}
        <span class="platecheck-detail-label">${nyc ? "Not critical" : "Basic"}</span>
        <span class="platecheck-detail-value">${fac.ba}</span>
        `}
        ${fac.ic > 1 ? `
        <span class="platecheck-detail-label">Inspections</span>
        <span class="platecheck-detail-value">${fac.ic} ${nyc ? "on record" : "in current fiscal year"}</span>
        ` : ""}
      </div>
      <div class="platecheck-summary-text">${escHtml(summary)}</div>
      ${total > 0 || columbus ? `
      <div class="platecheck-violations-section">
        <button class="platecheck-violations-toggle" aria-expanded="false">
          ${columbus ? "Show latest inspection ▾" : `Show violations (${total}) ▾`}
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
        ${columbus ? `
        Columbus Public Health inspection records are historical snapshots
        reflecting conditions observed on the date of inspection.
        Establishments are not graded or rated.
        ` : nyc ? `
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
          ${columbus ? "View official Columbus Public Health inspection record" : nyc ? "View official NYC inspection results (ABC Eats)" : "View official DBPR inspection record"}
        </a>
      </div>
    </div>
  `;
}

export function buildSourceUrl(fac: IndexedFacility): string {
  if (fac.j === "columbus") {
    return fac.vid
      ? `https://pressagent.envisionconnect.com/fac.phtml?agency=COL&forceresults=1&facid=${encodeURIComponent(fac.vid)}`
      : "https://pressagent.envisionconnect.com/main.phtml?agency=COL";
  }
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
