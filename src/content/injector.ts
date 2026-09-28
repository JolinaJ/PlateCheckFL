import type {
  AuthorityScope,
  IndexedFacility,
  MatchConfidence,
  NoMatchReason,
} from "../types/extension.js";
import { createInspectionCard } from "../ui/card.js";
import { createNoMatchNote } from "../ui/no-match-note.js";

const INJECTED_ATTR = "data-platecheck-injected";

export function injectCard(
  entry: Element,
  facility: IndexedFacility,
  confidence: MatchConfidence,
  coLocatedCount = 1,
  prominent = false,
  placement: "after" | "before" | "prepend" = "after"
): void {
  if (entry.hasAttribute(INJECTED_ATTR)) return;
  entry.setAttribute(INJECTED_ATTR, "true");

  const card = createInspectionCard(facility, confidence, coLocatedCount, prominent);
  place(entry, card, placement);
}

export function isAlreadyInjected(entry: Element): boolean {
  return entry.hasAttribute(INJECTED_ATTR);
}

// Where PlateCheck output goes for a given layout. Cards and no-match
// notes share this so the two can never disagree about placement.
//
//   before  — entry is #center_col, a grid item in #rcnt. Span the content
//             columns (2 / -2 in Google's SRP grid) to become a full-width
//             row aligned with the restaurant title above, instead of being
//             auto-placed into a single results-column cell. Inert if the
//             container is not a grid.
//   prepend — entry is #rhs, the right-rail column holding the business
//             panel. Prepending puts the output at the top of that column,
//             directly above the panel it describes, rather than stranding
//             it across the page. A small gap keeps it off the panel's own
//             top edge.
//   after   — the ordinary list-row case.
function place(
  entry: Element,
  node: HTMLElement,
  placement: "after" | "before" | "prepend"
): void {
  if (placement === "before") {
    node.style.gridColumn = "2 / -2";
    entry.before(node);
  } else if (placement === "prepend") {
    node.style.marginBottom = "12px";
    entry.prepend(node);
  } else {
    entry.after(node);
  }
}

// Shown when a listing produced no confident match, in place of a card.
// Marks the entry with the same attribute a card would, so the two paths
// cannot both fire for one entry and the dedupe check in the content
// script behaves identically either way. `scope` picks whose official
// search the note links (see authoritiesForQuery in the matcher).
export function injectNoMatchNote(
  entry: Element,
  reason: NoMatchReason,
  coverage: string,
  scope: AuthorityScope,
  prominent = false,
  placement: "after" | "before" | "prepend" = "after"
): void {
  if (entry.hasAttribute(INJECTED_ATTR)) return;
  entry.setAttribute(INJECTED_ATTR, "true");
  place(entry, createNoMatchNote(reason, coverage, scope, prominent), placement);
}
