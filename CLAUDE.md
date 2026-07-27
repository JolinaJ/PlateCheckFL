# PlateCheckFL

Chrome extension (Manifest V3) that displays restaurant inspection
information inline on Google Search result pages, using official public
records: Florida DBPR (Department of Business and Professional Regulation)
and NYC DOHMH (Department of Health and Mental Hygiene).

## Key principles

- Factual, neutral language only. Never use: safe, unsafe, clean, dirty,
  good, bad. Never assign our own grades, scores, or ratings. Official
  grades posted by an issuing authority (e.g. NYC DOHMH letter grades) are
  factual records — report them with attribution ("posted by NYC DOHMH"),
  never as our judgment. Florida issues no grades, so no grade is ever
  shown for Florida facilities.
- Match confidence must always be visible to the user.
- Name-only matches are labeled as partial/unconfirmed.
- No browser history collection. No sending page content to external servers.
- Never present a link as an official Florida DBPR record while in mock mode.
  All UI and documentation must state: "Demo data — official source not connected."
- All mock restaurants, addresses, license numbers, and violations must be
  fully fictional. Do not use real restaurant names.

## Approved product decisions

- Cards inject directly below matching Google Search restaurant results.
- No sidebar annotation.
- Silent when no match found — no "no data found" UI in Milestone 1.
- Visual direction (amended 2026-07-20): prominent and clearly branded —
  brand accent bar, logo, shadow, larger type — while remaining
  trustworthy and accessible. Content stays factual and neutral;
  prominence comes from visual weight, never from alarming language.
  Do not use color alone to communicate severity or confidence.
- Conservative, explainable weighted matching — no opaque fuzzy-matching libraries.
- Content script uses static declaration restricted to Google Search pages.
  No `activeTab` permission.
- No backend, database, settings page, AI provider,
  analytics, or Google Maps support.
- On-demand fetch to `myfloridalicense.com` is permitted for supplemental
  detail (e.g. individual violation descriptions) that cannot be bundled.
  Fetches must be lazy (user-initiated), scoped to that domain only, and
  must not send any user or page data.
- Added 2026-07-02: within each severity group, violations are ordered by a
  small, explainable keyword salience score (pests > contamination/hand
  hygiene > soiled surfaces/temperature > other) instead of DBPR's
  alphabetical order. Ordering only — the UI must never display labels,
  scores, or language derived from this ranking.
- Amended 2026-07-02: a minimal background service worker exists solely to
  proxy the on-demand fetch above (MV3 content scripts are subject to page
  CORS, and DBPR sends no CORS headers, so the fetch must run in an
  extension context). The worker must never hold state, make other network
  requests, or do anything besides this fetch proxying.
- Amended 2026-07-25: the service worker proxy is no longer DBPR-only. It
  now also proxies on-demand fetches to Columbus Public Health's
  EnvisionConnect portal (pressagent.envisionconnect.com), which likewise
  sends no CORS headers. The worker allow-lists both official hosts
  (myfloridalicense.com, pressagent.envisionconnect.com) and still does
  nothing but proxy those fetches — no state, no other network access.
- Added 2026-07-16: NYC is a second jurisdiction, ingested from the NYC
  Open Data DOHMH Restaurant Inspection Results dataset (43nn-pn8j).
  Severity fields hold each authority's own tiers (see
  src/types/extension.ts); UI labels always use the jurisdiction's official
  vocabulary (NYC: critical / not critical). On-demand NYC violation
  details are fetched directly from the Socrata API in the content script
  (it sends Access-Control-Allow-Origin: *); the service worker remains
  DBPR-only. Queens results often carry neighborhood names (e.g.
  "Flushing") that don't match the borough — those match on street
  evidence and surface as "likely", by design.
- Added 2026-07-22: sponsored local-pack rows (Google's "Sponsored"
  business listings with a real name and address) receive cards exactly
  like organic rows; the "Sponsored" label is stripped from extracted
  names. Pure text ads (headline + display URL, no address) are still
  skipped — ad copy is not a business listing.
