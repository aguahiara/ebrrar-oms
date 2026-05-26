import { normalize } from "@/lib/matchMeal";

export type DecomposeResult = {
  proteinName: string | null;
  swallowName: string | null;
  // The meal text with any trailing protein/swallow removed, normalised to its core.
  mealRemainder: string;
};

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

/**
 * Map a raw protein/swallow value from a dedicated column (e.g. "Cowleg (3 pieces)")
 * to the canonical menu vocabulary name ("Cowleg"). Returns null if no vocab term
 * matches. Matches the longest vocab term that the raw value starts with or contains.
 */
export function canonicalizeVocab(
  raw: string | null | undefined,
  vocabNames: string[],
): string | null {
  if (!raw) {
    return null;
  }
  const rawCore = normalize(raw);
  if (!rawCore) {
    return null;
  }

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

/**
 * Split a raw meal string into (protein, swallow, meal core). Strips a trailing
 * protein, then a trailing swallow, named in the day's menu vocabularies —
 * because customers append these to the end ("...Served with Semo and Beef").
 * Returns the canonical protein/swallow names and the normalised meal remainder.
 */
export function decomposeMeal(
  rawText: string,
  proteinNames: string[],
  swallowNames: string[],
): DecomposeResult {
  let core = normalize(rawText);

  const protein = extractTrailing(core, buildVocab(proteinNames));
  core = protein.remainder;

  const swallow = extractTrailing(core, buildVocab(swallowNames));
  core = swallow.remainder;

  return {
    proteinName: protein.name,
    swallowName: swallow.name,
    mealRemainder: core,
  };
}
