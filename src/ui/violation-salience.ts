// Orders violations within a severity group so the most consumer-salient
// observations (vermin, sewage, mold, hand hygiene) appear first instead
// of DBPR's alphabetical order, which buries them under administrative
// items. Ordering only — the UI never labels or scores violations, per
// the neutral-language principle in CLAUDE.md.
//
// Tiers use DBPR's standard observation phrasing and are deliberately a
// small, explainable keyword list (same philosophy as the matcher).

const TIERS: Array<{ score: number; patterns: RegExp[] }> = [
  {
    // Live pests and their evidence
    score: 3,
    patterns: [
      /roach/i,
      /rodent/i,
      /\brats?\b/i,
      /\bmice\b/i,
      /\bmouse\b/i,
      /droppings/i,
      /\bfl(y|ies)\b/i,
      /vermin/i,
      /\bpests?\b/i,
      /insect/i,
    ],
  },
  {
    // Contamination and hand hygiene
    score: 2,
    patterns: [
      /sewage/i,
      /wastewater/i,
      /mold/i,
      /mildew/i,
      /slime/i,
      /handwash/i,
      /wash(ing)?\s+hands/i,
      /bare[-\s]hand/i,
      /raw\s+animal\s+food/i,
    ],
  },
  {
    // Soiled surfaces and temperature control
    score: 1,
    patterns: [
      /soiled/i,
      /time\/temperature/i,
      /accumulat/i,
      /build[-\s]?up/i,
    ],
  },
];

export function salienceScore(description: string): number {
  for (const tier of TIERS) {
    if (tier.patterns.some((p) => p.test(description))) return tier.score;
  }
  return 0;
}
