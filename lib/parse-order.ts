/**
 * Shared order-text parsing utilities.
 *
 * This is the single source of truth for splitting a customer order string
 * into its main meal + add-on components.  Both the upload processor
 * (lib/decompose.ts → lib/avon-orders.ts) and the exception resolver UI
 * (app/(app)/exceptions/page.tsx) import from here so parsing is always
 * consistent (Business Rule §12).
 *
 * Business rules implemented:
 *   §1  — `+`, `with`, and contextually `and` are meal separators.
 *   §2  — Main meal is the block before the first recognised separator.
 *   §4  — Menu item canonical names are also split to extract their main meal.
 *   §6  — Garri / Gari are canonicalised to "Eba".
 *   §7  — Add-ons are classified as protein / swallow / side.
 *   §8  — Normalization: lowercase, trim, collapse spaces, strip punctuation.
 *   §11 — Generic swallow phrases ("with swallow", "+ swallow", etc.) are
 *          classified as GENERIC_SWALLOW_VALUE ("Not Selected") instead of
 *          being dropped as unrecognised sides.
 *   §1b — No-lunch entries ("NO LUNCH REQUIRED", "nil", "N/A", etc.) are
 *          detected and must be skipped with no order_line or exception.
 *   §3  — Add-on tokens after the main-meal separator are also split on `+`
 *          so that "Okro Soup + Eba + Fish" yields three separate parts.
 *   §5  — Protein aliases: "assorted" → "Assorted Meat", "goat" → "Goat Meat",
 *          "cow meat" → "Beef", "boiled egg" → "Egg", etc.
 *   §10 — No-protein annotations ("(No Extra Protein)", "(No Protein)", etc.)
 *          in either the order text or the menu item name indicate that protein
 *          is not required — no exception, no release blocker.  The phrase is
 *          stripped before matching so it does not interfere with menu lookup.
 */

// ── Separator patterns ────────────────────────────────────────────────────────

/**
 * Primary separators used to split the main meal from its add-ons.
 *
 * Alternatives (tried left-to-right at each string position — leftmost wins):
 *   1. `+`              — explicit add-on marker.
 *   2. `served with`    — service phrase used in many customer uploads:
 *                         "Edikiankong Soup Served with Semo with Beef".
 *                         Because the regex engine finds the LEFTMOST match,
 *                         " Served with " is found before the plain " with "
 *                         that comes later in the same string, which cleanly
 *                         separates the main meal ("Edikiankong Soup") from
 *                         the add-on portion ("Semo with Beef").
 *   3. `with`           — plain meal/add-on separator.
 *
 * Note: `and` is intentionally excluded here; it is a weaker separator
 * handled separately by AND_SEP_RE only when no primary separator is found.
 */
const PRIMARY_SEP_RE = /\s*\+\s*|\s+served\s+with\s+|\s+with\s+/i;

/**
 * Secondary separator: `and` (case-insensitive, surrounded by required
 * whitespace so it is not matched inside a word).
 * Used as the primary separator only when no `+` or `with` is present.
 */
const AND_SEP_RE = /\s+and\s+/gi;

/**
 * Used to split the add-on portion into individual tokens.
 * `+`, `with`, and `and` all act as add-on separators.
 *
 * IMPORTANT: `with` IS included here, unlike the old implementation.
 * After the primary split, any remaining `with` inside the add-on string
 * must also be treated as a token boundary.  Without this, a phrase like
 * "Semo with Beef" would remain as a single undivided token and "Beef"
 * would never be extracted as a protein.
 *
 * Examples:
 *   "Semo with Beef"         → ["Semo", "Beef"]
 *   "Dodo with Fish"         → ["Dodo", "Fish"]
 *   "Eba + Fish"             → ["Eba", "Fish"]
 *   "Semo and Beef"          → ["Semo", "Beef"]
 *   "Eba + Fish and Beef"    → ["Eba", "Fish", "Beef"]
 *   "Coleslaw with Chicken"  → ["Coleslaw", "Chicken"]
 */
const ADDON_SEP_RE = /\s*\+\s*|\s+with\s+|\s+and\s+/gi;

// ── No-lunch / skip detection ─────────────────────────────────────────────────

