import { describe, it, expect, afterEach, vi } from "vitest";
import { runtime } from "../src/platform/browser-api";

type Globals = { browser?: unknown; chrome?: unknown };
const globals = globalThis as Globals;

function fakeRuntime(tag: string) {
  return {
    runtime: {
      getURL: (p: string) => `${tag}://${p}`,
      sendMessage: vi.fn(async () => ({ ok: true, from: tag })),
      onMessage: { addListener: vi.fn() },
    },
  };
}

afterEach(() => {
  delete globals.browser;
  delete globals.chrome;
});

describe("browser-api runtime shim", () => {
  it("uses chrome.* when only Chrome's namespace exists", () => {
    globals.chrome = fakeRuntime("chrome");
    expect(runtime.getURL("assets/x.json")).toBe("chrome://assets/x.json");
  });

  it("prefers the standard browser.* namespace when both exist", () => {
    // Firefox exposes both, but its chrome.* alias is callback-based —
    // preferring browser.* is what keeps sendMessage promise-returning.
    globals.chrome = fakeRuntime("chrome");
    globals.browser = fakeRuntime("browser");
    expect(runtime.getURL("assets/x.json")).toBe("browser://assets/x.json");
  });

  it("resolves per call, not once at import", () => {
    // The module is imported before any namespace exists (see the afterEach
    // teardown); a snapshot binding would have captured undefined forever.
    globals.chrome = fakeRuntime("late");
    expect(runtime.getURL("a")).toBe("late://a");
  });

  it("forwards sendMessage and returns the response", async () => {
    globals.browser = fakeRuntime("browser");
    await expect(runtime.sendMessage({ type: "x" })).resolves.toEqual({
      ok: true,
      from: "browser",
    });
  });

  it("forwards onMessage listeners to the live namespace", () => {
    const api = fakeRuntime("browser");
    globals.browser = api;
    const listener = () => true;
    runtime.onMessage.addListener(listener);
    expect(api.runtime.onMessage.addListener).toHaveBeenCalledWith(listener);
  });

  it("throws a named error when no extension API is present", () => {
    expect(() => runtime.getURL("a")).toThrow(/no extension runtime API/i);
  });
});
