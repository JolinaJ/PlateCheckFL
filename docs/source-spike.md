# Source Validation Spike — DBPR Restaurant Inspection Data

## Source

**Official page:** https://www2.myfloridalicense.com/hotels-restaurants/public-records/

The Florida Department of Business and Professional Regulation (DBPR)
Division of Hotels and Restaurants publishes downloadable CSV extracts
of food service inspection data and active license data, organized by
district.

## District Used

**District 1** — Dade and Monroe counties (Miami-Dade area)

## Files Downloaded

### Inspections — Current Fiscal Year

- **URL:** `https://www2.myfloridalicense.com/sto/file_download/extracts/1fdinspi.csv`
- **Size:** ~9.8 MB
- **Rows:** 21,145 (including header)

### Active Food Service Licenses

- **URL:** `https://www2.myfloridalicense.com/sto/file_download/extracts/hrfood1.csv`
- **Size:** ~3.1 MB
- **Rows:** 10,367 (including header)

## Actual CSV Headers

### Inspection File (`1fdinspi.csv`)

```
"District","County Number","County Name"," License Type Code"," License Number",
"Business (DBA-Does Business As) Name","Location Address","Location City",
" Location Zip Code","Inspection Number","Visit Number","Inspection Class",
"Inspection Type","Inspection Disposition","Inspection Date",
"Number of Critical Violations","Number of Noncritical Violations",
" Number of Total Violations","Number of High Priority Violations",
"Number of Intermediate Violations","Number of Basic Violations","PDA Status",
"Violation 01" through "Violation 58","License ID","Inspection Visit ID"
```

**Note:** Some headers have leading spaces (` License Number`, ` Location Zip Code`,
` Number of Total Violations`). The parser accounts for this.

### License File (`hrfood1.csv`)

```
"Board Code","License Type Code","Licensee Name","Rank Code","Modifier Code",
"Mailing Name","Mailing Street Address","Mailing Address Line 2",
"Mailing Address Line 3","Mailing City","Mailing State Code","Mailing Zip Code",
"Primary Phone Number","Mailing County Code","Business Name","Filler",
"Location Street Address","Location Address Line 2","Location Address Line 3",
"Location City","Location State Code","Location Zip Code","Location County Code",
"Location County","Secondary Phone Number","District","Region","License Number",
"Primary Status Code","Secondary Status Code","License Expiry Date",
"Last Inspection Date","Number of Seats or Rental Units","Base Risk Level",
"Secondary Risk Level"
```

## Join Key Issue

The license file uses prefixed license numbers (e.g., `SEA2300159`) while
the inspection file uses bare numeric IDs (e.g., `2300159`). Stripping the
alphabetic prefix before joining produces 10,205 matches out of 10,367
licenses (98.4%).

The unmatched 162 licenses likely have no inspections in the current fiscal
year extract.

## Sample Lookup Output

```
$ npm run lookup -- --name "VERSAILLES REST" --address "3555 SW 8 ST" --city "MIAMI"

Match confidence: CONFIRMED

  Business:  VERSAILLES REST
  License:   SEA2302751
  Address:   3555 SW 8 ST, MIAMI 331354109
  County:    Dade

  Latest Inspection:
    Date:         03/11/2026
    Type:         Routine - Food
    Disposition:  Call Back - Complied
    High Priority violations: 0
    Intermediate violations:  0
    Basic violations:         0
    Total violations:         0

  3 additional inspection(s) in dataset.
```

## Known Gaps

1. **Name mismatch between public usage and DBPR records.** DBPR uses
   legal/DBA names that often differ from what consumers search for.
   Example: "Joe's Stone Crab" is registered as "JOES STONE CRABS
   RESTAURANT" — Jaccard similarity is only 0.4 due to plural form and
   appended "RESTAURANT". The current matcher requires 0.85 similarity
   for a strong match, so this is only a `possible` candidate. The
   extension will need to account for this via:
   - Substring matching (does the query appear inside the DBPR name?)
   - Common suffix stripping ("RESTAURANT", "REST", "CAFÉ", etc.)
   - Token overlap scoring that's more forgiving of extra tokens

2. **Violation detail limited.** The CSV provides violation counts by
   category (High Priority / Intermediate / Basic) and binary
   violation-category flags (Violation 01–58), but does not include the
   full text description of each violation. Full violation text is only
   available through the interactive DBPR inspection search portal.

3. **Current fiscal year only.** The district CSV extracts cover only the
   current fiscal year (July 1 onward). Historical data requires
   separate statewide XLSX files. A production version would need to
   ingest multiple years.

4. **Addresses are abbreviated.** DBPR uses abbreviated addresses
   (e.g., "3555 SW 8 ST") that may not match Google's formatting
   (e.g., "3555 SW 8th Street"). The normalizer handles common cases
   but edge cases remain.

5. **Data freshness unknown.** The CSV extracts are updated on an
   undocumented schedule. There is no last-modified header or version
   stamp in the files themselves.

6. **Single district only.** This spike covers District 1 only.
   Production requires all 7 districts.

## Assessment

**The data is sufficient for the extension**, with the following
work needed before integration:

1. Improve name matching to handle DBPR naming conventions (appended
   "RESTAURANT", "REST", abbreviations, plurals).
2. Ingest all 7 districts.
3. Build a periodic refresh mechanism.
4. Map violation category flags (01–58) to human-readable descriptions
   using the DBPR violation code reference.
5. Consider ingesting prior fiscal year files for inspection history depth.

The CSV download approach is reliable, doesn't require scraping, and
provides structured data suitable for local matching.
