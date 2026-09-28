// Refuses to let a data refresh publish an index that got dramatically worse.
//
// This exists because of two bugs that both had the same shape: a routine
// command that reads like a partial update but performs a full replacement.
// DBPR's extract resets every July 1, so ingesting it directly replaced a
// year with six weeks; and ingesting a single district rebuilt the statewide
// index from that district alone. Both are fixed, but both were invisible --
// the pipeline reported success and the index was simply smaller.
//
// So the size of the index is now a checked invariant rather than something
// noticed later. Run after ingest, before committing.
import { execSync } from "child_process";
import { readFileSync } from "fs";

const INDEX = "src/data/dbpr-index.json";
// A real week adds facilities and removes a few closures. A drop past this is
// not attrition, it is a pipeline failure.
const MAX_SHRINK = 0.05;

function parseDate(s) {
  const [m, d, y] = s.split("/");
  return new Date(+y, +m - 1, +d);
}

function summarize(records, label) {
  const dates = records.map((r) => r.d).filter(Boolean).map(parseDate).sort((a, b) => a - b);
  return {
    label,
    count: records.length,
    newest: dates.length ? dates[dates.length - 1] : null,
  };
}

const next = summarize(JSON.parse(readFileSync(INDEX, "utf-8")), "new");

let prev = null;
try {
  const committed = execSync(`git show HEAD:${INDEX}`, {
    maxBuffer: 1024 * 1024 * 256,
    encoding: "utf-8",
  });
  prev = summarize(JSON.parse(committed), "committed");
} catch {
  console.log("No committed index to compare against — first run, accepting.");
}

const fmt = (d) => (d ? d.toISOString().slice(0, 10) : "none");
console.log(`new index:       ${next.count} facilities, newest inspection ${fmt(next.newest)}`);
if (prev) {
  console.log(`committed index: ${prev.count} facilities, newest inspection ${fmt(prev.newest)}`);
}

const problems = [];
if (next.count === 0) problems.push("the new index is empty");
if (prev) {
  const shrink = (prev.count - next.count) / prev.count;
  if (shrink > MAX_SHRINK) {
    problems.push(
      `facility count fell ${(shrink * 100).toFixed(1)}% (${prev.count} -> ${next.count}), past the ${MAX_SHRINK * 100}% limit`
    );
  }
  if (prev.newest && next.newest && next.newest < prev.newest) {
    problems.push(
      `newest inspection went backwards (${fmt(prev.newest)} -> ${fmt(next.newest)})`
    );
  }
}

if (problems.length > 0) {
  console.error("\nIndex sanity check FAILED:");
  for (const p of problems) console.error(`  - ${p}`);
  console.error("\nRefusing to publish. The archive in data/archive/ is intact;");
  console.error("investigate before committing.");
  process.exit(1);
}
console.log("\nIndex sanity check passed.");
