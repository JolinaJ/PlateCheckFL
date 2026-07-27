import { parseRestaurantEntries, queryFingerprint } from "./parser.js";
import { matchFacility, buildMatchIndex } from "../matching/dbpr-matcher.js";
import type { MatchIndex } from "../matching/dbpr-matcher.js";
import { injectCard, isAlreadyInjected } from "./injector.js";
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
    const fresh = candidates.filter(
      (c) => !processedFingerprints.has(`${queryFingerprint(c.query)}|${c.context}`)
    );

    // Nothing new to match — don't touch the 26MB indexes. Most Google
    // searches never reach this point, so the data is never loaded.
    if (fresh.length === 0) return;

    const index = await loadIndex();

    for (const { query, entry, context, placement } of fresh) {
      const fp = `${queryFingerprint(query)}|${context}`;
      if (processedFingerprints.has(fp)) continue;
      processedFingerprints.add(fp);

      const matchQuery: ParsedQuery = {
        name: query.name,
        street: query.street,
        city: query.city,
        zip: query.zip,
        phone: query.phone,
      };

      const result = matchFacility(matchQuery, index);

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
        }

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
          console.warn(`${result.coLocatedCount} DBPR licenses share this exact address — showing one of them`);
        }
        console.groupEnd();
      } else {
        console.log(
          `${LOG_PREFIX} ${result.confidence} — "${query.name}"${query.street ? ` @ ${query.street}` : ""} (top score: ${result.candidates[0]?.score ?? 0})`
        );
      }
    }
  } catch (e) {
    console.error(`${LOG_PREFIX} error:`, e);
  }
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
