# PlateCheck

A Chrome extension that shows official restaurant inspection records right
where you're already looking: Google Search and Google Maps. Search for a
restaurant in a covered area and it drops a card under the listing with the
latest inspection from the agency that did it.

| Jurisdiction | Authority | Facilities | What it publishes |
|---|---|---|---|
| Florida | DBPR (Division of Hotels and Restaurants) | ~68,300 | High priority / intermediate / basic violations |
| New York City | DOHMH | ~27,500 | Critical / not critical, plus the letter grades DOHMH posts |
| Columbus, OH | Columbus Public Health | ~4,800 | Permit status in bulk; date and critical violations on demand |
| Cincinnati, OH | Cincinnati Health Department | ~2,300 | Violations with **no severity ranking**, so they're shown unranked |

Each card uses that authority's own vocabulary. Where an authority
publishes no ranking, none gets shown. PlateCheck never makes up its own
grades, scores or severity tiers.

Florida's FDACS (Department of Agriculture) also inspects food places:
grocers, convenience stores, bakeries and the like. There's ingest code for it
(`npm run data:fdacs`), but it isn't bundled in the extension.

> **Inspection records are historical snapshots.** Each one reflects what
> an inspector saw on the date of that inspection, as published by the
> issuing authority. PlateCheck doesn't grade, score or rate any
> establishment and gives no opinion about any of them. Where an authority
> posts its own grade (NYC DOHMH letter grades), it's shown as that
> authority's record, credited to them.

## Where it shows up

- **Search panel for one restaurant.** Search for a specific place and
  Google shows a knowledge panel. The card goes at the top of the right
  rail when the address is there, otherwise above the results.
- **Classic local pack.** The short list of nearby businesses under a map,
  where each row shows a street address. A card goes under each row it
  can match.
- **Google Maps place panel.** Open a place on Maps and the card goes
  under the title block, above the Overview/Menu/Reviews tabs.

Google also has a newer "Places" list layout that doesn't show a street
address on each row. Those rows get nothing, no card and no note, because
there's nothing solid to match on. Click a row and it opens that place's
knowledge panel, which does get a card. Searches that aren't about a
restaurant get nothing either.

## Quick start

The four jurisdiction indexes are checked in under `src/data/`, so you
don't need to download anything to build:

```bash
npm install
npm run build
```

Then load `dist/` in Chrome (next section).

The data commands are only for refreshing those indexes:

```bash
npm run data:refresh      # Florida: download, merge into data/archive, rebuild, sanity-check
npm run data:nyc          # New York City
npm run data:columbus     # Columbus, OH
npm run data:cincinnati   # Cincinnati, OH
```

Don't run `npm run data:ingest` on a checkout that doesn't have
`data/archive/`. It'll rebuild the Florida index from just the current
fiscal year and throw away everything older. "Data freshness" below
explains why.

## Load it in Chrome

1. Run `npm run build`.
2. Go to `chrome://extensions`.
3. Turn on **Developer mode** (top right).
4. Click **Load unpacked**.
5. Pick the `dist/` folder in this project.
6. Search for a restaurant in a covered area, like "Versailles Miami",
   "Katz's Delicatessen", "Skyline Chili Clifton" or "Schmidt's Sausage
   Haus". Or open a restaurant's place page on Google Maps.
7. A matched listing gets an inspection card. A listing it can't match
   gets a small grey note in the card's spot saying why.
