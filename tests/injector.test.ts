// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { injectCard } from "../src/content/injector";
import type { IndexedFacility } from "../src/types/extension";

function fac(overrides: Partial<IndexedFacility> = {}): IndexedFacility {
  return {
    n: "TEST RESTAURANT", a: "100 MAIN ST", c: "MIAMI", z: "33101",
    ln: "SEA001", co: "Dade", p: "",
    d: "01/15/2026", t: "Routine - Food",
    di: "Inspection Completed - No Further Action",
    hp: 0, im: 0, ba: 0, ic: 1,
    lid: "", vid: "",
    ...overrides,
  };
}

describe("injectCard placement", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("inserts the card after the entry by default (list rows, panel wrappers)", () => {
    document.body.innerHTML = `<div id="rcnt"><div id="row"></div><div id="after"></div></div>`;
    const row = document.getElementById("row")!;
    injectCard(row, fac(), "confirmed", 1, false, "after");

    const card = document.querySelector(".platecheck-host")!;
    expect(row.nextElementSibling).toBe(card);
  });

  it("inserts the card as a full-width row before #center_col for the panel", () => {
    document.body.innerHTML = `<div id="rcnt"><div id="strip"></div><div id="center_col"></div></div>`;
    const centerCol = document.getElementById("center_col")!;
    injectCard(centerCol, fac(), "confirmed", 1, true, "before");

    const card = document.querySelector(".platecheck-host") as HTMLElement;
    // Card is a sibling immediately before #center_col (not a child of it),
    // so it forms its own header row rather than a results-column entry.
    expect(centerCol.previousElementSibling).toBe(card);
    expect(centerCol.contains(card)).toBe(false);
    // Spans the content columns so it aligns with the restaurant title.
    expect(card.style.gridColumn).toBe("2 / -2");
  });

  it("prepends the card inside #rhs for the right-rail panel layout", () => {
    document.body.innerHTML = `<div id="rcnt"><div id="center_col"></div><div id="rhs"><div id="panel"></div></div></div>`;
    const rhs = document.getElementById("rhs")!;
    injectCard(rhs, fac(), "confirmed", 1, true, "prepend");

    const card = document.querySelector(".platecheck-host") as HTMLElement;
    // Card is the first child of the rail, directly above the panel it
    // describes — not a sibling spanning the page.
    expect(rhs.firstElementChild).toBe(card);
    expect(rhs.contains(card)).toBe(true);
    // Must not carry the full-width grid span used by the "before" layout.
    expect(card.style.gridColumn).toBe("");
  });

  it("does not inject twice into the same entry", () => {
    document.body.innerHTML = `<div id="center_col"></div>`;
    const centerCol = document.getElementById("center_col")!;
    injectCard(centerCol, fac(), "confirmed", 1, true, "before");
    injectCard(centerCol, fac(), "confirmed", 1, true, "before");
    expect(document.querySelectorAll(".platecheck-host")).toHaveLength(1);
  });
});
