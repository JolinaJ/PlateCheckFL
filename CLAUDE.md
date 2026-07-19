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
- Visual direction: quiet, trustworthy, lightly branded, accessible.
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
- `npm run lookup` — CLI restaurant lookup

## Rules for AI contributors

- Do not add features beyond the current milestone scope
- Do not introduce abstractions for hypothetical future needs
- Run `npm test` before reporting any task complete
- When modifying the matcher, add test cases for the new behavior
- Card UI changes must be verified in Chrome on a real Google search page
- Never add `activeTab`. Host permissions must be narrowly scoped.