/**
 * Lower-cased, whitespace-collapsed phrases that mean the employee does not
 * want a meal on this day.  When the ENTIRE order text normalises to one of
 * these values the row must be silently skipped — no order_line, no exception,
 * no production count (Business Rule §1b).
 */
const NO_LUNCH_PHRASES: ReadonlySet<string> = new Set([
  "no lunch required",
  "no lunch",
  "no lunch today",
  "lunch not required",
  "no meal",
  "no meal required",
  "no meal today",
  "no food",
  "not eating",
  "none",
  "nil",
  "n/a",
  "na",
]);

/**
 * Return true when the raw order text represents a "no meal today" entry that
 * must be silently skipped.
 *
 * Detection is against the full normalised string (lowercase, collapsed
 * whitespace) so it does NOT fire for legitimate meal names that merely happen
 * to contain words like "no" or "none" inside a longer phrase.
 */
export function isNoLunchEntry(text: string): boolean {
  const normalized = text.toLowerCase().trim().replace(/\s+/g, " ");
  return NO_LUNCH_PHRASES.has(normalized);
}

// ── Generic swallow detection ─────────────────────────────────────────────────

/**
 * The canonical swallow value written when an order clearly indicates that a
 * swallow is required but does not specify which type (Business Rule §4/§11).
 *
 * Exported so callers (dashboards, tests, kitchen-quantity logic) can compare
 * against this constant rather than hardcoding the string.
 */
export const GENERIC_SWALLOW_VALUE = "Not Selected" as const;

/**
 * Whole-phrase lower-case tokens that indicate generic ("any") swallow.
 * Matched against the trimmed, lower-cased add-on token before vocabulary
 * lookup so that "swallow", "any swallow", "choice of swallow", etc. are
 * captured as GENERIC_SWALLOW_VALUE instead of falling through to sideNames.
 */
const GENERIC_SWALLOW_PHRASES: ReadonlySet<string> = new Set([
  "swallow",
  "any swallow",
  "choice of swallow",
  "your choice of swallow",
  "swallow of choice",
  "with swallow",         // handles oddly-formatted columns that include the separator word
  "swallow option",
  "preferred swallow",    // used by some ELCREST / Heirs spreadsheet columns
]);

/**
 * Return true when a lower-cased, trimmed add-on token is a generic swallow
 * reference — the customer wants swallow but did not name the type.
 *
 * Matches:
 *   • exact phrases in GENERIC_SWALLOW_PHRASES
 *   • phrases that *start with* a generic swallow phrase followed by a space
 *     (handles annotations like "swallow (to be confirmed)")
 */
export function isGenericSwallow(lower: string): boolean {
  if (GENERIC_SWALLOW_PHRASES.has(lower)) return true;
  for (const phrase of GENERIC_SWALLOW_PHRASES) {
    if (lower.startsWith(phrase + " ")) return true;
  }
  return false;
}

// ── Garri / Gari → Eba canonicalization ──────────────────────────────────────

/** Lowercase raw swallow name → canonical name (Business Rule §6). */
const SWALLOW_ALIAS_MAP: Readonly<Record<string, string>> = {
  garri: "Eba",
  gari:  "Eba",
};

/**
 * Map Garri / Gari spelling variants to the canonical swallow name "Eba".
 * All other values are returned unchanged.  Comparison is case-insensitive.
 */
export function normalizeSwallowAlias(name: string): string {
  return SWALLOW_ALIAS_MAP[name.toLowerCase().trim()] ?? name;
}

// ── Main parsing ──────────────────────────────────────────────────────────────

export type ParsedOrderText = {
  /** Text before the first separator — the main dish. */
  mainMeal: string;
  /** Zero or more add-on tokens that followed the separator. */
  addOns: string[];
  /**
   * True when a separator (`+`, `with`, or `and`) was found in the text.
   * False means the entire text is the main meal with no add-ons.
   */
  hasSeparator: boolean;
};

