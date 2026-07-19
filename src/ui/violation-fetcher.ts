import type { IndexedFacility } from "../types/extension.js";

export interface ViolationDetail {
  code: string;
  description: string;
  priority: "high" | "intermediate" | "basic";
  correctedOnSite: boolean;
  isRepeat: boolean;
}

const detailCache = new Map<string, ViolationDetail[]>();

interface FetchResponse {
  ok: boolean;
  html?: string;
  error?: string;
}

const NYC_RESOURCE = "https://data.cityofnewyork.us/resource/43nn-pn8j.json";

export async function fetchViolations(fac: IndexedFacility): Promise<ViolationDetail[]> {
  return fac.j === "nyc" ? fetchNycViolations(fac) : fetchDbprViolations(fac);
}

// Florida: the fetch runs in the background service worker — content
// scripts are subject to the host page's CORS policy, and DBPR sends no
// CORS headers.
async function fetchDbprViolations(fac: IndexedFacility): Promise<ViolationDetail[]> {
  const url = buildDbprDetailUrl(fac);
  if (!url) return [];
  if (detailCache.has(url)) return detailCache.get(url)!;

  const res = (await chrome.runtime.sendMessage({
    type: "platecheck:fetch",
    url,
  })) as FetchResponse | undefined;

  if (!res?.ok || typeof res.html !== "string") {
    throw new Error(res?.error ?? "No response from service worker");
  }

  const violations = parseViolationsFromHtml(res.html);
  detailCache.set(url, violations);
  return violations;
}

export function buildDbprDetailUrl(fac: IndexedFacility): string | null {
  if (!fac.vid || !fac.lid) return null;
  return `https://www.myfloridalicense.com/inspectionDetail.asp?InspVisitID=${encodeURIComponent(fac.vid)}&licid=${encodeURIComponent(fac.lid)}`;
}

// NYC: the Open Data API sends Access-Control-Allow-Origin: *, so the
// content script can fetch it directly — no service worker involved.
async function fetchNycViolations(fac: IndexedFacility): Promise<ViolationDetail[]> {
  const iso = mmDdYyyyToIso(fac.d);
  const url = `${NYC_RESOURCE}?camis=${encodeURIComponent(fac.vid)}&inspection_date=${encodeURIComponent(iso)}&$select=violation_code,violation_description,critical_flag`;
  if (detailCache.has(url)) return detailCache.get(url)!;

  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const rows = (await res.json()) as Array<{
    violation_code?: string;
    violation_description?: string;
    critical_flag?: string;
  }>;

  const violations: ViolationDetail[] = rows
    .filter((r) => r.violation_description)
    .map((r) => ({
      code: r.violation_code ?? "",
      description: r.violation_description!,
      priority: r.critical_flag === "Critical" ? ("high" as const) : ("basic" as const),
      // The NYC dataset does not publish these flags.
      correctedOnSite: false,
      isRepeat: false,
    }));

  detailCache.set(url, violations);
  return violations;
}

function mmDdYyyyToIso(d: string): string {
  const [m, day, y] = d.split("/");
  return `${y}-${m}-${day}T00:00:00.000`;
}

// Exported for unit testing.
export function parseViolationsFromHtml(html: string): ViolationDetail[] {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const violations: ViolationDetail[] = [];

  for (const table of doc.querySelectorAll("table")) {
    // DBPR pages nest the violations table inside several layout tables.
    // An outer table's first row "contains" the inner header cells via
    // querySelectorAll, so only leaf tables can be trusted.
    if (table.querySelector("table")) continue;

    const rows = Array.from(table.querySelectorAll("tr"));
    if (rows.length < 2) continue;

    const headers = Array.from(rows[0].querySelectorAll("th, td")).map(
      (c) => c.textContent?.trim().toLowerCase() ?? ""
    );

    const codeIdx = headers.findIndex((h) => h === "violation");
    const descIdx = headers.findIndex((h) => h === "observation");
    if (codeIdx < 0 || descIdx < 0) continue;

    for (let i = 1; i < rows.length; i++) {
      const cells = Array.from(rows[i].querySelectorAll("td"));
      const code = cells[codeIdx]?.textContent?.trim() ?? "";
      const raw = cells[descIdx]?.textContent?.trim() ?? "";
      if (!code || !raw) continue;

      let priority: "high" | "intermediate" | "basic" = "basic";
      if (/^high priority\s*-/i.test(raw)) priority = "high";
      else if (/^intermediate\s*-/i.test(raw)) priority = "intermediate";

      // Strip severity prefix. Follow-up inspection pages repeat it:
      // "Basic - - From initial inspection : Basic - {description}. Warning"
      let text = raw.replace(/^(high priority|intermediate|basic)\s*-\s*(?:-\s*)?/i, "");
      text = text.replace(/^from initial inspection\s*:\s*(high priority|intermediate|basic)\s*-\s*/i, "");
      // Discard everything from the follow-up inspection marker onward
      text = text.split(/\s*-?\s*from follow-up inspection/i)[0];
      // Strip trailing status markers
      text = text
        .replace(/\s*corrected\s+on-?site\.?\s*$/gi, "")
        .replace(/\s*repeat\s+violation\.?\s*$/gi, "")
        .replace(/\s*warning\.?\s*$/gi, "")
        .replace(/\s*time\s+extended\.?\s*$/gi, "")
        .trim();

      violations.push({
        code,
        description: text,
        priority,
        correctedOnSite: /corrected\s+on-?site/i.test(raw),
        isRepeat: /repeat\s+violation/i.test(raw),
      });
    }

    if (violations.length > 0) break;
  }

  return violations;
}