- Added 2026-07-22: single-restaurant knowledge panels (searching for or
  selecting one specific restaurant) get a prominent card variant with
  identical structure and behavior to the list card (collapsed by
  default, same expandable sections), just larger. Visual weight only —
  content and language are identical to the standard card. Placement
  (verified against live Google DOM, resolvePanelInjection in
  src/content/parser.ts): the card is inserted as a full-width row
  directly *before* #center_col (a grid item in the #rcnt grid), spanning
  the content columns (grid-column 2 / -2) so it aligns with the
  restaurant title and sits beneath Google's panel media strip, above
  both result columns — reading as the panel's inspection footer, not a
  single-column search result. This applies to the full-width-header
  layout, where neither column contains the address. When the panel is
  inside #center_col (whole-page layout), the card injects after the panel
  wrapper instead. Amended 2026-07-26: when the panel lives in the
  right-hand rail (#rhs contains the address — a common single-business
  layout), the card is prepended *inside* #rhs, above the panel content,
  rather than spanning a full-width row above #center_col — otherwise it
  strands at the top left, visually detached from the panel it describes
  on the right. #rhs is itself a stable top-level grid item, so the
  re-render caveat below is satisfied. Do NOT anchor to a deep
  panel module: Google re-renders the knowledge panel after injection and
  displaces any card anchored inside it to the bottom of the page (the bug
  that made the panel card seem to disappear). #rcnt / #center_col are
  stable top-level containers that survive the re-render. Note: Google
  draws its own thin divider at the bottom of the panel media, so the card
  sits just below that line as the panel footer; placing it above the line
  requires injecting into the volatile media subtree, which the re-render
  breaks. List-view cards are never
  restyled by this; the prominent variant is exclusive to the panel
  context. The panel card injects even when the same restaurant already
  has a card in the local-pack list (dedupe is per-context).
- Added 2026-07-25: Columbus, Ohio is a third jurisdiction (j: "columbus").
  Unlike FL/NYC, Columbus publishes no inspection dates or violation counts
  in bulk. The bundled overview comes from the Columbus Public Health
  "Inspected Restaurants & Markets" ArcGIS layer
  (maps2.columbus.gov/.../Schemas/Health/MapServer/3) — clean matching
  fields plus a current permit status ("Standards Met" / "Under
  Enforcement") carried in `di`. Inspection date and critical violations
  are fetched on demand from the facility's EnvisionConnect record
  (pressagent.envisionconnect.com, keyed by the shared FACILITY_ID stored
  in `vid`) when a card is expanded — the same on-demand pattern as DBPR,
  via the service-worker proxy (the portal sends no CORS headers).
  Consequences of the missing bulk detail, by design: the collapsed card
  shows the permit status instead of date/violation badges (never a
  misleading "0 violations"), and `d`/`hp`/`im`/`ba` are empty/0 in the
  index. UI vocabulary uses Ohio's official tiers (critical / not critical)
  and always attributes status and records to Columbus Public Health.
  Coverage is Columbus + Worthington and interleaved suburb addresses (the
  ArcGIS food set); surrounding-county health districts (Franklin/Accela,
  Delaware/HealthSpace) are out of scope pending accessible sources.

## Tech stack

- TypeScript, Vite + CRXJS, Vitest
- Vanilla DOM with shadow DOM for style isolation
- No UI framework

## Project structure

- src/content/ — content script (DOM parsing, injection)
- src/matching/ — restaurant matching and normalization
- src/summary/ — plain-English summary generation from structured records
- src/ui/ — card component and styles
- src/types/ — TypeScript interfaces
- src/data/ — mock inspection dataset + DBPR index
- src/ingest/ — DBPR data download and parsing pipeline
- src/lookup/ — CLI lookup tool
- tests/ — unit tests
- data/raw/ — downloaded DBPR CSVs (gitignored)
- data/processed/ — processed JSON files (gitignored)

## Commands

- `npm run dev` — development build with HMR
- `npm run build` — production build to dist/
- `npm test` — run Vitest unit tests
- `npm run data:download` — download DBPR CSV extracts
- `npm run data:ingest` — parse CSVs and build extension index
- `npm run data:nyc` — download NYC dataset and build nyc-index.json
- `npm run data:columbus` — download Columbus ArcGIS layer and build columbus-index.json
- `npm run lookup` — CLI restaurant lookup

## Rules for AI contributors

- Do not add features beyond the current milestone scope
- Do not introduce abstractions for hypothetical future needs
- Run `npm test` before reporting any task complete
- When modifying the matcher, add test cases for the new behavior
- Card UI changes must be verified in Chrome on a real Google search page
- Never add `activeTab`. Host permissions must be narrowly scoped.
