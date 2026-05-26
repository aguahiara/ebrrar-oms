export type DayOfWeek = "Mon" | "Tue" | "Wed" | "Thu" | "Fri";

export type OrderRecord = {
  employeeName: string;
  dayOfWeek: DayOfWeek;
  rawMealText: string;
  // Set by parsers whose files carry protein/swallow in their own columns
  // (e.g. Elcrest, Energia). When present, these are used directly instead of
  // extracting protein/swallow from the meal text.
  proteinRaw?: string | null;
  swallowRaw?: string | null;
};
