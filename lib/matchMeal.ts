import { distance } from "fastest-levenshtein";
import { extractMainMeal } from "@/lib/parse-order";

/** Menu item row scoped to the customer + service day being matched. */
export type MenuItemForMatch = {
  id: string;
  canonical_name: string;
};

/** Alias row; caller loads these for the day's menu_item ids. */
export type MenuItemAliasForMatch = {
  menu_item_id: string;
  normalized_text: string;
};

export type MealMatchResult =
  | { itemId: string; matchType: "Direct" }
  | { itemId: string; matchType: "Alias" }
  | { itemId: string; matchType: "Fuzzy"; score: number }
  | {
      itemId: null;
      matchType: null;
      bestGuessId: string | null;
      bestScore: number;
    };

/**
 * Fuzzy-match threshold.  A score of 0.85 accepts close spelling variants
 * (e.g. "Okro" vs "Okra") while rejecting unrelated meals (Business Rule §9).
 */
const FUZZY_THRESHOLD = 0.85;

// Treat hyphens/slashes as word separators so "Jollof-Rice" normalises the
// same as "Jollof Rice".  Colon and single-quote are also stripped since they
// appear in some customer spreadsheets but never in canonical menu names.
const PUNCTUATION_TO_STRIP = /[,&+()\-/:'"]/g;

// Filler/connective words that vary between how Ebrrar names a dish and how a
// customer writes it ("Jollof Rice & Dodo" vs "Jollof rice served with Dodo").
// Stripping them to a "meal core" lets the same dish match across phrasings
// in the legacy trailing-extraction path.
const STOPWORDS = new Set([
  "served",
  "serve",
  "with",
  "and",
  "the",
  "a",
  "only",
  "dish",
  "in",
  "of",
]);

/**
 * Reduce a meal string to its comparable core: lowercase, strip punctuation,
 * collapse whitespace, and drop filler/connective words.
 *
 * Used by decomposeMeal (legacy path) and by matchMeal internals.  The
 * separator-based parsing in parse-order.ts uses normalizeMainMeal() instead,
 * which does not strip stopwords, but normalize() is kept for alias backward
 * compatibility and the legacy trailing-extraction fallback.
 */
export function normalize(s: string): string {
  const base = s
    .toLowerCase()
    .trim()
    .replace(PUNCTUATION_TO_STRIP, " ")
    .replace(/\s+/g, " ")
    .trim();

  const core = base
    .split(" ")
    .filter((word) => word && !STOPWORDS.has(word))
    .join(" ");

  // Guard against a string that is entirely filler words.
  return core || base;
}

function similarityRatio(a: string, b: string): number {
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) return 1;
  return 1 - distance(a, b) / maxLength;
}

/**
 * Derive the normalized main-meal key for a menu item canonical name.
 *
 * Extracts the text before the first `+` / `with` / `and` separator, then
 * applies normalize() for consistent comparison with the mealRemainder that
 * decomposeMeal produces.
 *
 * Examples:
 *   "Jollof Rice + Moi Moi"   → "jollof rice"
 *   "Okro Soup with Swallow"  → "okro soup"
 *   "Egusi Soup"              → "egusi soup"
 */
function menuItemMainMealKey(canonicalName: string): string {
  return normalize(extractMainMeal(canonicalName));
}

/**
 * Match a meal-remainder string (the main meal from decomposeMeal) to a menu
 * item using a three-step cascade: Direct → Alias → Fuzzy.
 *
 * The `rawText` argument is the mealRemainder produced by decomposeMeal — it
 * is already the normalised main meal when a separator was found in the order.
 *
 * Step 1  — Exact match on the full normalized canonical name (backward
 *           compatibility for menu items without separators).
 * Step 1b — Exact match on the normalized MAIN-MEAL portion of the canonical
 *           name (Business Rules §2-§5): "Jollof Rice" from
 *           "Jollof Rice + Moi Moi" or "Okro Soup" from "Okro Soup with Swallow".
 * Step 2  — Exact match on a pre-normalized alias text.
 * Step 3  — Best Levenshtein-ratio match against menu-item main meals,
 *           accepted when score ≥ FUZZY_THRESHOLD (handles "Okro" ↔ "Okra").
 *
 * Aliases and menu items must be pre-filtered to the relevant customer + day.
 */
export async function matchMeal(
  rawText: string,
  menuItems: MenuItemForMatch[],
  aliases: MenuItemAliasForMatch[],
): Promise<MealMatchResult> {
  const normalizedRaw = normalize(rawText);
  const itemIds = new Set(menuItems.map((item) => item.id));

  // ── Step 1: exact match on full normalized canonical name ─────────────────
  for (const item of menuItems) {
    if (normalize(item.canonical_name) === normalizedRaw) {
      return { itemId: item.id, matchType: "Direct" };
    }
  }

  // ── Step 1b: exact match on normalized MAIN-MEAL portion (Business Rule §4) ─
  // Handles cases where the menu item name includes an add-on or swallow
  // placeholder that differs from what the customer ordered:
  //   Order "Jollof Rice + Dodo" → mealRemainder "jollof rice"
  //   Menu  "Jollof Rice + Moi Moi" → main-meal key "jollof rice"  ✓
  //   Menu  "Okro Soup with Swallow" → main-meal key "okro soup"    ✓
  for (const item of menuItems) {
    if (menuItemMainMealKey(item.canonical_name) === normalizedRaw) {
      return { itemId: item.id, matchType: "Direct" };
    }
  }

  // ── Step 2: exact match on pre-normalized alias text ─────────────────────
  for (const alias of aliases) {
    if (
      itemIds.has(alias.menu_item_id) &&
      alias.normalized_text === normalizedRaw
    ) {
      return { itemId: alias.menu_item_id, matchType: "Alias" };
    }
  }

  // ── Step 3: Levenshtein-ratio fuzzy match against menu-item MAIN MEALS ────
  // By comparing the order's normalized main meal against each menu item's
  // normalized main meal (not its full canonical name), we:
  //   (a) avoid false positives from shared add-on words, and
  //   (b) correctly match close spelling variants like "Okro" ↔ "Okra" even
  //       when the menu item has a swallow suffix ("Okra Soup with Swallow").
  let bestGuessId: string | null = null;
  let bestScore = 0;

  for (const item of menuItems) {
    const score = similarityRatio(normalizedRaw, menuItemMainMealKey(item.canonical_name));
    if (score > bestScore) {
      bestScore = score;
      bestGuessId = item.id;
    }
  }

  if (bestGuessId !== null && bestScore >= FUZZY_THRESHOLD) {
    return { itemId: bestGuessId, matchType: "Fuzzy", score: bestScore };
  }

  // ── Dev-only diagnostic ───────────────────────────────────────────────────
  if (process.env.NODE_ENV === "development") {
    console.log("[matchMeal] No match found", {
      mealRemainder: rawText,
      normalized: normalizedRaw,
      candidateCount: menuItems.length,
      candidates: menuItems.map((i) => ({
        id: i.id,
        canonical: i.canonical_name,
        normFull: normalize(i.canonical_name),
        normMain: menuItemMainMealKey(i.canonical_name),
      })),
      bestGuessId: bestGuessId ?? "none",
      bestScore: Number(bestScore.toFixed(3)),
    });
  }

  return { itemId: null, matchType: null, bestGuessId, bestScore };
}
