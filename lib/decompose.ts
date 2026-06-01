import { normalize } from "@/lib/matchMeal";
import { parseOrderText, classifyAddOns } from "@/lib/parse-order";

export type DecomposeResult = {
  proteinName: string | null;
  swallowName: string | null;
  /**
   * The normalised main-meal text that will be passed to matchMeal for menu
   * matching.  When a separator (`+` / `with` / `and`) was found, this is
   * the portion before the separator.  When no separator was found, it is
   * the full text after any trailing protein/swallow has been stripped
   * (legacy behaviour for parsers that embed protein at the end without a
   * separator).
   */
  mealRemainder: string;
  /**
   * Unrecognised add-ons that were neither a protein nor a swallow (e.g.
   * side dishes such as "Dodo", "Moi Moi").  Empty when no separator was
   * found or when all add-ons were classified.
   */
  sideItems: string[];
};

// ── Legacy trailing-extraction helpers (used when no separator is present) ───

type Vocab = { core: string; name: string };

function buildVocab(names: string[]): Vocab[] {
  return names
    .map((name) => ({ core: normalize(name), name }))
    .filter((v) => v.core.length > 0)
    // Longest first so "Goat meat" wins over a hypothetical "meat".
    .sort((a, b) => b.core.length - a.core.length);
}

function extractTrailing(
  core: string,
  vocab: Vocab[],
): { name: string | null; remainder: string } {
  for (const v of vocab) {
    if (core === v.core || core.endsWith(` ${v.core}`)) {
      return {
        name: v.name,
        remainder: core.slice(0, core.length - v.core.length).trim(),
      };
    }
  }
  return { name: null, remainder: core };
}

// ── canonicalizeVocab (used by parsers with explicit protein/swallow columns) ─

/**
 * Map a raw protein/swallow value from a dedicated column (e.g. "Cowleg
 * (3 pieces)") to the canonical menu vocabulary name ("Cowleg").  Returns
 * null if no vocab term matches.  Matches the longest vocab term that the
 * raw value starts with or contains.
 */
export function canonicalizeVocab(
  raw: string | null | undefined,
  vocabNames: string[],
): string | null {
  if (!raw) return null;
  const rawCore = normalize(raw);
  if (!rawCore) return null;

  for (const v of buildVocab(vocabNames)) {
    if (
      rawCore === v.core ||
      rawCore.startsWith(`${v.core} `) ||
      rawCore.includes(` ${v.core} `) ||
      rawCore.endsWith(` ${v.core}`)
    ) {
      return v.name;
    }
  }
  return null;
}

// ── Main decomposition ────────────────────────────────────────────────────────

/**
 * Split a raw meal string into (protein, swallow, main-meal core).
 *
 * Strategy (Business Rules §1-§8):
 *
 *   1. Use `parseOrderText` to detect `+` / `with` / `and` separators and
 *      split the text into a main-meal part and add-on tokens.
 *
 *   2. When a separator is found, classify the add-on tokens against the
 *      day's protein and swallow vocabularies (Garri/Gari → Eba included).
 *      The main meal is normalised and returned as `mealRemainder`.
 *
 *   3. When no separator is found (text is a single block), fall back to the
 *      legacy trailing-extraction approach — strip a trailing protein, then a
 *      trailing swallow from the normalised full text.  This preserves
 *      backward compatibility for parsers / customers that append protein to
 *      the meal name without a separator.
 *
 * Returns the canonical protein/swallow names and the normalised meal
 * remainder that matchMeal will compare against menu-item main meals.
 */
export function decomposeMeal(
  rawText: string,
  proteinNames: string[],
  swallowNames: string[],
): DecomposeResult {
  const { mainMeal, addOns, hasSeparator } = parseOrderText(rawText);

  // ── Path A: separator found — classify add-ons ────────────────────────────
  if (hasSeparator) {
    const { proteinName, swallowName, sideNames } = classifyAddOns(
      addOns,
      proteinNames,
      swallowNames,
    );

    return {
      proteinName,
      swallowName,
      // Use the existing normalize() so the meal core is consistent with the
      // alias lookup in matchMeal (which also normalizes with normalize()).
      mealRemainder: normalize(mainMeal),
      sideItems: sideNames,
    };
  }

  // ── Path B: no separator — legacy trailing extraction ─────────────────────
  // Strip a trailing protein, then a trailing swallow, from the normalised
  // full text.  This handles parsers / order formats that write the meal as
  // "Jollof Rice Chicken" without any separator.
  let core = normalize(rawText);

  const protein = extractTrailing(core, buildVocab(proteinNames));
  core = protein.remainder;

  const swallow = extractTrailing(core, buildVocab(swallowNames));
  core = swallow.remainder;

  return {
    proteinName: protein.name,
    swallowName: swallow.name,
    mealRemainder: core,
    sideItems: [],
  };
}
