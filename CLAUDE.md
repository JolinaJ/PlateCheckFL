# PlateCheckFL

Chrome extension (Manifest V3) that displays restaurant inspection
information inline on Google Search result pages (single-business
knowledge panels and classic local-pack rows) and Google Maps place
panels, using official public records from four authorities: Florida DBPR
(Department of Business and Professional Regulation), NYC DOHMH
(Department of Health and Mental Hygiene), Columbus Public Health, and the
Cincinnati Health Department. Florida FDACS (Department of Agriculture and
Consumer Services) has an ingest and an index file but is deliberately NOT
bundled (see src/data/index-set.florida.ts). Version 1.0.0 is the first
Chrome Web Store release (2026-09-27).

## Key principles

- Factual, neutral language only. Never use: safe, unsafe, clean, dirty,
  good, bad. Never assign our own grades, scores, ratings, or severity
  tiers — where an authority publishes no ranking (Cincinnati), report
  violations unranked rather than inferring one. Official
  grades posted by an issuing authority (e.g. NYC DOHMH letter grades) are
  factual records — report them with attribution ("posted by NYC DOHMH"),
  never as our judgment. Florida issues no grades, so no grade is ever
  shown for Florida facilities.
- Match confidence must always be visible to the user.
- Name-only matches are labeled as partial/unconfirmed.
- No browser history collection. No sending page content to external servers.
- There is no mock or demo mode in the extension. Every record shown comes
  from a bundled official index. Milestone 1 had one, under the rule that
  nothing could be presented as an official Florida DBPR record while it
  was active and every surface had to state "Demo data — official source
  not connected." Its fixture, src/data/mock-inspections.json, now survives
  only as test data for tests/matcher.test.ts. If a demo mode ever comes
  back, that rule comes back with it.
- All mock restaurants, addresses, license numbers, and violations must be
  fully fictional. Do not use real restaurant names.

## Approved product decisions

