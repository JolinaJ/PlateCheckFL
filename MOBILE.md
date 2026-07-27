# PlateCheck on iPhone (Safari Web Extension)

Status: **the codebase is ready; the conversion has not been run yet.**
Everything below the "What's done" line still needs doing on your side,
and the mobile parser needs one round of verification on a real device
(see "The one real unknown").

## Why Safari

Chrome for Android has never supported extensions and Google has said the
desktop-style version with extension support is for tablets and
Chromebooks, not phones. Firefox for Android does support add-ons. Safari
on iOS has supported web extensions since iOS 15. Safari is the better
target: it is the default browser on the device you carry, so the
"appears where you already search" premise survives.

## What's done

- **Region-scoped bundles.** `npm run build:columbus` produces a 1.2MB
  build instead of the 28MB desktop one. This is not cosmetic: iOS Safari
  terminates extensions aggressively for memory, and ~28MB of records plus
  a 100K-entry token index would not survive. See `src/data/index-set.ts`.
- **Cross-browser API layer.** `src/platform/browser-api.ts` prefers the
  standard promise-based `browser.*` and falls back to `chrome.*`, so the
  same source runs on Chrome, Safari and Firefox.
- **Layout-agnostic card placement.** The injection fallback no longer
  depends on Google's desktop `#rcnt`/`#center_col` grid.
- **Responsive card.** Verified by rendering the real component at
  390x844: the grid stacks, nothing overflows, the violations toggle is a
  full-width ~44px tap target.

## Steps

### 1. Build the region bundle

```bash
npm run build:columbus
```

Output is in `dist/`. Confirm it is ~1.2MB and that
`dist/manifest.json` → `web_accessible_resources` lists only
`columbus-index-*.json`.

### 2. Convert to an Xcode project

The documented path uses `xcrun safari-web-extension-converter`, which
requires macOS + Xcode:

```bash
xcrun safari-web-extension-converter dist/ --ios-only --project-location ./safari
```

**You are on Windows.** Apple's developer forums indicate you can now
upload a ZIP of the extension to App Store Connect and have it packaged
without a Mac. Verify this against current Apple documentation before
assuming it — if it has changed, the options are a borrowed Mac, a cloud
Mac service (MacStadium, MacinCloud), or a GitHub Actions macOS runner,
which is free for public repos and can run the converter and archive
step.

### 3. Things to check during conversion

- **Background script.** The manifest declares
  `background.service_worker`. Safari supports this in MV3, but older
  Safari versions expect `background.scripts`. If the converter warns,
  the worker is 40 lines of fetch proxying
  (`src/background/service-worker.ts`) and adapts easily.
- **Host permissions.** `myfloridalicense.com` and
  `pressagent.envisionconnect.com` must survive conversion, or the
  on-demand violation fetch silently fails.
- **Permission prompt.** iOS asks per-site. Google.com needs "Always
  Allow" or the content script never runs.

### 4. Install and enable

Build to your own device from Xcode (or TestFlight), then:
**Settings → Apps → Safari → Extensions → PlateCheck → On**, and set
google.com to **Allow**.

### 5. Cost

- Apple Developer Program: **$99/year**, required to run on a physical
  device beyond 7-day free provisioning and to ship to anyone else.
- App Store review applies if you distribute. An extension that reads
  Google results and fetches government sites will get scrutiny — the
  privacy policy (`PRIVACY.md`) and the narrow host permissions are the
  answer to it.

## The one real unknown

**The parser has not been tested against mobile Google's DOM.** Google
serves markup by User-Agent, so it could not be inspected from the
development environment.

The reason for cautious optimism: extraction keys on Google's structured
data hooks — `[data-attrid="title"]` and
`[data-attrid*="location:address"]` — not layout classes, and those are
semantic and shared across surfaces. Placement now falls back to a
container derived from the title and address rather than fixed IDs.

If cards do not appear on the phone, this is the diagnostic: connect the
iPhone to Safari's Web Inspector (Mac) or check the extension console,
and look for the `PlateCheck:` log lines. `PlateCheck: content script
active` with no `facilities loaded` means the index fetch failed;
`facilities loaded` with no match line means the parser found no
candidate — that is the selectors needing a mobile variant, and the fix
belongs in `src/content/selectors.ts` and `parseKnowledgePanel` in
`src/content/parser.ts`.

## Android, for the record

Firefox for Android would work from the same source (the API shim already
covers it) and publishing to addons.mozilla.org is free. It was skipped
deliberately: it requires switching your phone browser to Firefox, which
is a bigger ask than the feature is worth. The path is open if that
changes.
