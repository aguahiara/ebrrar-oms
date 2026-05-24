const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDate(value: string): boolean {
  return DATE_PATTERN.test(value);
}

export function formatCalendarDate(
  year: number,
  month: number,
  day: number,
): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function parseCalendarDate(dateStr: string): {
  year: number;
  month: number;
  day: number;
} {
  if (!isCalendarDate(dateStr)) {
    throw new Error(`Invalid calendar date: ${dateStr}`);
  }

  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month, day };
}

/** Add days to a YYYY-MM-DD literal using local calendar components only. */
export function addCalendarDays(dateStr: string, daysToAdd: number): string {
  const { year, month, day } = parseCalendarDate(dateStr);
  const result = new Date(year, month - 1, day + daysToAdd);
  return formatCalendarDate(
    result.getFullYear(),
    result.getMonth() + 1,
    result.getDate(),
  );
}

export function formatCalendarDateLabel(
  dateStr: string,
  locale = "en-GB",
): string {
  const { year, month, day } = parseCalendarDate(dateStr);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString(locale, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function mondayOfCurrentWeek(): string {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() + mondayOffset,
  );
  return formatCalendarDate(
    monday.getFullYear(),
    monday.getMonth() + 1,
    monday.getDate(),
  );
}