- Cards inject directly below matching Google Search restaurant results.
- No sidebar annotation.
- Amended 2026-08-21 (reverses "silent when no match found — no 'no data
  found' UI in Milestone 1"): a listing that produces no card now gets a
  no-match note in the card's place, saying why. The reason is classified
  by the matcher (`NoMatchReason` in src/types/extension.ts) into one of:
  out-of-area, address-different-name, unit-mismatch, low-confidence,
  no-address, no-record. Copy lives in one place, src/ui/no-match-note.ts.
  Two rules make this safe to show and must not be relaxed:
  (1) every string describes *our record set*, never the establishment —
  the absence of a matched record is not a fact about a restaurant, which
  may be licensed under another name, regulated by another agency
  (Florida splits food service across DBPR, FDACS and the Department of
  Health), or newer than the last refresh; the shared disclaimer saying
  exactly that is load-bearing, not decoration. (2) The note is visually
  subordinate to a real card — neutral grey accent, flat, no shadow —
  because the brand-blue bar is what signals "there is a record here".
  The "address-different-name" prose is explicitly hedged ("we cannot
  tell which") and never claims the occupant is the same business; the
  occupant itself is named in the candidate list below, not inline (that
  list was removed 2026-08-25, see the next entry, so the occupant is no
  longer named anywhere in the note).
  Coverage in the out-of-area copy is derived from the loaded
  index, not hardcoded, so a region-scoped mobile build names only what it
  ships. Out-of-area is established from the ZIP only — ZIPs are unique
  nationally, city names are not.
- Amended 2026-08-25 (REVERSES the 2026-08-21 "possible matches" list): the
  no-match note no longer names any near-miss record. The dropdown, the
  candidate rows, and the per-candidate official links are gone. Naming a
  licensed establishment beside a listing we could NOT tie to it puts our
  guess in front of the reader as if it were a finding, and the records named
  belong to real businesses that never asked to appear next to someone
  else's listing. In their place the note carries one link to the authority's
  own search, where the reader drives and anything found is found at the
  source. `noMatchCandidates` still exists and is still computed — it is
  logged to the console for matcher debugging, which is what it was always
  most useful for — but it must never be rendered. Tests in
  tests/no-match.test.ts assert the absence across every reason; do not
  relax them.
- Added 2026-08-25: the full disclaimer and terms live in DISCLAIMER.md, not
  in the UI. Legal text long enough to mean anything cannot be read inside a
  Google result row, and repeating it on every card trains people to scroll
  past it. Every card and every no-match note carries one durable link to it
  (`DISCLAIMER_URL` in src/ui/card.ts), and manifest.json's `homepage_url`
  points at the repository. The short in-card disclaimer stays as it is —
  it covers what a reader needs at the moment of reading; DISCLAIMER.md
  covers what the project needs to have said. DISCLAIMER.md has not been
  reviewed by a lawyer.
- Visual direction (amended 2026-07-20): prominent and clearly branded —
  brand accent bar, logo, shadow, larger type — while remaining
  trustworthy and accessible. Content stays factual and neutral;
  prominence comes from visual weight, never from alarming language.
  Do not use color alone to communicate severity or confidence.
- Conservative, explainable weighted matching — no opaque fuzzy-matching libraries.
- Content script uses static declaration restricted to Google Search and
  Google Maps pages (amended 2026-08-11; was Search-only). No `activeTab`
  permission.
- No backend, database, settings page, AI provider, or analytics.
  (Google Maps was also excluded here until 2026-08-11 — see the Maps
  decision below.)
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
  DBPR-only (until 2026-07-25, when Columbus was added to it). Queens results often carry neighborhood names (e.g.
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
  in `vid`) when the user clicks the card's "Show latest inspection"
  toggle (not when the card itself is expanded) — the same on-demand
  pattern as DBPR,
  via the service-worker proxy (the portal sends no CORS headers).
  Consequences of the missing bulk detail, by design: the collapsed card
  shows the permit status instead of date/violation badges (never a
  misleading "0 violations"), and `d`/`hp`/`im`/`ba` are empty/0 in the
  index. UI vocabulary uses Ohio's official tiers (critical / not critical)
  and always attributes status and records to Columbus Public Health.
  Coverage is Columbus + Worthington and interleaved suburb addresses (the
  ArcGIS food set); surrounding-county health districts (Franklin/Accela,
  Delaware/HealthSpace) are out of scope pending accessible sources.
- Added 2026-08-11: Cincinnati, Ohio is a fourth jurisdiction
  (j: "cincinnati"), from the Cincinnati Food Safety Program dataset on
  Cincinnati Open Data (Socrata rg6p-b3h3, refreshed daily). Everything is
  bundled — licence, address, phone, inspection date/type/result, and the
  violation count — so the collapsed card is complete without a fetch;
  expanding it pulls each violation's text and inspector comments from the
  same Socrata resource, which sends `Access-Control-Allow-Origin: *` and
  so is fetched directly from the content script (like NYC, unlike
  Columbus — the service worker stays FL+Columbus only, and no host
  permission is added).
  The defining constraint: the Cincinnati Health Department publishes no
  severity ranking at all — no critical flag, no score, no grade. So
  `hp`/`im`/`ba` are 0 and the untiered count lives in `vt`. The card shows
  one neutral "N violations" badge, a single unlabelled violation group,
  and states that Cincinnati does not rank violations by severity.
  Assigning a tier ourselves (e.g. deriving one from the Ohio food-code
  section) is prohibited — that would be our judgment, not the authority's
  record.
  The dataset spans a March 2024 licensing-system migration; only the
  current system (`CIN-HEFD-` licences) is indexed, because the pre-2024
  archive reports `action_status` per violation ("Abated"/"Not Abated")
  rather than per inspection, and every operating facility was re-licensed
  in the migration. Rows reduce in two stages — group by licence (name and
  address spelling drift within one licence, resolved by frequency), then
  collapse licences describing the same establishment (a restaurant that
  changed hands holds two). Coverage is the city of Cincinnati only
  (~2,270 facilities); suburbs fall under Hamilton County Public Health,
  which is out of scope pending an accessible source.
  There is no per-facility record page, so the official link goes to the
  Food Safety Program dataset (as NYC's goes to ABC Eats search).
- Amended 2026-08-11: Google Maps is now in scope, reversing the earlier
  "no Google Maps support" decision. Scope is the **place panel only**
  (google.com/maps/place/… — the left-hand detail panel for one business),
  not the results feed. The manifest adds `https://www.google.com/maps/*`
  to `content_scripts.matches`; no new host permission, no `activeTab`.
  Why the panel and not the feed: the panel exposes a full
  street/city/state/ZIP address (`button[data-item-id="address"]`) and a
  phone number (`button[data-item-id^="phone"]`), so Maps matches carry
  the strongest evidence the matcher supports — every verified Cincinnati
  query confirms at score 90, above what a Search local-pack row reaches.
  Feed rows (`a.hfpxzc`) carry only a name and bare street line, and the
  feed is virtualized; with four jurisdictions bundled, a bare street with
  no city could match the wrong city. Revisit only with a guard for that.
  Placement: the card is inserted *after* the title block — the ancestor
  of the panel's `<h1>` that is a direct child of the panel's scroll
  container — landing under the name/rating and above the
  Overview/Menu/Reviews strip. Selectors use role, `data-item-id`, and the
  h1's position ONLY, never Maps' obfuscated class names (`.TIHn2`,
  `.m6QErb`, `.DUwDvf`), which rotate. Same lesson as the Search knowledge
  panel: anchoring into a deep panel subtree gets displaced on re-render.
  Maps is a single-page app, so a processed fingerprint is no longer
  sufficient to skip a candidate — opening another place destroys the card
  with the panel and navigating back rebuilds it. Both dedupe checks in
  src/content/index.ts now also require `isAlreadyInjected(entry)`, which
  is loop-safe because `injectCard` marks the element before doing work.
- Added 2026-08-11: the matcher canonicalizes authority-specific street
  suffix spellings (`AV`→`ave`, `WY`→`way`, `PLZ`→`plaza`, `EXWY`→`expy`)
  in `STREET_SUFFIX_VARIANTS`. Cincinnati writes "AV" or "WY" on ~38% of
  its addresses where Google writes "Ave"/"Way"; untreated, the address
  similarity lands at 0.5, below STREET_STRONG, and never corroborates
  the match.
- Amended 2026-09-27: the no-match note's self-search names the authority
  whose records we check for the listing's ZIP area, and links that
  authority's own search (Florida DBPR public records, NYC DOHMH ABC Eats,
  Columbus Public Health's EnvisionConnect portal, the Cincinnati Food
  Safety Program dataset). An authority counts as covering a ZIP3 area only
  with at least MIN_ZIP3_RECORDS = 10 records there, per jurisdiction —
  the same floor as the out-of-area gate — so stray mis-keyed records
  neither mark an out-of-state area covered nor name an authority for it.
  No ZIP on the listing → one link per bundled authority. Out-of-area → no
  search link at all. The authority is never inferred from a rejected name
  candidate. Previously the note always named Florida DBPR, whatever the
  listing's location. The 2026-08-25 rule stands: no near-miss record is
  ever named.
- Added 2026-09-27: Google Search DOM drift. Google moved the knowledge
  panel's address and phone under `[data-local-attribute="d3adr"]` and
  `[data-local-attribute="d3ph"]`; the parser reads those. `[data-cid]` is
  demoted to a guarded fallback entry, accepted only with a local-pack
  details container plus a street or a "City, ST ZIP" line, because Google
  also puts it on menu-highlight dish tiles and YouTube cards, which were
  each getting a no-match note. Google's newer "Places" list rows show no
  per-row street address and are deliberately not parsed — no card, no
  note; clicking one opens its knowledge panel, which does get a card.
  Verified live 2026-09-27 in an isolated Edge profile with the built
  extension: FL, NYC, Columbus and Cincinnati knowledge panels matched, a
  classic local pack matched 3/3, a Maps place panel matched, and a
  non-restaurant search got nothing.
- Added 2026-09-27: per-listing console logs (query text, candidates,
  would-have-shown, near-miss candidates) are development-only, gated on
  `import.meta.env.MODE === "development"`; `npm run dev` builds in that
  mode. Store and region builds print only "content script active",
  "N facilities loaded", one name-free summary line per run (counts of
  listings checked, cards and notes), and "error:" if a run throws.
  Listing text read off the page stays out of a user's console by default.
- Added 2026-09-27: the Chrome Web Store privacy disclosure is "Website
  content" — the content script reads listing text (name, address, phone)
  on the page and matches it in memory; nothing is stored or sent. This
  matches PRIVACY.md and the store description; if one changes, all three
  change. No other data category applies. Listing copy lives in
  docs/store-listing.md.

## Tech stack

- TypeScript, Vite + CRXJS, Vitest
- Vanilla DOM with shadow DOM for style isolation
- No UI framework

## Project structure

- src/background/ — service worker; does nothing but proxy the on-demand
  DBPR and Columbus fetches (see the service-worker decisions above)
- src/content/ — content script (DOM parsing, injection)
- src/matching/ — restaurant matching and normalization. dbpr-matcher.ts
  is the live matcher for every jurisdiction; matcher.ts is the Milestone 1
  mock matcher, used only by tests/matcher.test.ts
- src/summary/ — plain-English summary generation from structured records
- src/ui/ — card, no-match note, styles, on-demand violation fetchers
- src/types/ — TypeScript interfaces
- src/data/ — jurisdiction indexes (dbpr/nyc/columbus/cincinnati-index.json)
  + index-set*.ts (which indexes a build bundles; see region-scoped builds
  below). fdacs-index.json is built here by `data:fdacs` but is gitignored
  and not bundled. mock-inspections.json is the Milestone 1 fixture, read
  only by tests/matcher.test.ts.
- src/platform/ — cross-browser extension API shim (Chrome/Safari/Firefox)
- src/ingest/ — download and ingest pipelines for every source (DBPR, NYC,
  Columbus, Cincinnati, FDACS) and the DBPR inspection archive merge
- src/lookup/ — CLI lookup tool from the DBPR source spike (reads
  data/processed/district1.json only)
- scripts/ — region build helper and the index sanity check (`data:check`)
- tests/ — unit tests
- docs/ — Chrome Web Store listing copy (store-listing.md), store images
  (docs/store/), and the historical DBPR source spike (source-spike.md)
- .github/workflows/ — weekly DBPR refresh (refresh-data.yml)
- data/archive/ — COMMITTED NDJSON of every DBPR inspection row ever
  downloaded (see Data pipeline)
- data/archive-fy2025-26/ — gitignored one-time copy of the FY2025-26 CSVs;
  keep a copy off-machine
- data/raw/ — downloaded DBPR CSVs (gitignored)
- data/processed/ — processed JSON files (gitignored)
- Root docs: README.md, PRIVACY.md, DISCLAIMER.md, MOBILE.md

## Commands

- `npm run dev` — `vite build --watch --mode development`: rebuilds on file
  change (no HMR; reload the extension) and turns on the per-listing
  console logs
- `npm run build` — production build to dist/
- `npm test` — run Vitest unit tests
- `npm run data:download` — download DBPR CSV extracts
- `npm run data:ingest` — merge the downloaded CSVs into data/archive/*.ndjson
  and rebuild the extension index from that archive
- `npm run data:check` — refuse a rebuilt index that collapsed (run after ingest)
- `npm run data:refresh` — download + ingest + check, the whole cycle
- `npm run data:nyc` — download NYC dataset and build nyc-index.json
- `npm run data:columbus` — download Columbus ArcGIS layer and build columbus-index.json
- `npm run data:cincinnati` — download the Cincinnati Socrata dataset and build cincinnati-index.json
- `npm run data:fdacs [-- --county Alachua]` — crawl the FDACS portal
  county by county (slow, paced) and build fdacs-index.json; not bundled
- `npm run build:columbus` / `build:cincinnati` / `build:nyc` / `build:florida` — region-scoped
  build bundling only that jurisdiction's index (1.2MB vs 28MB). For mobile,
  where an iOS Safari extension is terminated for memory well below the
  full dataset. See MOBILE.md.
- `npm run lookup` — CLI restaurant lookup against DBPR district 1 only
  (data/processed/district1.json; needs a prior `data:ingest`)

## Data pipeline

DBPR's district extract is NOT a cumulative archive. It holds the current
Florida fiscal year to date and resets every July 1: the same file is ~21K
inspections in June and ~3.7K in August. Downloading and ingesting it directly
therefore does not refresh the dataset, it REPLACES it with however much of
the current fiscal year has elapsed.

So the CSV is treated as a delta. `src/ingest/inspection-archive.ts` merges
every download into `data/archive/district<N>-inspections.ndjson`, keyed on
`inspectionVisitId` (verified unique and always present in the real extract),
and the index is built from the archive. Consequences that must not be undone:

- `data/archive/*.ndjson` is COMMITTED. It is the only surviving copy of
  fiscal years DBPR no longer serves — FY2025-26 exists nowhere else. NDJSON
  rather than a JSON array so git deltas an appended refresh instead of
  rewriting a 12MB blob.
- The merge is idempotent and deterministically ordered: re-ingesting an
  unchanged extract produces a byte-identical file and no git diff.
- Ingesting a single district still rebuilds the index from all seven
  districts' persisted files. Rebuilding it from only the requested district
  silently shrank the statewide index — the same shape of bug as the
  fiscal-year reset, a command that reads like a partial update but performs
  a full replacement.
- `npm run data:check` guards both: it fails if the facility count drops more
  than 5% against the committed index or the newest inspection date moves
  backwards. The weekly GitHub Action runs it before committing.
- `ic` counts inspections on record in the archive, across fiscal years — not
  "in the current fiscal year". The card label says "on record" accordingly.

## Rules for AI contributors

- Do not add features beyond the current milestone scope
- Do not introduce abstractions for hypothetical future needs
- Run `npm test` before reporting any task complete
- When modifying the matcher, add test cases for the new behavior
- Card UI changes must be verified in Chrome on a real Google search page
- Never add `activeTab`. Host permissions must be narrowly scoped.
