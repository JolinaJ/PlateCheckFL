# Chrome Web Store listing: copy-paste reference

Everything the Developer Dashboard asks for, for version 1.0.0, in the order
the dashboard asks for it. Anything in a blockquote gets pasted as-is. The
rest is notes.

## Store listing tab

**Name:** PlateCheck. Comes from `name` in manifest.json.

**Summary:** comes from `description` in manifest.json. The dashboard shows
it but won't let you edit it there, so if it needs to change, change the
manifest and upload a new version. Right now it's 119 characters (the limit
is 132):

> Florida restaurant inspection records from official DBPR public data, shown inline for Google Search™ and Google Maps™.

**Description:**

> See official Florida restaurant inspection records where you're already looking: in Google Search™ results and on Google Maps™ place pages.
>
> When a restaurant in a covered area shows up, PlateCheck adds a card with its most recent inspection on record: the date, the result and the violation counts, with the individual violations one click away. Cards show up in three places: the panel for a single restaurant in search results, under each row of the local results list when the row shows a street address, and under the name on a Maps place page.
>
> COVERAGE
> • Florida: about 68,300 food service establishments licensed by the Department of Business and Professional Regulation (DBPR), Division of Hotels and Restaurants, straight from DBPR's public records.
>
> HOW MATCHING WORKS
> Restaurant names repeat everywhere, so every card says how strong the match is. "Matched" means the name and the street address both line up with the record. "Partial match" means the name lines up but the address couldn't be fully confirmed, so treat it as unconfirmed.
>
> When no record can be tied to a listing, a short note takes the card's place and says why: the address is outside the covered areas, a record at that address is on file under another name, the listing has no street address to check, and so on. Where it can, the note links to the search run by the agency whose records PlateCheck checks for that area, so you can look it up at the source. The note is about PlateCheck's data, not the restaurant. A business can be licensed under another name, regulated by a different agency, or newer than the last data update. PlateCheck never puts a near-miss record next to a listing as a guess.
>
> JUST THE RECORD
> PlateCheck shows what the issuing agency published: dates, results and violation counts. It doesn't give its own scores, grades, ratings or judgments, and where an agency publishes no severity ranking, it doesn't add one. An inspection record describes one visit on one date, not how a business is doing today. The bundled records are a snapshot that gets refreshed with each release, and every card links to the official source.
>
> PRIVACY
> PlateCheck reads the restaurant name, address and phone number shown on the page and matches them on your device against records bundled with the extension. That text isn't saved and isn't sent anywhere. No accounts, no analytics, no tracking, and nothing is stored in your browser.
>
> The only network requests happen when you click "Show violations" (Florida, NYC, Cincinnati) or "Show latest inspection" (Columbus). Each one goes to the official source for that record (Florida DBPR's site, NYC Open Data, Columbus Public Health's records portal, or Cincinnati Open Data), carries only public record IDs and the inspection date, and sends no cookies. What comes back is kept in memory for that page only.
>
> Cincinnati cards also link to a news organization's inspection database (the Cincinnati Enquirer's), marked "Not an official record". It's an ordinary link. Nothing is loaded from it unless you click it.
>
> PlateCheck is independent. It isn't affiliated with or endorsed by any government agency, or by the owner of the trademarks named below.
>
> Disclaimer and terms of use: https://github.com/JolinaJ/PlateCheckFL/blob/main/DISCLAIMER.md
> Privacy policy: https://github.com/JolinaJ/PlateCheckFL/blob/main/PRIVACY.md
> Source code: https://github.com/JolinaJ/PlateCheckFL
>
> Google Search and Google Maps are trademarks of Google LLC.

Notes on the description:

- "Google" shows up exactly 5 times: twice in the first line, three times in
  the trademark line. Google's keyword-spam rule flags a word repeated more
  than 5 times, so don't add another one. Say "search results" or "Maps"
  instead.
- It says "Source code:", not "Open source:". There's no LICENSE file, so
  the code isn't open source yet. Only change that line once a license is
  committed and pushed.
- Counts are rounded from the indexes bundled in this release. Update them
  when a refresh moves them noticeably.
- The privacy paragraph has to stay in line with the Privacy practices tab
  (Website content) and PRIVACY.md. If one changes, change all three.

**Category:** Tools. The old "Search Tools" category was retired and can't
be picked anymore. Don't use Shopping (that's about prices, reviews and
ratings, which this isn't), Travel, Household or Functionality & UI.

