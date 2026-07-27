// The extension APIs PlateCheck actually uses, resolved across engines.
//
// Chrome exposes only `chrome.*`. Firefox and Safari expose the standard
// `browser.*` (promise-based) and also alias `chrome.*` — but in Firefox
// the `chrome.*` alias is callback-based, so preferring `browser` is what
// keeps `sendMessage` promise-returning everywhere. Chrome MV3's
// `chrome.runtime.sendMessage` already returns a promise when called
// without a callback, so the same call site works on all three.
//
// This is deliberately a hand-written three-method shim rather than a
// polyfill dependency: that is the entire API surface (getURL,
// sendMessage, onMessage) and it is not expected to grow.

export interface RuntimeMessageSender {
  readonly id?: string;
}

export interface MinimalRuntime {
  /** Absolute URL for a packaged resource, on the extension origin. */
  getURL(path: string): string;
  /** Send to the background worker; resolves with its response. */
  sendMessage(message: unknown): Promise<unknown>;
  onMessage: {
    addListener(
      callback: (
        message: unknown,
        sender: RuntimeMessageSender,
        sendResponse: (response: unknown) => void
      ) => boolean | void
    ): void;
  };
}

interface ExtensionGlobal {
  browser?: { runtime?: MinimalRuntime };
  chrome?: { runtime?: MinimalRuntime };
}

// Resolved per call, not once at import: the engine's globals are not
// guaranteed to be installed before this module is evaluated, and binding
// a snapshot would capture `undefined` for good.
function resolveRuntime(): MinimalRuntime {
  const globals = globalThis as unknown as ExtensionGlobal;
  // Prefer the standard namespace; fall back to Chrome's.
  const found = globals.browser?.runtime ?? globals.chrome?.runtime;
  if (!found) {
    throw new Error("PlateCheck: no extension runtime API available");
  }
  return found;
}

export const runtime: MinimalRuntime = {
  getURL: (path) => resolveRuntime().getURL(path),
  sendMessage: (message) => resolveRuntime().sendMessage(message),
  onMessage: {
    addListener: (callback) => resolveRuntime().onMessage.addListener(callback),
  },
};