/**
 * Split a raw order string into its main meal and add-on components.
 *
 * Rules:
 *   - `+` and `with` are always primary separators.
 *   - `and` is used as a primary separator only when neither `+` nor `with`
 *     is present; within the add-on list `and` always splits further.
 *
 * Examples:
 *   "Jollof Rice + Dodo"                        → { main: "Jollof Rice", addOns: ["Dodo"] }
 *   "Jollof Rice with Chicken"                  → { main: "Jollof Rice", addOns: ["Chicken"] }
 *   "Okro Soup and Eba"                         → { main: "Okro Soup",   addOns: ["Eba"] }
 *   "Egusi Soup with Beef and Semo"             → { main: "Egusi Soup",  addOns: ["Beef","Semo"] }
 *   "Edikiankong Soup Served with Semo with Beef"
 *                                               → { main: "Edikiankong Soup", addOns: ["Semo","Beef"] }
 *   "Pottage Beans with Dodo with Fish"         → { main: "Pottage Beans",   addOns: ["Dodo","Fish"] }
 *   "Jollof Rice"                               → { main: "Jollof Rice", addOns: [], hasSeparator: false }
 */
export function parseOrderText(text: string): ParsedOrderText {
  const cleaned = text.trim().replace(/\s+/g, " ");

  // ── Attempt primary split on `+` or `with` ───────────────────────────────
  const primaryMatch = PRIMARY_SEP_RE.exec(cleaned);
  let mainRaw: string;
  let restRaw: string | null = null;

  if (primaryMatch) {
    mainRaw = cleaned.slice(0, primaryMatch.index).trim();
    restRaw = cleaned.slice(primaryMatch.index + primaryMatch[0].length).trim();
  } else {
    // ── Attempt secondary split on `and` ─────────────────────────────────
    AND_SEP_RE.lastIndex = 0;
    const andMatch = AND_SEP_RE.exec(cleaned);
    if (andMatch) {
      mainRaw = cleaned.slice(0, andMatch.index).trim();
      restRaw = cleaned.slice(andMatch.index + andMatch[0].length).trim();
    } else {
      // No separator — whole string is the main meal.
      return { mainMeal: cleaned, addOns: [], hasSeparator: false };
    }
  }

  // ── Split add-on portion on `+`, `with`, and `and` ──────────────────────
  // Using ADDON_SEP_RE so that "Eba + Fish", "Semo with Beef", "Eba and
  // Chicken", and combinations thereof each yield separate tokens.
  // `with` IS included (unlike older versions) because the primary split
  // only consumed the FIRST separator — any remaining `with` occurrences
  // in the add-on string must also be treated as token boundaries so that
  // "Semo with Beef" → ["Semo","Beef"] and "Dodo with Fish" → ["Dodo","Fish"].
  //
  // Leading-connector strip: after PRIMARY_SEP_RE consumes e.g. " Served With "
  // the restRaw can begin with a bare connector word ("and Eba and Beef").
  // Because ADDON_SEP_RE requires whitespace on both sides (`\s+and\s+`), that
  // leading "and" is NOT matched as a separator — it ends up glued to the first
  // token ("and Eba"), which then fails the swallow vocabulary lookup.
  // Stripping the leading connector from each token after the split fixes this.
  ADDON_SEP_RE.lastIndex = 0;
  const addOns = restRaw
    ? restRaw
        .split(ADDON_SEP_RE)
        .map((s) => s.replace(/^(?:served\s+with|and|with)\s+/i, "").trim())
        .filter(Boolean)
    : [];

  return { mainMeal: mainRaw, addOns, hasSeparator: true };
}

/**
 * Return just the main-meal part of an order or menu-item string.
 * Equivalent to `parseOrderText(text).mainMeal`.
 */
export function extractMainMeal(text: string): string {
  return parseOrderText(text).mainMeal;
}

// ── Normalization ─────────────────────────────────────────────────────────────

