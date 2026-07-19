# CSS Isolation Strategy

## Approach: Shadow DOM

Each PlateCheck FL card is rendered inside a shadow DOM attached to a
host element injected below the Google Search result. This provides:

1. **Style encapsulation** — Google's CSS cannot affect card styling.
2. **No leakage** — Card styles cannot break Google's page layout.
3. **Scoped selectors** — No need for BEM, CSS modules, or prefixed class names.

## Implementation plan

- The injector creates a `<div>` host element positioned after the matched
  search result.
- A shadow root is attached with `mode: "closed"` to prevent page scripts
  from reaching into card internals.
- Card CSS is inlined within a `<style>` tag inside the shadow root.
- All card markup lives inside the shadow root.

## Accessibility

- Cards use semantic HTML (`<section>`, `<button>`, `<dl>` for data).
- Expand/collapse uses `aria-expanded`.
- Severity and confidence use text labels, not color alone.
- Sufficient color contrast ratios (WCAG AA minimum).
