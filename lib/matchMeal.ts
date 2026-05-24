import { distance } from "fastest-levenshtein";

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

const FUZZY_THRESHOLD = 0.85;

const PUNCTUATION_TO_STRIP = /[,&+()]/g;

/** Lowercase, trim, collapse whitespace, strip selected punctuation. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(PUNCTUATION_TO_STRIP, "")
    .replace(/\s+/g, " ");
}

function similarityRatio(a: string, b: string): number {
  const maxLength = Math.max(a.length, b.length);
  if (maxLength === 0) {
    return 1;
  }
  return 1 - distance(a, b) / maxLength;
}

/**
 * Match raw spreadsheet meal text to a menu item: Direct → Alias → Fuzzy.
 * Aliases and menu items must be pre-filtered to the relevant customer + day.
 */
export async function matchMeal(
  rawText: string,
  menuItems: MenuItemForMatch[],
  aliases: MenuItemAliasForMatch[],
): Promise<MealMatchResult> {
  const normalizedRaw = normalize(rawText);
  const itemIds = new Set(menuItems.map((item) => item.id));

  // Step 1: exact match on normalized canonical name
  for (const item of menuItems) {
    if (normalize(item.canonical_name) === normalizedRaw) {
      return { itemId: item.id, matchType: "Direct" };
    }
  }

  // Step 2: exact match on pre-normalized alias text for this day's items
  for (const alias of aliases) {
    if (
      itemIds.has(alias.menu_item_id) &&
      alias.normalized_text === normalizedRaw
    ) {
      return { itemId: alias.menu_item_id, matchType: "Alias" };
    }
  }

  // Step 3: best Levenshtein ratio against canonical names
  let bestGuessId: string | null = null;
  let bestScore = 0;

  for (const item of menuItems) {
    const score = similarityRatio(normalizedRaw, normalize(item.canonical_name));
    if (score > bestScore) {
      bestScore = score;
      bestGuessId = item.id;
    }
  }

  if (bestGuessId !== null && bestScore >= FUZZY_THRESHOLD) {
    return { itemId: bestGuessId, matchType: "Fuzzy", score: bestScore };
  }

  return {
    itemId: null,
    matchType: null,
    bestGuessId,
    bestScore,
  };
}
