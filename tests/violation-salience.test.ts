import { describe, it, expect } from "vitest";
import { salienceScore } from "../src/ui/violation-salience";

describe("salienceScore", () => {
  it("scores pest activity highest", () => {
    expect(salienceScore("Roach activity present as evidenced by live roaches found.")).toBe(3);
    expect(salienceScore("Rodent activity present as evidenced by rodent droppings found.")).toBe(3);
    expect(salienceScore("Dead roaches on premises.")).toBe(3);
    expect(salienceScore("Live flies in kitchen.")).toBe(3);
  });

  it("scores contamination and hand hygiene next", () => {
    expect(salienceScore("Accumulation of black/green mold-like substance in the interior of the ice machine.")).toBe(2);
    expect(salienceScore("Sewage/wastewater backing up through floor drains.")).toBe(2);
    expect(salienceScore("Employee failed to wash hands before putting on gloves.")).toBe(2);
    expect(salienceScore("Raw animal food stored over ready-to-eat food.")).toBe(2);
  });

  it("scores soiled surfaces and temperature control above generic items", () => {
    expect(salienceScore("Nonfood-contact surface soiled with grease.")).toBe(1);
    expect(salienceScore("Time/temperature control for safety food cold held at greater than 41 degrees Fahrenheit.")).toBe(1);
  });

  it("scores administrative items zero", () => {
    expect(salienceScore("Carbon dioxide/helium tanks not adequately secured.")).toBe(0);
    expect(salienceScore("Cardboard used to line food-contact shelves.")).toBe(0);
    expect(salienceScore("Employee wearing jewelry other than a plain ring.")).toBe(0);
    expect(salienceScore("Working containers of food removed from original container not identified by common name.")).toBe(0);
  });

  it("orders a mixed severity group most-salient first", () => {
    const group = [
      "Cardboard used to line food-contact shelves.",
      "Nonfood-contact surface soiled with grease.",
      "Roach activity present as evidenced by live roaches found.",
      "Sewage/wastewater backing up through floor drains.",
    ];
    const sorted = [...group].sort((a, b) => salienceScore(b) - salienceScore(a));
    expect(sorted[0]).toContain("Roach");
    expect(sorted[1]).toContain("Sewage");
    expect(sorted[2]).toContain("soiled");
    expect(sorted[3]).toContain("Cardboard");
  });
});