8. Open DevTools and filter the console on `PlateCheck:`. A normal build
   prints `content script active`, then `N facilities loaded` once
   there's a listing to match (the indexes only load then), then a
   one-line summary of how many listings it checked and how many got a
   card or a note. Counts only, no restaurant names. `npm run dev` builds
   in development mode and also prints the per-listing detail: what it
   read off the page, the candidates it scored, and what it would've
   shown.

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Rebuilds on every file change (`vite build --watch --mode development`). Not hot reload: reload the extension in `chrome://extensions` after a rebuild. Dev builds print the per-listing match logs. |
| `npm run build` | Production build to `dist/` with all four indexes |
| `npm test` | Runs the Vitest suite |
| `npm run data:download` | Downloads the current DBPR CSV extracts for all 7 districts into `data/raw/` |
| `npm run data:ingest` | Merges the downloaded inspections into `data/archive/*.ndjson`, joins them with the license files, and rebuilds `src/data/dbpr-index.json` from the whole archive |
| `npm run data:check` | Refuses a rebuilt Florida index that shrank more than 5% or whose newest inspection went backwards, compared with the committed one. Run it after `data:ingest`. |
| `npm run data:refresh` | `data:download` + `data:ingest` + `data:check` in one go |
| `npm run data:nyc` | Downloads the NYC DOHMH dataset and builds `src/data/nyc-index.json` |
| `npm run data:columbus` | Downloads the Columbus ArcGIS layer and builds `src/data/columbus-index.json` |
| `npm run data:cincinnati` | Downloads the Cincinnati Socrata dataset and builds `src/data/cincinnati-index.json` |
| `npm run data:fdacs [-- --county Alachua]` | Crawls the FDACS portal county by county and builds `src/data/fdacs-index.json`. Slow on purpose (it paces its requests). Not bundled, and the output is gitignored. |
| `npm run build:florida` / `build:nyc` / `build:columbus` / `build:cincinnati` | Builds with just one jurisdiction's index, for mobile (see [MOBILE.md](MOBILE.md)). Writes to the same `dist/`, so run a plain `npm run build` afterwards before shipping anything. |
| `npm run lookup -- --name "..." [--city "..."] [--address "..."] [--zip "..."]` | CLI lookup from the original DBPR spike. Only searches `data/processed/district1.json` (Miami-Dade and Monroe), so it needs a `data:ingest` first. |

## Matching

Matching is conservative and deterministic. No fuzzy-matching library,
just weighted name and address evidence you can read in
`src/matching/dbpr-matcher.ts`.

| Confidence | Meaning | What you see |
|---|---|---|
| **Matched** (confirmed) | Strong name match and a matching street address | Inspection card |
| **Partial match** (likely) | Strong name match with city or ZIP evidence but no street match, or a confirmed match knocked down because another record scored close to it | Inspection card labelled "Partial match" |
| possible / unmatched | Not enough evidence to tie the listing to one record | A grey no-match note instead of a card |

The note says why there's no card: the address is outside the covered
area, a license at that address is under another name, the unit doesn't
match, the match wasn't confident enough, the listing has no address, or
there's no record at all. It names the authority whose records we check for
that ZIP area and links to that authority's own search, so you can look it
up at the source. A listing with no ZIP gets a link for each bundled
authority, and an out-of-area listing gets no search link.

The note describes our record set, never the restaurant. A business can be
licensed under another name, regulated by a different agency, or newer than
the last refresh. It also never names a near-miss record. Those only go to
the console in dev builds, for debugging the matcher. The copy lives in
`src/ui/no-match-note.ts`.

The matcher also handles DBPR naming conventions: tacked-on business-type
suffixes (RESTAURANT, REST, GRILL and so on), plurals, punctuation, and
`&` vs `and`.

### Why name-only matches are never confirmed

Restaurants in every covered area share the same or similar names across
cities. Confirming a match takes corroborating evidence, at minimum a
matching street address. When the top candidates score too close together,
the result gets knocked down automatically.

## Data sources