**Language:** English (United States)

**Store icon:** `icons/icon128.png` (128×128). It's the same icon that ships
in the package. Upload it in the Store icon field if the dashboard asks.

**Homepage URL:** https://github.com/JolinaJ/PlateCheckFL

**Support URL:** https://github.com/JolinaJ/PlateCheckFL/issues (make sure
Issues is turned on in the repo settings)

**Official URL:** leave it empty. It needs a site verified in Search Console.

## Privacy practices tab

**Single purpose description:**

> Shows official government restaurant inspection records (Florida DBPR, NYC DOHMH, Columbus Public Health, Cincinnati Health Department) next to the matching restaurant listing on Google Search results and Google Maps place pages, or a short note when none of its bundled records match. It has no other function.

**Host permission justification:** the manifest's `permissions` is empty, so
the dashboard gives one box for this. That box covers both content-script
matches (`https://www.google.com/search*`, `https://www.google.com/maps/*`)
and both host permissions (`https://www.myfloridalicense.com/*`,
`https://pressagent.envisionconnect.com/*`). The text below is 963
characters, or 969 if the browser counts line breaks as two, so it fits
under the 1,000 limit either way. Paste all four paragraphs into the one box:

> Content scripts (www.google.com/search*, www.google.com/maps/*): the extension's one job is showing official restaurant inspection records beside restaurant listings. It reads each listing's name, address and phone number, matches them on the device against records bundled in the package, and inserts a card below the listing, or a short note when nothing matches. Nothing it reads is stored or sent.
>
> www.myfloridalicense.com: when the user clicks "Show violations" on a Florida card, the service worker fetches that inspection's public DBPR detail page by inspection and license ID. DBPR sends no CORS headers, so this must run in the extension.
>
> pressagent.envisionconnect.com: Columbus Public Health's records portal. "Show latest inspection" on a Columbus, Ohio card fetches that facility's public page by facility ID. Also no CORS headers.
>
> Both fetches are user-initiated, send only public record IDs and no cookies, and the worker refuses any other host.

Not pasted, just so it's written down: NYC details come from
data.cityofnewyork.us and Cincinnati details from data.cincinnati-oh.gov.
Both send `Access-Control-Allow-Origin: *`, so the content script fetches
them directly and they need no host permission. They're named in the
description and in PRIVACY.md.

**Are you using remote code?** No, I am not using remote code. Every script
ships in the package. What the extension fetches is data (DBPR and
EnvisionConnect HTML, Socrata JSON), parsed with DOMParser and JSON.parse
and never run.

**Data usage:** under "What user data do you plan to collect from users now
or in the future?", tick only **Website content**. Leave everything else
unticked: Personally identifiable information, Health information,
Financial and payment information, Authentication information, Personal
communications, Location, Web history, User activity.

Why Website content: the content script reads the name, address and phone
number Google shows for a restaurant and matches them in memory. Nothing's
stored or sent, but Google's User Data FAQ counts reading data off a web
page as handling user data, and says it has to be disclosed even when it
never leaves the device. There's no "does not collect" box to tick, so
don't go looking for one.

Then tick all three certifications:

- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:**

> https://github.com/JolinaJ/PlateCheckFL/blob/main/PRIVACY.md

## Assets

These go under Graphic assets on the Store listing tab. Keep the files in
`docs/store/` and commit them.

- **Store icon (required):** `icons/icon128.png`, 128×128. See above.
- **Small promo tile (required):** `docs/store/promo-tile-440x280.png`,
  440×280. Already made. It has no Google logo and no "Google" text in it,
  so keep it that way.
- **Screenshots (at least 1, up to 5):** exactly 1280×800, PNG or JPEG,
  square corners, no padding, full bleed. Use plain, unaltered captures of
  the page with the card on it. No arrows, captions, borders or extra logos
  drawn on top. If the upload complains about a PNG (transparency, usually),
  re-save it as JPEG.

  | File | What it shows |
  |---|---|
  | `docs/store/screenshot-1.png` | Miami local results with a card under each row |
  | `docs/store/screenshot-2.png` | A Florida card expanded, showing the inspection details |
  | `docs/store/screenshot-3.png` | The card on a single-restaurant panel (Versailles, Miami) |
  | `docs/store/screenshot-4.png` | The card on a Google Maps place page |

  To get an exact 1280×800 capture in Chrome: F12, then Ctrl+Shift+M for
  the device toolbar. Pick Responsive, set 1280 × 800 and DPR 1. In the
  toolbar's ⋮ menu choose "Add device type" and set it to Desktop, or
  Google serves its phone layout. Reload, get the card how you want it,
  then Ctrl+Shift+P and run "Capture screenshot".

  These shots show real businesses' public records. Pick places whose
  latest inspection is routine and unremarkable. The point is to show how
  the product works, not to put one business's record in the spotlight.
- **Marquee promo tile (1400×560):** optional. Skipping it for launch.

## Distribution tab

- **Visibility:** Public
- **Regions:** All regions. The data is all US, but anyone can install it.
- There's no price field. It's free.

## Submission checklist

I do all of this by hand. Payment, 2-Step Verification and the account
declarations can't be scripted. In this order:

### Before the dashboard

1. `npm test` passes, and `version` is `1.0.0` in both manifest.json and
   package.json.
2. Everything's committed and pushed to `main`, including DISCLAIMER.md,
   PRIVACY.md, `data/archive/` and `docs/store/`. Open
   https://github.com/JolinaJ/PlateCheckFL/blob/main/PRIVACY.md and
   https://github.com/JolinaJ/PlateCheckFL/blob/main/DISCLAIMER.md in a
   private window and check they both load. The listing and every card
   link to them.
3. Build fresh with `npm run build`. Use the plain build, not
   `build:florida` or another region build, since those write to the same
   `dist/` and ship one index. Then check `dist/`: it should hold exactly
   `manifest.json`, `service-worker-loader.js`, `assets/` and `icons/`.
   `dist/manifest.json` should say `1.0.0`, and `dist/assets/` should have
   four index files (`dbpr-index-*`, `nyc-index-*`, `columbus-index-*`,
   `cincinnati-index-*`) and no `fdacs-index`.
4. Zip it from PowerShell at the repo root, with Windows' own tar:

   ```
   C:\Windows\System32\tar.exe -a -cf platecheck-1.0.0.zip -C dist manifest.json service-worker-loader.js assets icons
   ```

   Never use `Compress-Archive` or right-click "Compressed folder".
   Compress-Archive writes `assets\file.js` with backslashes, and the
   right-click one nests everything under `dist/`. Don't use Git Bash's
   `tar` either: it's GNU tar and writes a plain tar with a .zip name.
5. Check the zip in Git Bash with `unzip -l platecheck-1.0.0.zip`. Every
   path should use `/`, and `manifest.json` should be at the top level,
   not inside a folder. `*.zip` is gitignored, so it won't get committed.
6. Load `dist/` unpacked in Chrome and click through one restaurant each in
   Florida, NYC, Columbus and Cincinnati on Search, plus one Maps place.
   That's the exact package going up. Take the five screenshots while
   you're there.

### Account (one time)

7. Turn on 2-Step Verification on the Google account I'll publish from
   (myaccount.google.com/security). Pick an account I'll keep. The
   developer account's email can't be changed later.
8. Go to https://chrome.google.com/webstore/devconsole, accept the
   developer agreement and program policies, and pay the one-time US$5
   registration fee.
9. Account tab: set the publisher name (it shows on the listing). Add a
   contact email and verify it from the inbox. Fill in the Trader /
   Non-Trader declaration. Non-Trader fits a free project that isn't run
   as a business. Trader means a public postal address and a verified
   phone number show on the listing. Save.

### The item

10. Items, then New item. Upload `platecheck-1.0.0.zip`. Fix any
    validation error before going on.
11. Store listing tab: paste the description, set Category and Language,
    upload the icon, promo tile and screenshots, and fill in the Homepage
    and Support URLs, all from the sections above.
12. Privacy practices tab: single purpose, host permission justification,
    remote code "No", Website content only, all three certifications, and
    the privacy policy URL, all from above. Save the draft.
13. Distribution tab: Public, all regions.
14. Submit for review. The submit dialog has "publish automatically after
    it passes review" ticked. Untick it if I'd rather press Publish myself.
15. Wait. Review is usually a few days, but a new developer account with a
    new item can take a few weeks. If it's still pending after three
    weeks, contact developer support. If it's rejected, the email names
    the policy. Fix that, bump the version, rebuild, re-zip and upload
    again.

### Every update after that

16. Bump `version` in manifest.json (and package.json to match) before
    every upload. The store won't take a version that isn't higher than
    the last one, and the zip name should match it. Each update goes
    through review again.
