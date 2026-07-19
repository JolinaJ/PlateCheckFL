// Fetch proxy for lazy, user-initiated DBPR detail lookups.
//
// MV3 content scripts are subject to the host page's CORS policy, and
// myfloridalicense.com sends no CORS headers — so the fetch must happen
// here, in an extension context, where host_permissions apply.
//
// This worker must never do anything besides proxying these fetches:
// no state, no analytics, no other network access.

const ALLOWED_PREFIX = "https://www.myfloridalicense.com/";

interface FetchRequest {
  type: "platecheck:fetch";
  url: string;
}

chrome.runtime.onMessage.addListener(
  (message: FetchRequest, _sender, sendResponse) => {
    if (message?.type !== "platecheck:fetch") return;

    const url = String(message.url ?? "");
    if (!url.startsWith(ALLOWED_PREFIX)) {
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
