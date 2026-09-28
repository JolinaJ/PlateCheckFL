# PlateCheck Privacy Policy

_Last updated: September 27, 2026 (PlateCheck version 1.0.0)_

PlateCheck is a browser extension that shows public restaurant inspection
records from Florida, New York City, Columbus (Ohio) and Cincinnati (Ohio)
next to restaurant listings on Google Search and Google Maps. This policy
describes everything PlateCheck does with data.

**In short:** PlateCheck reads a restaurant's name, address and phone number
from the Google page you're looking at, so it can match that listing to a
public inspection record. The matching happens in your browser. Nothing it
reads from the page is stored or sent anywhere. PlateCheck contacts another
site only when you click a button on a card asking for a record's details,
and that request carries only the record's public identifiers.

## What PlateCheck reads from the page

PlateCheck runs only on pages at `www.google.com/search` and
`www.google.com/maps`. On those pages, for each restaurant listing Google
shows (a single-business panel in Search, a row in a Search list of local
results, or a Google Maps place panel), it reads:

- the business name
- the street address
- the city
- the ZIP code
- the phone number, where Google shows one

It looks at the page's layout to find those listings. To find the address
and phone number, it reads the text of that listing's details and keeps only
the fields above. It doesn't read your search terms, the page address, your
Google account, or anything else on the page.

PlateCheck uses these fields for one thing: matching the listing against the
public inspection records bundled inside the extension, so it can show an
inspection card, or a short note when it has no match, under that listing.
The fields stay in the page's memory while the page is open. They're never
written to storage and never sent anywhere.

PlateCheck also prints a few short status messages to your browser's
developer console (for example, the number of records it loaded). They
contain no names, addresses or phone numbers from the page, and they stay in
your browser.

### Chrome Web Store disclosure

In the Chrome Web Store's privacy categories, the listing details above are
"Website content". That's the only category PlateCheck declares.

PlateCheck's use of this information complies with the Chrome Web Store User
Data Policy, including the Limited Use requirements:

- It's used only for PlateCheck's single purpose: showing public inspection
  records for the restaurant listings on the page.
- It isn't sold or transferred to anyone.
- It isn't used for advertising, for creditworthiness or lending decisions,
  or for any other purpose.
- No person, including PlateCheck's developer, ever sees it, because it never
  leaves your device.

## What leaves your device

Nothing PlateCheck reads from the page leaves your device, and PlateCheck
doesn't collect or transmit any information about you.

- **No browsing history.** PlateCheck doesn't record which pages you visit or
  what you search for.
- **No analytics.** There's no telemetry, crash reporting, tracking or
  advertising code.
- **No accounts.** There's no sign-in and no settings.
- **No server.** PlateCheck has no server of its own. The inspection records
  it matches against are bundled inside the extension and read from the
  extension package itself, not downloaded.
- **No storage.** PlateCheck doesn't use any browser storage: no extension
  storage, local storage, IndexedDB or cookies.

The only network requests PlateCheck makes are the record lookups below.

## Network requests

PlateCheck makes a network request only when you click one of the buttons
below on an inspection card. Showing a card, or opening it, doesn't make a
request on its own. Each request goes to the site that publishes that record.

**Florida: `www.myfloridalicense.com`** (Florida DBPR)

- Button: "Show violations" on a Florida card
- Sent: the inspection's visit ID and the license ID, both from DBPR's public
  records
- Made by: the extension's background service worker

**New York City: `data.cityofnewyork.us`** (NYC Open Data, NYC DOHMH dataset
43nn-pn8j)

- Button: "Show violations" on a New York City card
- Sent: the establishment's CAMIS ID and the inspection date
- Made by: the extension's script on the Google page

**Columbus, Ohio: `pressagent.envisionconnect.com`** (EnvisionConnect, the
records portal Columbus Public Health publishes its inspections through; it
isn't a government domain)

- Button: "Show latest inspection" on a Columbus card
- Sent: the facility ID, plus fixed settings that are the same for every
  Columbus request
- Made by: the extension's background service worker

**Cincinnati, Ohio: `data.cincinnati-oh.gov`** (Cincinnati Open Data,
Cincinnati Health Department dataset rg6p-b3h3)

- Button: "Show violations" on a Cincinnati card
- Sent: the inspection record number and the inspection date
- Made by: the extension's script on the Google page

Each request carries only those public record identifiers and, for New York
City and Cincinnati, the inspection date. None of them carries anything
PlateCheck read from the page, your search terms, or any information about
you, and all of them are sent without cookies or other credentials. As with
any web request, the receiving site can see your IP address and standard
browser details such as the browser type. Because the New York City and
Cincinnati requests are made from the Google page, those two sites can also
see that the request came from www.google.com.

The Florida and Columbus requests go through the service worker because
those two sites don't send the headers (CORS) that let a web page request
them directly. The service worker accepts only addresses on those two sites,
keeps no data, and does nothing else.

Details you fetch are kept in memory for that page only, so reopening a list
doesn't fetch it again. They're discarded when the page is closed or
reloaded. Google Maps doesn't reload between places, so on Maps this can
include places you looked at earlier in the same tab. Nothing is written to
storage.

## Links

Cards and no-match notes contain ordinary links. They open only when you
click them, and PlateCheck isn't told when you do.

- **Official sources.** Each card links to the issuing authority's own record
  or search: DBPR, NYC DOHMH's ABC Eats, Columbus Public Health's records
  portal, or the Cincinnati Health Department's dataset on Cincinnati Open
  Data. For Florida and Columbus, the link includes the record's public
  identifier so it opens the right page. A no-match note can link to an
  authority's own search.
- **Disclaimer and terms of use.** Every card and note links to PlateCheck's
  disclaimer on GitHub.
- **Cincinnati Enquirer.** Cincinnati cards also link to the Cincinnati
  Enquirer's restaurant inspection database (data.cincinnati.com). The card
  labels it "Not an official record". It's a news organization's site, not a
  government one.

Links carry nothing about you and nothing read from the page. Once you
follow a link, you're on that site, and its own privacy policy applies.

## Permissions

- **API permissions: none.** PlateCheck's manifest requests no Chrome
  permissions (its `permissions` list is empty). It doesn't use `activeTab`,
  `tabs`, `storage`, `history` or `cookies`.
- **Content script:** runs only on `https://www.google.com/search*` and
  `https://www.google.com/maps/*`.
- **Host permissions:** `https://www.myfloridalicense.com/*` and
  `https://pressagent.envisionconnect.com/*`, used only by the service worker
  for the Florida and Columbus requests described above.

## Data sources

The inspection records PlateCheck shows come from public records published
by:

- the Florida Department of Business and Professional Regulation (DBPR),
  Division of Hotels and Restaurants
- the New York City Department of Health and Mental Hygiene (DOHMH), through
  NYC Open Data
- Columbus Public Health (Columbus, Ohio), through the City of Columbus
  ArcGIS service and the EnvisionConnect records portal
- the Cincinnati Health Department (Cincinnati, Ohio), through Cincinnati
  Open Data

PlateCheck isn't affiliated with or endorsed by any of them. Section 11 of
PlateCheck's disclaimer lists where each source comes from and how PlateCheck
changes it: <https://github.com/JolinaJ/PlateCheckFL/blob/main/DISCLAIMER.md>

## Changes to this policy

When PlateCheck's handling of data changes, this policy is updated and the
date at the top changes with it. Every change is recorded in this file's
history: <https://github.com/JolinaJ/PlateCheckFL/commits/main/PRIVACY.md>

## Contact

Questions or concerns: open an issue at
<https://github.com/JolinaJ/PlateCheckFL/issues>.
