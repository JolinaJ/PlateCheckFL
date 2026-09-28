import type { IndexedFacility, MatchConfidence } from "../types/extension.js";
import {
  generateSummary,
  formatDisposition,
  dispositionImpliesViolations,
} from "../summary/generator.js";
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

// Violations cited at the facility's latest inspection. Most authorities
// publish them split across severity tiers; Cincinnati publishes no tier
// at all, so its untiered count lives in `vt` (see IndexedFacility).
function violationCount(fac: IndexedFacility): number {
  if (fac.j === "cincinnati") return fac.vt ?? 0;
  return fac.hp + fac.im + fac.ba;
}

// Names the site the "View on …" link in the violations list opens, which is
// whatever buildSourceUrl() returns. Columbus never reaches that list
// (wireColumbusInspection has its own labels), and FDACS carries no count, so
// it gets no violations toggle.
function sourceSiteName(fac: IndexedFacility): string {
  if (fac.j === "nyc") return "ABC Eats";
  if (fac.j === "cincinnati") return "Cincinnati Open Data";
  return "DBPR";
}

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
  card.innerHTML = buildCardHTML(
    facility,
    confidence,
    coLocatedCount,
    sourceUrl,
    buildLookupUrl(facility)
  );
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

  const total = violationCount(facility);
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
          list.innerHTML = `<span class="platecheck-viol-error">Could not load violations. <a class="platecheck-source-link" href="${escHtml(url)}" target="_blank" rel="noopener">View on ${sourceSiteName(fac)}</a></span>`;
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
  if (violations.length === 0) {
    return `<p class="platecheck-viol-empty">No violation details found. <a class="platecheck-source-link" href="${escHtml(url)}" target="_blank" rel="noopener">View on ${sourceSiteName(fac)}</a></p>`;
  }

  // Group labels use the issuing authority's own vocabulary. Cincinnati
  // ranks violations in no way at all, so its list is a single unlabelled
  // group — inventing a heading here would be our judgment, not the
  // Health Department's record.
  const groups: Array<{
    key: "high" | "intermediate" | "basic" | "untiered";
    label: string;
  }> = fac.j === "cincinnati"
    ? [{ key: "untiered", label: "Violations cited" }]
    : fac.j === "nyc"
      ? [
          { key: "high", label: "Critical" },
          { key: "basic", label: "Not Critical" },
          { key: "untiered", label: "Critical flag: Not Applicable" },
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
              ${v.comments ? `<div class="platecheck-viol-comments"><span class="platecheck-viol-comments-label">Inspector notes:</span> ${escHtml(v.comments)}</div>` : ""}
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
  sourceUrl: string,
  lookupUrl: string | null
): string {
  const nyc = fac.j === "nyc";
  const columbus = fac.j === "columbus";
  const cincinnati = fac.j === "cincinnati";
  const fdacs = fac.j === "fdacs";
  // Cincinnati publishes violations with no severity tier, so it shows a
  // single untiered count in place of the per-tier rows and badges.
  const tiered = !columbus && !cincinnati && !fdacs;
  const disposition = formatDisposition(fac.di);
  const total = violationCount(fac);
  // The result says violations were cited but our derived count is 0: state
  // no count anywhere rather than a zero the record contradicts.
  const countMissing = total === 0 && dispositionImpliesViolations(fac);
  const summary = generateSummary(fac);
  const confidenceLabel = confidence === "confirmed" ? "Matched" : "Partial match";

  const idLabel = columbus
    ? "Facility ID"
    : nyc
      ? "CAMIS"
      : fdacs
        ? "Permit"
        : "License";

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
        ${columbus || fdacs ? "" : buildViolationBadges(fac, total)}
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
        <span class="platecheck-detail-label">${columbus ? "Status" : nyc ? "Action" : cincinnati ? "Result" : fdacs ? "Most recent inspection" : "Disposition"}</span>
        <span class="platecheck-detail-value">${escHtml(fac.di)}${columbus ? " (Columbus Public Health)" : cincinnati ? " (Cincinnati Health Department)" : fdacs ? " (FDACS)" : ""}</span>
        ${nyc && (fac.g === "A" || fac.g === "B" || fac.g === "C") ? `
        <span class="platecheck-detail-label">Posted grade</span>
        <span class="platecheck-detail-value">${escHtml(fac.g)} (posted by NYC DOHMH)</span>
        ` : ""}
        ${cincinnati && !countMissing ? `
        <span class="platecheck-detail-label">Violations</span>
        <span class="platecheck-detail-value">${total} cited at this inspection</span>
        ` : ""}
        ${!tiered || countMissing ? "" : `
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
        <span class="platecheck-detail-value">${fac.ic} on record</span>
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
        ${fdacs ? `
        FDACS inspection reports are historical snapshots reflecting
        conditions observed on the date of inspection. FDACS publishes the
        inspection result and date only — no violation counts, no severity
        ranking, and no grade — and establishments are not graded or rated.
        ` : cincinnati ? `
        Cincinnati Health Department inspection records are historical
        snapshots reflecting conditions observed on the date of inspection.
        Violations are published without a severity ranking, and
        establishments are not graded or scored.
        ` : columbus ? `
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
          ${fdacs ? "Look up this permit on the official FDACS inspection search" : cincinnati ? "View official Cincinnati Health Department records" : columbus ? "View official Columbus Public Health inspection record" : nyc ? "View official NYC inspection results (ABC Eats)" : "View official DBPR inspection record"}
        </a>
        <br>
        <a class="platecheck-source-link platecheck-terms-link" href="${DISCLAIMER_URL}"
           target="_blank" rel="noopener">Disclaimer and terms of use</a>
        ${lookupUrl ? `
        <br>
        <a class="platecheck-source-link platecheck-lookup-link" href="${escHtml(lookupUrl)}"
           target="_blank" rel="noopener">
          Search by name on the Cincinnati Enquirer's inspection database
        </a>
        <span class="platecheck-lookup-note">Not an official record — a news organization's database, compiled from area health departments.</span>
        ` : ""}
      </div>
    </div>
  `;
}

// The full terms live outside the card on purpose. Legal text long enough to
// actually mean something cannot be read inside a Google result row, and
// repeating it on every card trains people to scroll past it. One durable
// link, on every surface, to a document with a revision history.
export const DISCLAIMER_URL =
  "https://github.com/JolinaJ/PlateCheckFL/blob/main/DISCLAIMER.md";

export function buildSourceUrl(fac: IndexedFacility): string {
  if (fac.j === "fdacs") {
    // FDACS publishes no per-entity permalink -- its portal is a stateful
    // ASP.NET search that cannot be deep-linked -- so this points at the
    // search itself, the same approach used for NYC and Cincinnati.
    return "https://foodpermit.fdacs.gov/Reports/SearchFoodEntity.aspx";
  }
  if (fac.j === "cincinnati") {
    // The Health Department publishes no per-facility record page; its
    // Food Safety Program dataset is the official record, and it can be
    // filtered by licence number there.
    return "https://data.cincinnati-oh.gov/d/rg6p-b3h3";
  }
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

// A secondary, clearly-labelled lookup for jurisdictions whose authority
// publishes no per-facility record page. Cincinnati only: the city's own
// options are a 342K-row dataset landing page, a sign-in-walled dashboard,
// and an aggregate dashboard with no name search — none of which shows a
// reader the restaurant they clicked on. The Cincinnati Enquirer compiles
// area health department inspections into a name-searchable database,
// which does.
//
// This is NOT an official record and must never be labelled as one: it is
// a news organization's database, and the card says so next to the link.
// The official link above it stays the authority's own source.
export function buildLookupUrl(fac: IndexedFacility): string | null {
  if (fac.j !== "cincinnati") return null;
  return "https://data.cincinnati.com/restaurant-inspections/";
}

function buildGradeBadge(fac: IndexedFacility): string {
  if (fac.j !== "nyc") return "";
  if (fac.g === "A" || fac.g === "B" || fac.g === "C") {
    return `<span class="platecheck-grade" title="Letter grade posted by NYC DOHMH">NYC grade ${escHtml(fac.g)}</span>`;
  }
  if (fac.g === "P" || fac.g === "Z") {
    return `<span class="platecheck-grade" title="Grade pending, per NYC DOHMH">NYC grade pending</span>`;
  }
  return "";
}

// Header labels use the authority's own tier names in full.
function buildViolationBadges(fac: IndexedFacility, total: number): string {
  if (total === 0) {
    if (dispositionImpliesViolations(fac)) return "";
    return `<span class="platecheck-viol-badge" data-severity="none">0 violations</span>`;
  }
  // Cincinnati publishes no severity tier, so there is one neutral count
  // rather than a per-tier breakdown.
  if (fac.j === "cincinnati") {
    return `<span class="platecheck-violations"><span class="platecheck-viol-badge" data-severity="untiered">${total}<span class="platecheck-viol-label"> violation${total === 1 ? "" : "s"}</span></span></span>`;
  }
  const nyc = fac.j === "nyc";
  const parts: string[] = [];
  if (fac.hp > 0) {
    parts.push(`<span class="platecheck-viol-badge" data-severity="high">${fac.hp}<span class="platecheck-viol-label"> ${nyc ? "critical" : "high priority"}</span></span>`);
  }
  if (fac.im > 0) {
    parts.push(`<span class="platecheck-viol-badge" data-severity="intermediate">${fac.im}<span class="platecheck-viol-label"> intermediate</span></span>`);
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
