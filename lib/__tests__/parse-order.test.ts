import { describe, it, expect } from "vitest";
import {
  normalizeFoodComponent,
  splitFoodComponents,
  normalizeOrderComponents,
  parseOrderText,
  resolveProteinAlias,
  resolveSwallowAlias,
  isSoupMeal,
  KNOWN_PROTEIN_NAMES,
  KNOWN_SWALLOW_NAMES,
} from "../parse-order";

// ── normalizeFoodComponent ────────────────────────────────────────────────────

describe("normalizeFoodComponent", () => {
  it.each([
    ["Goat meat",   "Goatmeat"],
    ["Goat Meat",   "Goatmeat"],
    ["goat meat",   "Goatmeat"],
    ["goat",        "Goatmeat"],
    ["Cow leg",     "Cowleg"],
    ["Cow Leg",     "Cowleg"],
    ["cow leg",     "Cowleg"],
    ["Chiken",      "Chicken"],
    ["chiken",      "Chicken"],
    ["CHIKEN",      "Chicken"],  // normalised via lower() lookup
    ["Pounded Yam", "Poundo"],
    ["pounded yam", "Poundo"],
    ["POUNDED YAM", "Poundo"],   // normalised via lower() lookup
    ["Meat",        "Beef"],
    ["meat",        "Beef"],
    ["MEAT",        "Beef"],     // normalised via lower() lookup
    // Existing valid values remain unchanged
    ["Chicken",     "Chicken"],
    ["Beef",        "Beef"],
    ["Fish",        "Fish"],
    ["Turkey",      "Turkey"],
    ["Egg",         "Egg"],
    ["Poundo",      "Poundo"],
    ["Semo",        "Semo"],
    ["Rice",        "Rice"],
  ])('normalizeFoodComponent("%s") → "%s"', (input, expected) => {
    expect(normalizeFoodComponent(input)).toBe(expected);
  });
});

// ── splitFoodComponents ───────────────────────────────────────────────────────

describe("splitFoodComponents", () => {
  it("splits on comma", () => {
    expect(splitFoodComponents("Semo, Beef")).toEqual(["Semo", "Beef"]);
  });
  it("splits on plus", () => {
    expect(splitFoodComponents("Semo + Beef")).toEqual(["Semo", "Beef"]);
  });
  it("splits on slash", () => {
    expect(splitFoodComponents("Semo/Beef")).toEqual(["Semo", "Beef"]);
  });
  it("handles single value", () => {
    expect(splitFoodComponents("Chicken")).toEqual(["Chicken"]);
  });
  it("filters empty parts", () => {
    expect(splitFoodComponents(",, Semo ,")).toEqual(["Semo"]);
  });
});

// ── normalizeOrderComponents ──────────────────────────────────────────────────

describe("normalizeOrderComponents", () => {
  it.each([
    ["Pounded Yam / Chiken",  ["Poundo",    "Chicken"]],
    ["Rice, Goat meat",       ["Rice",      "Goatmeat"]],
    ["Soup + Cow leg",        ["Soup",      "Cowleg"]],
    ["Semo, Beef",            ["Semo",      "Beef"]],
    ["Semo + Beef",           ["Semo",      "Beef"]],
    ["Semo/Beef",             ["Semo",      "Beef"]],
    ["Meat",                  ["Beef"]],
    ["Goat meat",             ["Goatmeat"]],
    ["Chiken",                ["Chicken"]],
  ] as [string, string[]][])('normalizeOrderComponents("%s")', (input, expected) => {
    expect(normalizeOrderComponents(input)).toEqual(expected);
  });

  it("accepts a pre-split array", () => {
    expect(normalizeOrderComponents(["Meat", "Semo"])).toEqual(["Beef", "Semo"]);
  });
});

// ── resolveProteinAlias ───────────────────────────────────────────────────────

