import { parseRestaurantEntries, queryFingerprint } from "./parser.js";
import {
  matchFacility,
  buildMatchIndex,
  coverageLabel,
  authoritiesForQuery,
  noMatchCandidates,
} from "../matching/dbpr-matcher.js";
import type { MatchIndex } from "../matching/dbpr-matcher.js";
import { injectCard, injectNoMatchNote, isAlreadyInjected } from "./injector.js";
import type { IndexedFacility, ParsedQuery } from "../types/extension.js";
// The indexes are imported as URLs, not values, so each is emitted as a
// standalone web-accessible asset instead of inlining ~28MB of records
// into the content-script bundle that loads on every Google Search page.
// The data is fetched lazily (see loadIndex) only when a page actually
// has a restaurant candidate to match. Which indexes are in the set is a
// build-time choice — all of them on desktop, one region on mobile.
import { INDEX_URLS } from "../data/index-set.js";
import { runtime } from "../platform/browser-api.js";

const DEBOUNCE_MS = 300;
const LOG_PREFIX = "PlateCheck:";
// Per-listing match detail (the listing text, candidate records, the
// near-miss shortlist) is for tuning the matcher and prints only in the
// `npm run dev` watch build, which runs Vite in development mode. Store and
// region builds print just the name-free lines: "content script active",
// "N facilities loaded" and one summary per run, which are what MOBILE.md's
// troubleshooting steps look for.
const DEBUG = import.meta.env.MODE === "development";

let indexPromise: Promise<MatchIndex> | null = null;

// Load and merge both jurisdiction indexes once, on first demand, and
// build the token index that makes each query cheap. The promise is cached
// so concurrent MutationObserver bursts share a single load; on failure it
// is cleared so a later page mutation can retry.
function loadIndex(): Promise<MatchIndex> {
  if (indexPromise) return indexPromise;
  // ?url yields a root-relative path (/assets/…); in a content script that
  // would resolve against the *page* origin (google.com), so route it
  // through runtime.getURL to hit the extension origin instead.
  indexPromise = Promise.all(
    INDEX_URLS.map((url) =>
      fetch(runtime.getURL(url)).then((r) => r.json() as Promise<IndexedFacility[]>)
    )
  )
    .then((sets) => {
      const facilities = sets.flat();
      const index = buildMatchIndex(facilities);
      console.log(`${LOG_PREFIX} ${facilities.length} facilities loaded`);
      return index;
    })
    .catch((e) => {
      indexPromise = null;
      throw e;
    });
  return indexPromise;
}

console.log(`${LOG_PREFIX} content script active`);

const processedFingerprints = new Set<string>();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

