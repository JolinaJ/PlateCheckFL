import type { IndexedFacility, MatchConfidence } from "../types/extension.js";
import { createInspectionCard } from "../ui/card.js";

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
  if (placement === "before") {
    // entry is #center_col, a grid item in #rcnt. Span the content
    // columns (2 / -2 in Google's SRP grid) so the card becomes a
    // full-width row aligned with the restaurant title above it, instead
    // of being auto-placed into a single results-column cell. Inert if
    // the container is not a grid.
    card.style.gridColumn = "2 / -2";
    entry.before(card);
  } else if (placement === "prepend") {
    // entry is #rhs, the right-rail column holding the business panel.
    // Prepending puts the card at the top of that column, directly above
    // the panel it describes, rather than stranding it across the page.
    // A small gap keeps it off the panel's own top edge.
    card.style.marginBottom = "12px";
    entry.prepend(card);
  } else {
    entry.after(card);
  }
}

export function isAlreadyInjected(entry: Element): boolean {
  return entry.hasAttribute(INJECTED_ATTR);
}
