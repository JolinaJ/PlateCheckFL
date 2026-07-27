// Fetch proxy for lazy, user-initiated official-record detail lookups.
//
// MV3 content scripts are subject to the host page's CORS policy, and
// neither myfloridalicense.com (DBPR) nor pressagent.envisionconnect.com
// (Columbus Public Health) sends CORS headers — so the fetch must happen
// here, in an extension context, where host_permissions apply. (NYC's
// Socrata API does send CORS headers and is fetched directly from the
// content script, so it never reaches this worker.)
//
// This worker must never do anything besides proxying these fetches to the
// allow-listed official sources: no state, no analytics, no other network
// access.

import { runtime } from "../platform/browser-api.js";

const ALLOWED_PREFIXES = [
  "https://www.myfloridalicense.com/",
  "https://pressagent.envisionconnect.com/",
];

interface FetchRequest {
  type: "platecheck:fetch";
  url: string;
}

runtime.onMessage.addListener(
  (raw: unknown, _sender, sendResponse) => {
    const message = raw as FetchRequest | undefined;
    if (message?.type !== "platecheck:fetch") return;

    const url = String(message.url ?? "");
    if (!ALLOWED_PREFIXES.some((prefix) => url.startsWith(prefix))) {
      sendResponse({ ok: false, error: "URL not allowed" });
      return;
    }

    fetch(url, { credentials: "omit" })
      .then(async (res) => {
        if (!res.ok) {
          sendResponse({ ok: false, error: `HTTP ${res.status}` });
          return;
        }
        sendResponse({ ok: true, html: await res.text() });
      })
      .catch((e) => {
        sendResponse({ ok: false, error: e instanceof Error ? e.message : String(e) });
      });

    return true; // keep the channel open for the async response
  }
);