async function runParsing(): Promise<void> {
  try {
    const candidates = parseRestaurantEntries(document);

    // The context is part of the fingerprint: clicking a restaurant in the
    // local pack opens its panel, and the panel must still get its
    // prominent card even though the same restaurant already received a
    // card in the list.
    // Google Maps is a single-page app: opening another place swaps the
    // panel out and takes the injected card with it, and navigating back
    // rebuilds it from scratch. So a fingerprint we have already processed
    // is not proof a card is still on screen — re-process when this
    // particular element has no card. injectCard marks the element before
    // it does any work, so this cannot loop.
    const fresh = candidates.filter(
      (c) =>
        !processedFingerprints.has(`${queryFingerprint(c.query)}|${c.context}`) ||
        !isAlreadyInjected(c.entry)
    );

    // Nothing new to match — don't touch the 26MB indexes. Most Google
    // searches never reach this point, so the data is never loaded.
    if (fresh.length === 0) return;

    const index = await loadIndex();

    let checked = 0;
    let cards = 0;
    let notes = 0;

    for (const { query, entry, context, placement } of fresh) {
      // Same reasoning as the `fresh` filter above: a seen fingerprint
      // only means "skip" while its card is still in the document.
      const fp = `${queryFingerprint(query)}|${context}`;
      if (processedFingerprints.has(fp) && isAlreadyInjected(entry)) continue;
      processedFingerprints.add(fp);

      const matchQuery: ParsedQuery = {
        name: query.name,
        street: query.street,
        city: query.city,
        zip: query.zip,
        phone: query.phone,
      };

      const result = matchFacility(matchQuery, index);
      checked++;

      if (
        result.facility &&
        (result.confidence === "confirmed" || result.confidence === "likely")
      ) {
        if (!isAlreadyInjected(entry)) {
          injectCard(
            entry,
            result.facility,
            result.confidence,
            result.coLocatedCount,
            context === "panel",
            placement
          );
          cards++;
        }

        if (DEBUG) {
          const flags = [
            result.suiteMismatch && "SUITE MISMATCH",
            result.streetNameMismatch && "STREET NAME MISMATCH",
            result.coLocatedCount > 1 && `${result.coLocatedCount} LICENSES AT THIS ADDRESS`,
          ].filter(Boolean);

          console.groupCollapsed(
            `${LOG_PREFIX} ${result.confidence} — ${result.facility.n} (score: ${result.score})${flags.length ? ` [${flags.join(", ")}]` : ""}`
          );
          console.log("query:", query.name, query.street ?? "", query.city ?? "");
          console.log("matched:", result.facility.n, result.facility.a, result.facility.c);
          console.log("inspection:", result.facility.d, result.facility.di);
          if (result.suiteMismatch) {
            console.warn("suite/unit mismatch — query and facility specify different units at the same base address");
          }
          if (result.streetNameMismatch) {
            console.warn("street name mismatch — house number and name match, but the street name text differs (possible street rename)");
          }
          if (result.coLocatedCount > 1) {
            console.warn(`${result.coLocatedCount} licenses share this exact address — showing one of them`);
          }
          console.groupEnd();
        }
      } else {
        // No card — say why instead of staying silent. The note is
        // deliberately subordinate to a real card and its copy describes
        // our record set only; see src/ui/no-match-note.ts for why that
        // framing is load-bearing rather than cosmetic.
        const reason = result.noMatchReason ?? "no-record";
        if (!isAlreadyInjected(entry)) {
          injectNoMatchNote(
            entry,
            reason,
            coverageLabel(index),
            authoritiesForQuery(matchQuery, index),
            context === "panel",
            placement
          );
          notes++;
        }

        // The near-miss records are no longer shown to the reader — naming
        // establishments we could not tie to this listing puts our guess in
        // front of them as a finding. They remain the most useful thing in
        // the log when tuning the matcher, so they are reported here, in
        // development builds only.
        if (DEBUG) {
          const shortlist = noMatchCandidates(result, matchQuery);
          console.groupCollapsed(
            `${LOG_PREFIX} ${result.confidence} (${reason}) — "${query.name}"${query.street ? ` @ ${query.street}` : ""} (top score: ${result.candidates[0]?.score ?? 0})`
          );
          console.log("query:", query.name, query.street ?? "", query.city ?? "", query.zip ?? "");
          for (const c of result.candidates) {
            console.log(`  ${c.score} ${c.confidence} — ${c.facility.n} | ${c.facility.a}, ${c.facility.c} ${c.facility.z}`);
          }
          if (result.addressOccupant) {
            console.log("address occupant:", result.addressOccupant.n, "|", result.addressOccupant.a);
          }
          console.log("would-have-shown:", shortlist.map((f) => f.n));
          console.groupEnd();
        }
      }
    }

    // One name-free line per run, in every build: counts only, never the
    // text of a listing or a record.
    if (checked > 0) {
      console.log(
        `${LOG_PREFIX} ${plural(checked, "listing")} checked — ${plural(cards, "card")}, ${plural(notes, "note")}`
      );
    }
  } catch (e) {
    console.error(`${LOG_PREFIX} error:`, e);
  }
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function debouncedParsing(): void {
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runParsing();
  }, DEBOUNCE_MS);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => runParsing());
} else {
  runParsing();
}

try {
  const searchRoot =
    document.getElementById("search") ??
    document.getElementById("rso") ??
    document.body;
  const observer = new MutationObserver(() => debouncedParsing());
  observer.observe(searchRoot, { childList: true, subtree: true });
} catch { /* no suitable root */ }
