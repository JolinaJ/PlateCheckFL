import type { AuthorityScope, Jurisdiction, NoMatchReason } from "../types/extension.js";
import { DISCLAIMER_URL } from "./card.js";
import { AUTHORITY_SEARCH } from "./authority-search.js";
import cardStyles from "./card.css?inline";
import logoUrl from "../../icons/icon48.png";

// The note shown in place of a card when a listing produced no match.
//
// Every string here describes OUR record set. None of them describes the
// restaurant. That distinction is the whole point of the feature: a reader
// who sees "no record" next to a business will infer something about the
// business unless the copy actively stops them, and there is nothing to
// infer — a place can be licensed under another name, fall under a
// different agency (Florida splits food service between DBPR, FDACS and
// the Department of Health), sit outside a bundled jurisdiction, or have
// opened since the last data refresh. Hence the disclaimer, which is not
// optional decoration but the reason this is safe to show at all.
//
// Neutrality rules from CLAUDE.md apply unchanged: no safe/unsafe,
// clean/dirty, good/bad, and no grade, score or severity of our own.

// Shown under every reason. This is the sentence that makes the whole
// feature safe to ship: without it, "no record" next to a business name
// invites a conclusion about the business, and there is none to draw.
export const NO_MATCH_DISCLAIMER =
  "This describes the license data available to this extension, not the " +
  "establishment. A business may be licensed under a different name, be " +
  "regulated by another agency, or have opened since the last data update. " +
  "No conclusion about this business should be drawn from the absence of a record.";

export interface NoMatchCopy {
  headline: string;
  detail: string;
}

// Exported so tests can assert on the wording. The note renders into a
// closed shadow root, which is deliberate for style isolation but makes
// the rendered text unreadable from outside — and this copy is the part
// of the feature most worth guarding against drift.
export function noMatchCopy(reason: NoMatchReason, coverage: string): NoMatchCopy {
  switch (reason) {
    case "out-of-area":
      return {
        headline: "Outside the covered area",
        detail: `This address is outside the areas in this build (${coverage}). No records were checked, because there is no record set here to check.`,
      };
    case "address-different-name":
      return {
        headline: "Record at this address is under another name",
        detail:
          "A license at this address is on file under a different name. It may be a former tenant, a separate business at the same address, or this establishment under its legal name — we cannot tell which, so no inspection record is shown.",
      };
    case "unit-mismatch":
      return {
        headline: "Could not confirm which unit",
        detail:
          "A license exists in this building, but it is registered to a different suite or unit than this listing gives. Shared addresses often hold several businesses, so no record is shown.",
      };
    case "low-confidence":
      return {
        headline: "Could not confirm a match",
        detail:
          "Records that partly resemble this listing were found, but the name and address evidence was not strong enough to identify which one it is. Rather than show a record that may belong to a different business, none is shown.",
      };
    case "no-address":
      return {
        headline: "Not enough address detail",
        detail:
          "This result does not include a street address. A business name on its own is not enough to identify one specific licensed location, so no record is shown.",
      };
    case "no-record":
    default:
      return {
        headline: "No matching record found",
        detail: "Nothing in the license data matches this name or address.",
      };
  }
}

// Where a reader goes to settle it themselves.
//
// This replaces an earlier "possible matches" list. Naming specific licensed
// establishments next to a listing we could NOT tie to them puts our guess
// in front of the reader as though it were a finding, and the records named
// belong to real businesses that never asked to appear there. The authority's
// own search has no such problem: it is the system of record, the reader
// drives it, and whatever they find they found at the source.
//
// Which authority comes from the matcher (authoritiesForQuery): the one whose
// records cover the listing's ZIP, every bundled one when the listing has no
// ZIP, none when the ZIP is outside every bundled area. The label says where
// OUR records come from, never who regulates this business: in Florida that
// could be DBPR, FDACS or the Department of Health.
export function selfSearchLabel(scope: AuthorityScope): string {
  const authorities = orderedAuthorities(scope);
  if (authorities.length === 0) return "";
  const records = scope.fromZip
    ? "The records PlateCheck checks for this area"
    : "The records PlateCheck checks";
  if (authorities.length === 1) {
    return `${records} come from ${AUTHORITY_SEARCH[authorities[0]].name}. You can search them directly by business name or address.`;
  }
  return `${records} come from these official sources. You can search them directly:`;
}

// Table order, known tags only, no repeats.
function orderedAuthorities(scope: AuthorityScope): Jurisdiction[] {
  return (Object.keys(AUTHORITY_SEARCH) as Jurisdiction[]).filter((j) =>
    scope.authorities.includes(j)
  );
}

function buildSelfSearch(scope: AuthorityScope): string {
  const authorities = orderedAuthorities(scope);
  // Out of area: no record set we bundle covers this listing, so there is
  // no source to point the reader at.
  if (authorities.length === 0) return "";
  // .platecheck-selfsearch is a grid, so each link sits on its own row.
  const links = authorities
    .map((j) => {
      const { link, url } = AUTHORITY_SEARCH[j];
      return `<a class="platecheck-source-link" href="${escHtml(url)}" target="_blank" rel="noopener">${escHtml(link)}</a>`;
    })
    .join("");
  return `
      <div class="platecheck-selfsearch">
        <span class="platecheck-selfsearch-label">${escHtml(selfSearchLabel(scope))}</span>
        ${links}
      </div>`;
}

// Collapsed by default with the same header/expand interaction as the
// inspection card, so a results page full of unmatched rows stays quiet.
// `scope` is required so no caller can fall back to naming one authority
// for every listing.
export function createNoMatchNote(
  reason: NoMatchReason,
  coverage: string,
  scope: AuthorityScope,
  prominent = false
): HTMLElement {
  const host = document.createElement("div");
  host.className = "platecheck-host";
  const shadow = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = cardStyles;
  shadow.appendChild(style);

  const card = document.createElement("div");
  card.className = "platecheck-card platecheck-card--nomatch";
  card.dataset.expanded = "false";
  card.dataset.variant = prominent ? "prominent" : "standard";
  card.dataset.reason = reason;

  const { headline, detail } = noMatchCopy(reason, coverage);

  card.innerHTML = `
    <div class="platecheck-header" role="button" tabindex="0" aria-expanded="false"
         aria-label="Why no inspection record is shown: ${escHtml(headline)}">
      <span class="platecheck-brand">
        <img class="platecheck-logo" src="${logoUrl}" alt="" aria-hidden="true">
        PlateCheck
      </span>
      <div class="platecheck-summary-line">
        <span class="platecheck-nomatch-headline">${escHtml(headline)}</span>
      </div>
      <span class="platecheck-confidence" data-level="none">No record shown</span>
      <span class="platecheck-expand-icon" aria-hidden="true">▾</span>
    </div>
    <div class="platecheck-details">
      <div class="platecheck-nomatch-detail">${escHtml(detail)}</div>
      ${buildSelfSearch(scope)}
      <div class="platecheck-disclaimer">
        ${escHtml(NO_MATCH_DISCLAIMER)}
        <br>
        <a class="platecheck-source-link platecheck-terms-link" href="${DISCLAIMER_URL}"
           target="_blank" rel="noopener">Disclaimer and terms of use</a>
      </div>
    </div>
  `;

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

  return host;
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
