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
 */

// ── Separator patterns ────────────────────────────────────────────────────────

/**
 * Primary separators: `+` and `with` (case-insensitive, surrounded by
 * optional whitespace).  These always split main meal from add-ons.
 */
const PRIMARY_SEP_RE = /\s*\+\s*|\s+with\s+/i;

/**
 * Secondary separator: `and` (case-insensitive, surrounded by required
 * whitespace so it is not matched inside a word).
 * Used as the primary separator only when no `+` or `with` is present.
 */
const AND_SEP_RE = /\s+and\s+/gi;

/**
 * Used to split the add-on portion into individual tokens.
 * Both `+` and `and` act as add-on separators.  `with` is intentionally
 * excluded here because it is consumed as the primary separator already.
 *
 * Handles: "Eba + Fish" → ["Eba","Fish"]
 *          "Semo and Beef" → ["Semo","Beef"]
 *          "Eba + Fish and Beef" → ["Eba","Fish","Beef"]
 */
const ADDON_SEP_RE = /\s*\+\s*|\s+and\s+/gi;

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
 *   "Jollof Rice + Dodo"              → { main: "Jollof Rice", addOns: ["Dodo"] }
 *   "Jollof Rice with Chicken"        → { main: "Jollof Rice", addOns: ["Chicken"] }
 *   "Okro Soup and Eba"               → { main: "Okro Soup",   addOns: ["Eba"] }
 *   "Egusi Soup with Beef and Semo"   → { main: "Egusi Soup",  addOns: ["Beef","Semo"] }
 *   "Jollof Rice"                     → { main: "Jollof Rice", addOns: [], hasSeparator: false }
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

  // ── Split add-on portion on `+` and `and` ────────────────────────────────
  // Using ADDON_SEP_RE (not AND_SEP_RE) so that "Eba + Fish" and "Semo and
  // Beef" each yield two tokens.  `with` is intentionally excluded here
  // because it is already consumed as the primary separator above.
  ADDON_SEP_RE.lastIndex = 0;
  const addOns = restRaw
    ? restRaw.split(ADDON_SEP_RE).map((s) => s.trim()).filter(Boolean)
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
