import type { IndexedFacility, MatchConfidence } from "../types/extension.js";
import { createInspectionCard } from "../ui/card.js";

const INJECTED_ATTR = "data-platecheck-injected";

export function injectCard(
  entry: Element,
  facility: IndexedFacility,
  confidence: MatchConfidence,
  coLocatedCount = 1
): void {
  if (entry.hasAttribute(INJECTED_ATTR)) return;
  entry.setAttribute(INJECTED_ATTR, "true");

  const card = createInspectionCard(facility, confidence, coLocatedCount);
  entry.after(card);
}

export function isAlreadyInjected(entry: Element): boolean {
  return entry.hasAttribute(INJECTED_ATTR);
}
