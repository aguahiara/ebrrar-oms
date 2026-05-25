export type DayOfWeek = "Mon" | "Tue" | "Wed" | "Thu" | "Fri";

export type OrderRecord = {
  employeeName: string;
  dayOfWeek: DayOfWeek;
  rawMealText: string;
};