const MAIN_MEAL_PUNCT_RE = /[,&+()\-/:'"]/g;

/**
 * Normalise a main-meal string for comparison: lowercase, trim, collapse
 * whitespace, strip common punctuation.
 *
 * Unlike the legacy `normalize()` function in matchMeal.ts, this does NOT
 * strip stopwords such as "with" or "and" — those are handled at the
 * separator-split stage instead.
 */
export function normalizeMainMeal(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(MAIN_MEAL_PUNCT_RE, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// ── Protein alias normalization ───────────────────────────────────────────────

/**
 * Maps lower-cased protein abbreviations / alternate customer-written forms to
 * the canonical name that the vocabulary is expected to contain.
 *
 * Applied in classifyAddOns before the vocabulary lookup so that tokens like
 * "assorted" and "goat" resolve against "Assorted Meat" / "Goat Meat" in the
 * menu, and "cow meat" or "boiled egg" map to the right canonical entry.
 *
 * Keys MUST be lower-cased.  Values are the expected canonical menu name.
 */
const PROTEIN_ALIAS_MAP: Readonly<Record<string, string>> = {
  // Abbreviated names that expand to a longer vocabulary entry
  "assorted":           "Assorted Meat",
  "assorted meat":      "Assorted Meat",
  "assorted meats":     "Assorted Meat",
  "goat":               "Goat Meat",
  // Renamed / equivalent forms
  "cow meat":           "Beef",
  "cowmeat":            "Beef",
  "cow":                "Beef",
  // Cowleg space-variant normalisation
  "cow leg":            "Cowleg",
  "cow-leg":            "Cowleg",
  // Ponmo alternate spellings
  "pomo":               "Ponmo",
  "pmomo":              "Ponmo",
  // Plural fish/seafood forms → singular canonical
  "prawns":             "Prawn",
  "shrimps":            "Shrimp",
  // Verbose fish names → canonical
  "titus fish":         "Titus",
  "croaker fish":       "Croaker",
  "hake fish":          "Hake",
  // Egg variants
  "boiled egg":         "Egg",
  "fried egg":          "Egg",
  "hard boiled egg":    "Egg",
  "scrambled egg":      "Egg",
  "egg (boiled)":       "Egg",
  "egg (fried)":        "Egg",
  "egg (scrambled)":    "Egg",
};

/**
 * Apply the protein alias map to a lower-cased token.  Returns the lower-cased
 * canonical name if an alias matches, otherwise returns the original token.
 *
 * Tries exact match first, then a starts-with match so that annotated tokens
 * such as "assorted (large)" also resolve to the aliased form.
 */
export function resolveProteinAlias(lower: string): string {
  if (PROTEIN_ALIAS_MAP[lower]) return PROTEIN_ALIAS_MAP[lower].toLowerCase();
  for (const [key, canonical] of Object.entries(PROTEIN_ALIAS_MAP)) {
    if (lower.startsWith(key + " ")) return canonical.toLowerCase();
  }
  return lower;
}

// ── No-protein annotation detection / stripping ───────────────────────────────

/**
 * Detects no-protein annotation phrases (case-insensitive, with or without
 * surrounding parentheses).  Used for `.test()` only — no `g` flag so
 * `lastIndex` is never mutated (Business Rule §10).
 *
 * Recognised phrases:
 *   (No Extra Protein)         No Extra Protein
 *   (No Additional Protein)    No Additional Protein
 *   (No Protein)               No Protein
 *   (Without Protein)          Without Protein
 */
const NO_PROTEIN_TEST_RE =
  /\(?\s*(?:no\s+extra\s+protein|no\s+additional\s+protein|no\s+protein|without\s+protein)\s*\)?/i;

/**
 * Same pattern with the `g` flag — used for `String.replace()` to strip ALL
 * occurrences from a string (e.g. both a menu-item suffix AND an add-on token
 * could contain the phrase in the same string).
 */
const NO_PROTEIN_STRIP_RE =
  /\(?\s*(?:no\s+extra\s+protein|no\s+additional\s+protein|no\s+protein|without\s+protein)\s*\)?/gi;

/**
 * Return true when the text contains any no-protein annotation phrase.
 *
 * Handles: "(No Extra Protein)", "No Protein", "(No Additional Protein)",
 *          "(Without Protein)" — with or without enclosing parentheses and
 *          regardless of capitalisation.
 */
export function hasNoProteinAnnotation(text: string): boolean {
  return NO_PROTEIN_TEST_RE.test(text);
}

/**
 * Strip all no-protein annotation phrases from `text`, then collapse
 * consecutive whitespace and trim.
 *
 * Used to clean order text and menu item canonical names before menu matching
 * so that the annotation does not appear as a spurious word in the match key.
 *
 * Example:
 *   "Pottage Beans with Dodo (No Extra Protein)" → "Pottage Beans with Dodo"
 *   "Jollof Rice (No Protein)"                  → "Jollof Rice"
 */
export function stripNoProteinAnnotation(text: string): string {
  return text.replace(NO_PROTEIN_STRIP_RE, " ").replace(/\s+/g, " ").trim();
}

// ── Add-on classification ─────────────────────────────────────────────────────

export type ClassifiedAddOns = {
  /** Canonical protein name if a recognised protein was found, else null. */
  proteinName: string | null;
  /** Canonical swallow name if a recognised swallow was found, else null. */
  swallowName: string | null;
  /** Add-ons that were neither a protein nor a swallow (e.g. side dishes). */
  sideNames: string[];
};

/**
 * Classify a list of raw add-on tokens against the day's protein and swallow
 * vocabulary.
 *
 * - Garri / Gari are mapped to "Eba" before vocabulary lookup (Rule §6).
 * - The swallow check runs first so that combined orders like "Eba and Chicken"
 *   correctly assign the swallow before the protein.
 * - Only the first matching protein and first matching swallow are captured.
 * - Partial / starts-with matching handles annotated quantities like
 *   "Chicken (2 pieces)".
 */
export function classifyAddOns(
  addOns: string[],
  proteinNames: string[],
  swallowNames: string[],
): ClassifiedAddOns {
  // ── Build lookup maps (lower-case key → canonical name) ──────────────────
  const proteinMap = new Map<string, string>(
    proteinNames.map((n) => [n.toLowerCase().trim(), n]),
  );

  const swallowMap = new Map<string, string>(
    swallowNames.map((n) => [n.toLowerCase().trim(), n]),
  );
  // Garri / Gari alias: resolve to the canonical "Eba" entry if present in
  // the vocabulary, otherwise fall back to the string "Eba".
  const ebaCanonical =
    swallowNames.find((n) => n.toLowerCase() === "eba") ?? "Eba";
  swallowMap.set("garri", ebaCanonical);
  swallowMap.set("gari",  ebaCanonical);

  // ── Classify each add-on token ────────────────────────────────────────────
  let proteinName: string | null = null;
  let swallowName: string | null = null;
  const sideNames: string[] = [];

  for (const addOn of addOns) {
    const lower = addOn.toLowerCase().trim();
    if (!lower) continue;

    // ── Swallow check (runs first) ──────────────────────────────────────────
    if (!swallowName) {
      // ── Generic swallow detection (before vocab lookup) ─────────────────
      // "swallow", "any swallow", "choice of swallow" etc. mean swallow is
      // required but the specific type was not chosen.  Classify as
      // GENERIC_SWALLOW_VALUE ("Not Selected") so the kitchen knows swallow
      // is needed and the totals remain accurate (Business Rule §4 / §11).
      if (isGenericSwallow(lower)) {
        swallowName = GENERIC_SWALLOW_VALUE;
        continue;
      }

      // Exact match against the day's swallow vocabulary (incl. Garri / Gari).
      const exactSwallow = swallowMap.get(lower);
      if (exactSwallow) {
        swallowName = exactSwallow;
        continue;
      }
      // Partial / starts-with (handles trailing annotations like "Eba (extra)").
      let swallowFound = false;
      for (const [key, val] of swallowMap) {
        if (lower.startsWith(key + " ") || lower === key) {
          swallowName = val;
          swallowFound = true;
          break;
        }
      }
      if (swallowFound) continue;
    }

    // ── Protein check ───────────────────────────────────────────────────────
    if (!proteinName) {
      // Step 1 — alias normalization: resolve abbreviated / renamed forms
      //   "assorted" → "assorted meat",  "goat" → "goat meat",
      //   "cow meat" → "beef",            "boiled egg" → "egg"
      const aliasedLower = resolveProteinAlias(lower);

      // Step 2 — exact match (alias-resolved key first, then original)
      const exactProtein =
        proteinMap.get(aliasedLower) ?? proteinMap.get(lower);
      if (exactProtein) {
        proteinName = exactProtein;
        continue;
      }

      // Step 3 — starts-with match: token begins with a vocab item (handles
      //   "Chicken (2 pieces)", "Goat meat stew").  Tries aliased form first.
      let proteinFound = false;
      for (const [key, val] of proteinMap) {
        if (
          aliasedLower.startsWith(key + " ") ||
          aliasedLower === key ||
          lower.startsWith(key + " ") ||
          lower === key
        ) {
          proteinName = val;
          proteinFound = true;
          break;
        }
      }
      if (proteinFound) continue;
    }

    // Neither — treat as an unrecognised side dish.
    sideNames.push(addOn);
  }

  return { proteinName, swallowName, sideNames };
}

// ── Known static vocabularies (for UI display classification) ─────────────────
//
// These lists are used by `classifyForDisplay` on the Exceptions page so that
// add-on tokens can be labelled "Protein / Swallow / Side / Add-on" without
// fetching per-day vocabulary from the database.
//
// They are NOT authoritative for production processing — resolveOrders always
// uses the per-day database vocabulary from protein_option / swallow_option.
// These lists are intentionally conservative: they include only names that are
// almost universally correct across all customers.

export const KNOWN_PROTEIN_NAMES: readonly string[] = [
  "Chicken", "Beef", "Fish", "Turkey", "Goat Meat", "Assorted Meat",
  "Ponmo", "Egg", "Cowleg", "Titus", "Croaker", "Hake", "Gizzard",
  "Snail", "Prawn", "Shrimp", "Sausage", "Liver", "Kidney",
];

export const KNOWN_SWALLOW_NAMES: readonly string[] = [
  "Eba", "Semo", "Semovita", "Poundo", "Pounded Yam", "Wheat", "Amala", "Fufu",
];

export const KNOWN_SIDE_NAMES: readonly string[] = [
  "Dodo", "Plantain", "Moi Moi", "Moin Moin", "Coleslaw", "Salad", "Vegetables",
];

// ── classifyForDisplay ────────────────────────────────────────────────────────

export type ClassifiedDisplay = {
  /** Extracted main meal (before the first separator). */
  mainMeal: string;
  /** Recognised swallow name, or null if none found. */
  swallow: string | null;
  /** Recognised protein name, or null if none found. */
  protein: string | null;
  /** Recognised side-dish names (Dodo, Plantain, Moi Moi, Coleslaw, …). */
  sides: string[];
  /** Add-ons that were not recognised as protein, swallow, or side. */
  unknownAddOns: string[];
  /** False when no separator was present (no add-ons were found). */
  hasSeparator: boolean;
};

/**
 * Parse and classify a raw order string for display purposes.
 *
 * Uses the static KNOWN_* vocabulary lists (not the per-day database vocabulary)
 * so it can be called from client components without a database fetch.
 *
 * The result is used exclusively for labelling add-ons in the Exceptions page
 * parsed-breakdown panel.  All production logic continues to use the
 * authoritative per-day vocabulary from resolveOrders / decomposeMeal.
 */
export function classifyForDisplay(rawText: string): ClassifiedDisplay {
  const { mainMeal, addOns, hasSeparator } = parseOrderText(rawText);

  if (!hasSeparator || addOns.length === 0) {
    return {
      mainMeal,
      swallow: null,
      protein: null,
      sides: [],
      unknownAddOns: [],
      hasSeparator,
    };
  }

  // Classify against known static vocabularies (Garri/Gari aliases included).
  const { proteinName, swallowName, sideNames } = classifyAddOns(
    addOns,
    [...KNOWN_PROTEIN_NAMES],
    [...KNOWN_SWALLOW_NAMES, "Garri", "Gari"],
  );

  // Separate recognised side names from truly unrecognised add-ons.
  const knownSideLower = new Set(KNOWN_SIDE_NAMES.map((s) => s.toLowerCase()));
  const sides: string[] = [];
  const unknownAddOns: string[] = [];

  for (const s of sideNames) {
    if (knownSideLower.has(s.toLowerCase())) {
      sides.push(s);
    } else {
      unknownAddOns.push(s);
    }
  }

  return {
    mainMeal,
    swallow: swallowName,
    protein: proteinName,
    sides,
    unknownAddOns,
    hasSeparator,
  };
}
