# PlateCheck

A Chrome extension that displays restaurant inspection information from
official public records, inline on Google Search result pages. Covers
Florida (DBPR — Department of Business and Professional Regulation) and
New York City (DOHMH — the ABC Eats letter-grade program, via NYC Open
Data).

> **DBPR inspection records are historical snapshots.** They reflect
> conditions observed on the date of inspection only. Establishments are
> not graded or rated. This tool does not determine whether any restaurant
> is safe or unsafe.

## Setup

```
npm install
```

## Quick start

```bash
# 1. Download official DBPR data (all 7 Florida districts)
npm run data:download

# 2. Parse CSVs and build the extension index
npm run data:ingest

# 3. Build the extension
npm run build

# 4. Load in Chrome (see below)
```

## Load the extension in Chrome

1. Run `npm run build`.
2. Open Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** (toggle in the top-right corner).
4. Click **Load unpacked**.
5. Select the `dist/` folder inside this project.
6. Search Google for a Florida restaurant (e.g., "Versailles Miami").
7. If the extension finds a match in the DBPR data, an inspection card
   appears below the restaurant's search result.

## Commands

| Command | Description |
|---|---|
| `npm run dev` | Development build with file watching |
| `npm run build` | Production build to `dist/` |
| `npm test` | Run Vitest unit tests |
| `npm run data:download` | Download DBPR CSV extracts (all districts) |
| `npm run data:ingest` | Parse CSVs and build `src/data/dbpr-index.json` |
| `npm run data:nyc` | Download NYC DOHMH data and build `src/data/nyc-index.json` |
| `npm run lookup -- --name "..." [--city "..."] [--address "..."]` | CLI restaurant lookup |

## Data source

**Official page:** https://www2.myfloridalicense.com/hotels-restaurants/public-records/

The extension uses CSV extracts published by the DBPR Division of Hotels
and Restaurants. Data covers all 7 Florida inspection districts
(approximately 67,000+ active food service establishments).

Raw data is stored in `data/raw/` (gitignored). Processed data is stored
in `data/processed/` (gitignored). The extension bundles a compact index
at `src/data/dbpr-index.json`.

### Data freshness

The CSV extracts cover the current fiscal year (July 1 onward). They are
updated on an undocumented schedule by DBPR. Run `npm run data:download`
and `npm run data:ingest` to refresh.

## Matching

The extension uses conservative, deterministic matching:

| Confidence | Meaning |
|---|---|
| **Matched** (confirmed) | Strong name match AND matching street address. Card shown with full confidence. |
| **Partial match** (likely) | Strong name match plus city/ZIP but no street verification. Card shown with uncertainty indicator. |
| **possible** | Weak evidence. Not shown to users — only appears in debug logs. |
| **unmatched** | Insufficient evidence. Nothing shown. |

The matcher handles DBPR naming conventions: appended business-type
suffixes (RESTAURANT, REST, GRILL, etc.), pluralization differences,
punctuation, and `&`/`and` variations.

### Why name-only matches are never confirmed

Many Florida restaurants share identical or similar names across different
cities. Confirming a match requires corroborating evidence — at minimum a
matching street address. When top candidates score too close together, the
result is automatically downgraded.

## Testing

```
npm test
```

135 tests covering: name normalization, DBPR name similarity, address
matching, CSV parsing, record joining, NYC dataset ingestion, lookup
behavior, Google DOM parsing, summary generation, violation detail
fetching/parsing, and confidence policy.