| Jurisdiction | Publisher | What we use | Terms |
|---|---|---|---|
| Florida | DBPR, Division of Hotels and Restaurants | [Public records CSV extracts](https://www2.myfloridalicense.com/hotels-restaurants/public-records/) for all 7 districts, plus the inspection detail page on myfloridalicense.com when you click "Show violations" | Florida public records (Chapter 119, F.S.). See DBPR's [public records read-me/disclaimer](https://www2.myfloridalicense.com/public-records-read-medisclaimer/). |
| New York City | NYC DOHMH, via NYC Open Data | [Restaurant Inspection Results (43nn-pn8j)](https://data.cityofnewyork.us/d/43nn-pn8j), bundled and queried again when you click "Show violations" | [NYC Open Data public policies and terms of use](https://cityofnewyork.github.io/opendatatsm/publicpolicies.html). Source, version and changes are listed below. |
| Columbus, OH | Columbus Public Health | [Inspected Restaurants & Markets ArcGIS layer](https://maps2.columbus.gov/arcgis/rest/services/Schemas/Health/MapServer/3), plus the facility's page on the [EnvisionConnect portal](https://pressagent.envisionconnect.com/main.phtml?agency=COL) when you click "Show latest inspection" | Layer is [CC0](https://opendata.columbus.gov/datasets/restaurant-market-health-inspections/about) |
| Cincinnati, OH | City of Cincinnati, Cincinnati Health Department | [Cincinnati Food Safety Program (rg6p-b3h3)](https://data.cincinnati-oh.gov/d/rg6p-b3h3), bundled and queried again when you click "Show violations" | Public Domain (the dataset's license field) |

PlateCheck isn't affiliated with or endorsed by any of these agencies. The
official record is whatever the agency publishes at its own source, and
every card links there.

Cincinnati cards also link to the Cincinnati Enquirer's inspection database
(data.cincinnati.com), since the city has no per-restaurant record page.
The card labels it "Not an official record". None of our data comes from
it.

Each index is a compact JSON file in `src/data/` holding the latest
inspection per facility. Raw downloads land in `data/raw/` and the
per-district Florida joins in `data/processed/` (both gitignored).

### NYC data: source, version and changes

NYC Open Data asks apps that reuse its data to say where it came from and
what was changed.

- **Source:** NYC DOHMH Restaurant Inspection Results (43nn-pn8j), pulled
  from the NYC Open Data Socrata API by `npm run data:nyc`.
- **Version:** the snapshot committed in `src/data/nyc-index.json`. Its git
  history dates each refresh.
- **Changes:** rows with the 1900-01-01 placeholder date (not inspected
  yet) are dropped. Rows are grouped by restaurant (CAMIS) and cut down to
  the most recent inspection, with its critical and not-critical rows
  counted. The posted grade comes from the most recent row that has one.
  Names and addresses are uppercased and trimmed, and ZIPs are cut to 5
  digits. Violation text isn't bundled. It's fetched from the same dataset
  when you click "Show violations".
- The City of New York doesn't warrant the completeness, accuracy or
  fitness for any purpose of NYC Open Data.

### Data freshness

The extension is only as fresh as the indexes in its last release.

**Florida** needs special handling. DBPR's district extract isn't an
archive. It holds the current Florida fiscal year to date and resets every
July 1, so the same file has ~21K inspections in June and ~3.7K in August.
Ingesting it straight wouldn't refresh the data, it'd replace it with
whatever's happened since July.

So `data:ingest` treats each download as a delta. It merges the CSV into
`data/archive/district<N>-inspections.ndjson` (committed, keyed on the
inspection visit ID) and rebuilds the index from the whole archive. The
archive is the only copy of fiscal years DBPR doesn't serve anymore, so
don't delete it. `data:check` refuses a rebuilt index that shrank more than
5% or whose newest inspection moved backwards.

A GitHub Action (`.github/workflows/refresh-data.yml`) runs that whole
cycle every Monday at 09:00 UTC and commits the result. DBPR regenerates
its files daily, around 10:49 UTC.

**NYC, Columbus and Cincinnati** get refreshed by hand with their `data:*`
commands. Each one is a full rebuild from the current dataset.

## Privacy and terms

- [PRIVACY.md](PRIVACY.md): the privacy policy. What the extension reads
  off the page, and the only network requests it makes.
- [DISCLAIMER.md](DISCLAIMER.md): the disclaimer and terms of use. Every
  card and no-match note links to it.

## Testing

```
npm test
```

The suite covers name normalization and the matcher (DBPR naming
conventions, address similarity, the token index, confidence policy,
no-match classification), the DBPR CSV parsers and license join, the
inspection archive merge, the NYC, Columbus, Cincinnati and FDACS ingests,
Google Search and Maps DOM parsing, card and no-match note rendering,
injection placement, the cross-browser API shim, summary generation,
violation ordering, and violation detail fetching for every jurisdiction.