describe("resolveProteinAlias", () => {
  it("goat meat → goatmeat", () => expect(resolveProteinAlias("goat meat")).toBe("goatmeat"));
  it("goat → goatmeat",      () => expect(resolveProteinAlias("goat")).toBe("goatmeat"));
  it("cow leg → cowleg",     () => expect(resolveProteinAlias("cow leg")).toBe("cowleg"));
  it("chiken → chicken",     () => expect(resolveProteinAlias("chiken")).toBe("chicken"));
  it("meat → beef",          () => expect(resolveProteinAlias("meat")).toBe("beef"));
  it("chicken unchanged",    () => expect(resolveProteinAlias("chicken")).toBe("chicken"));
  it("beef unchanged",       () => expect(resolveProteinAlias("beef")).toBe("beef"));
});

// ── resolveSwallowAlias ───────────────────────────────────────────────────────

describe("resolveSwallowAlias", () => {
  it("pounded yam → poundo", () => expect(resolveSwallowAlias("pounded yam")).toBe("poundo"));
  it("garri → eba",          () => expect(resolveSwallowAlias("garri")).toBe("eba"));
  it("semo unchanged",       () => expect(resolveSwallowAlias("semo")).toBe("semo"));
  it("poundo unchanged",     () => expect(resolveSwallowAlias("poundo")).toBe("poundo"));
});

// ── parseOrderText separator handling ────────────────────────────────────────

describe("parseOrderText comma/slash separators", () => {
  it("splits on comma", () => {
    const result = parseOrderText("Semo, Beef");
    expect(result.mainMeal).toBe("Semo");
    expect(result.addOns).toContain("Beef");
    expect(result.hasSeparator).toBe(true);
  });
  it("splits on slash", () => {
    const result = parseOrderText("Semo/Beef");
    expect(result.mainMeal).toBe("Semo");
    expect(result.addOns).toContain("Beef");
  });
  it("splits on plus", () => {
    const result = parseOrderText("Semo + Beef");
    expect(result.mainMeal).toBe("Semo");
    expect(result.addOns).toContain("Beef");
  });
  it("handles multi-component: Pounded Yam / Chiken", () => {
    const result = parseOrderText("Pounded Yam / Chiken");
    expect(result.mainMeal).toBe("Pounded Yam");
    expect(result.addOns).toContain("Chiken");
  });
  it("handles Rice, Goat meat", () => {
    const result = parseOrderText("Rice, Goat meat");
    expect(result.mainMeal).toBe("Rice");
    expect(result.addOns).toContain("Goat meat");
  });
});

// ── isSoupMeal ────────────────────────────────────────────────────────────────

describe("isSoupMeal", () => {
  it.each([
    // Explicit "soup" word — various cases
    "Egusi Soup",
    "egusi soup",
    "EGUSI SOUP",
    "Vegetable Soup",
    "Okro Soup",
    "Afang Soup",
    "Oha Soup",
    "Ogbono Soup",
    "Bitterleaf Soup",
    "Native Soup",
    "White Soup",
    "Black Soup",
    "Okro Soup with Swallow",
    // Soup-like names without "soup"
    "Edikang Ikong",
    "Edikang Ikong with Semo",
    "edikang ikong",
    "Edikiankong",
    "Seafood Okro",
    "Seafood Okra",
    "Banga",
    "Ofe Onugbu",
  ])('isSoupMeal("%s") → true', (input) => {
    expect(isSoupMeal(input)).toBe(true);
  });

  it.each([
    "Jollof Rice",
    "Fried Rice",
    "Pottage Beans",
    "Spaghetti",
    "Chicken and Chips",
    "Fruits Only",
    "Beef",
    "Chicken",
  ])('isSoupMeal("%s") → false', (input) => {
    expect(isSoupMeal(input)).toBe(false);
  });
});

// ── KNOWN_ vocabulary sanity ──────────────────────────────────────────────────

describe("KNOWN vocabulary", () => {
  it("contains Goatmeat (not Goat Meat)", () => {
    expect(KNOWN_PROTEIN_NAMES).toContain("Goatmeat");
    expect(KNOWN_PROTEIN_NAMES).not.toContain("Goat Meat");
  });
  it("does not contain Pounded Yam (normalised to Poundo)", () => {
    expect(KNOWN_SWALLOW_NAMES).not.toContain("Pounded Yam");
    expect(KNOWN_SWALLOW_NAMES).toContain("Poundo");
  });
});
