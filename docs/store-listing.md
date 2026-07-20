# Chrome Web Store listing — copy-paste reference

Everything the Developer Dashboard asks for, ready to paste.

## Store listing tab

**Name:** PlateCheck

**Summary** (132 chars max):
> Official restaurant inspection records (Florida DBPR, NYC DOHMH) shown inline on Google Search results.

**Description:**
> See official restaurant inspection records where you're already looking — right in your Google Search results.
>
> When you search for a restaurant in a covered area, PlateCheck adds a quiet card below the matching result showing the most recent official inspection: the date, outcome, and violation counts, with details one click away.
>
> COVERAGE
> • Florida — every DBPR-licensed food service establishment (~67,000), from official Division of Hotels and Restaurants public records
> • New York City — every DOHMH-inspected restaurant (~28,000), including the official posted letter grade, from NYC Open Data
>
> HONEST MATCHING
> Restaurant names repeat everywhere, so PlateCheck never guesses. Every card is labeled "Matched" (name and street address verified) or "Partial match" (name verified, address unconfirmed). If the evidence isn't there, no card is shown.
>
> JUST THE RECORD
> PlateCheck reports what the issuing authority published — dates, dispositions, violation counts, and official NYC grades with attribution. It never assigns its own scores, grades, or judgments. Inspection records are historical snapshots of conditions on the inspection date; every card links to the official government source.
>
> PRIVATE BY DESIGN
> No data collection of any kind. Matching happens entirely on your device against bundled public records. No analytics, no accounts, no tracking. The only network requests are the ones you trigger by clicking "Show violations," and they go only to official government sources.
>
> Open source: https://github.com/JolinaJ/PlateCheckFL

**Category:** Search Tools

**Language:** English (United States)

## Privacy tab

**Single purpose description:**
> Displays official government restaurant inspection records inline next to matching restaurant results on Google Search pages.

**Permission justifications:**

- *Content script on google.com/search:*
  > Reads restaurant names and addresses in Google Search results locally to match them against bundled public inspection records, and injects the inspection card below matching results. No page content is transmitted anywhere.

- *Host permission — myfloridalicense.com:*
  > When the user clicks "Show violations" on a Florida card, the extension fetches that record's official DBPR inspection detail page to display individual violation descriptions. The request contains only the public record's identifiers and is user-initiated.

- *remote code:* Not used.

**Data usage disclosures:** check "Does not collect or use user data" —
no categories apply. Certify all three attestations.

**Privacy policy URL:**
> https://github.com/JolinaJ/PlateCheckFL/blob/main/PRIVACY.md

## Assets

- Icon 128×128: `icons/icon128.png` (uploaded automatically with the package)
- Screenshots (need at least 1, 1280×800 or 640×400): capture the card
  on a real Google search (e.g. "katz's delicatessen" or a Gainesville
  restaurant), card expanded showing the violations list.

## Submission notes

- Upload ZIP: `platecheck-0.1.0.zip` (built from `dist/`)
- Visibility: Public
- Review typically takes 1–3 business days for a first submission.
