import { describe, it, expect } from "vitest";
import { buildColumbusIndex, type ColumbusFeatureAttrs } from "../src/ingest/columbus";

function feature(attrs: Partial<ColumbusFeatureAttrs>) {
  return { attributes: attrs };
}

describe("buildColumbusIndex", () => {
  it("maps ArcGIS attributes to the compact overview facility", () => {
    const [f] = buildColumbusIndex([
      feature({
        FACILITY_ID: "FA0001406",
        BUSINESS_NAME: "Mama Mimi's Take-N-Bake Pizza",
        SITE_ADDRESS: "2092 W Henderson Rd ",
        CITY: "Columbus",
        STATE: "OH",
        ZIP: "43220-1234",
        PHONE: "6144594114",
        STATUS_DESCRIP: "Standards Met",
      }),
    ]);
    expect(f.n).toBe("MAMA MIMI'S TAKE-N-BAKE PIZZA");
    expect(f.a).toBe("2092 W HENDERSON RD");
    expect(f.c).toBe("COLUMBUS");
    expect(f.z).toBe("43220"); // trimmed to 5 digits
    expect(f.p).toBe("(614)459-4114"); // normalized to DBPR-style formatting
    expect(f.ln).toBe("FA0001406");
    expect(f.vid).toBe("FA0001406"); // on-demand fetch key
    expect(f.di).toBe("Standards Met"); // status carried as disposition
    expect(f.j).toBe("columbus");
    // No violation counts or date are bundled — those are on-demand.
    expect(f.hp).toBe(0);
    expect(f.ba).toBe(0);
    expect(f.d).toBe("");
  });

  it("falls back to FACILITY_NAME when BUSINESS_NAME is missing", () => {
    const [f] = buildColumbusIndex([
      feature({ FACILITY_ID: "FA1", FACILITY_NAME: "Corner Market", SITE_ADDRESS: "1 Main St" }),
    ]);
    expect(f.n).toBe("CORNER MARKET");
  });

  it("drops rows without a facility id or without a name", () => {
    const out = buildColumbusIndex([
      feature({ BUSINESS_NAME: "No Id Diner", SITE_ADDRESS: "5 Elm St" }),
      feature({ FACILITY_ID: "FA2", SITE_ADDRESS: "6 Oak St" }),
    ]);
    expect(out).toHaveLength(0);
  });

  it("dedupes repeated facility ids (multiple permit rows)", () => {
    const out = buildColumbusIndex([
      feature({ FACILITY_ID: "FA3", BUSINESS_NAME: "Cafe One", SITE_ADDRESS: "7 Pine St" }),
      feature({ FACILITY_ID: "FA3", BUSINESS_NAME: "Cafe One", SITE_ADDRESS: "7 Pine St" }),
    ]);
    expect(out).toHaveLength(1);
  });

  it("passes through non-10-digit phone values unchanged", () => {
    const [f] = buildColumbusIndex([
      feature({ FACILITY_ID: "FA4", BUSINESS_NAME: "X", SITE_ADDRESS: "8 Ash St", PHONE: "614-459" }),
    ]);
    expect(f.p).toBe("614-459");
  });
});
