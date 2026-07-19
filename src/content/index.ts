import { parseRestaurantEntries, queryFingerprint } from "./parser.js";
import { matchFacility } from "../matching/dbpr-matcher.js";
import { injectCard, isAlreadyInjected } from "./injector.js";
import type { IndexedFacility, ParsedQuery } from "../types/extension.js";
import dbprIndex from "../data/dbpr-index.json";
import nycIndex from "../data/nyc-index.json";

const facilities = (dbprIndex as IndexedFacility[]).concat(
  nycIndex as IndexedFacility[]
);
const DEBOUNCE_MS = 300;
const LOG_PREFIX = "PlateCheck FL:";

console.log(`${LOG_PREFIX} content script active (${facilities.length} facilities loaded)`);

const processedFingerprints = new Set<string>();
let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function runParsing(): void {
  try {
    const candidates = parseRestaurantEntries(document);

    for (const { query, entry } of candidates) {
      const fp = queryFingerprint(query);
      if (processedFingerprints.has(fp)) continue;
      processedFingerprints.add(fp);

      const matchQuery: ParsedQuery = {
        name: query.name,
        street: query.street,
        city: query.city,
        zip: query.zip,
        phone: query.phone,
      };

      const result = matchFacility(matchQuery, facilities);

      if (
        result.facility &&
        (result.confidence === "confirmed" || result.confidence === "likely")
      ) {
        if (!isAlreadyInjected(entry)) {
          injectCard(entry, result.facility, result.confidence, result.coLocatedCount);
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
