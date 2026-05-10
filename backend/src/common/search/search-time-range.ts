export const SEARCH_TIME_RANGE_VALUES = [
  "30d",
  "90d",
  "180d",
  "365d",
  "730d",
  "all",
] as const;

export type SearchTimeRange = (typeof SEARCH_TIME_RANGE_VALUES)[number];

export const DEFAULT_SEARCH_TIME_RANGE: SearchTimeRange = "365d";

const SEARCH_TIME_RANGE_DAYS: Record<Exclude<SearchTimeRange, "all">, number> = {
  "30d": 30,
  "90d": 90,
  "180d": 180,
  "365d": 365,
  "730d": 730,
};

export function isSearchTimeRange(value: unknown): value is SearchTimeRange {
  return (
    typeof value === "string" &&
    (SEARCH_TIME_RANGE_VALUES as readonly string[]).includes(value)
  );
}

export function getSearchTimeRangeDays(
  range: SearchTimeRange,
): number | undefined {
  if (range === "all") return undefined;
  return SEARCH_TIME_RANGE_DAYS[range];
}

export function resolveSearchTimeRangeSince(
  range: SearchTimeRange,
  now = new Date(),
): Date | undefined {
  const days = getSearchTimeRangeDays(range);
  if (days == null) return undefined;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

export function formatDateYmd(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatDateYmdSlash(date: Date): string {
  return formatDateYmd(date).replace(/-/g, "/");
}

export function getUnixTimestampSeconds(date: Date): number {
  return Math.floor(date.getTime() / 1000);
}

export function resolveSearchTimeRangeYearWindow(
  range: SearchTimeRange,
  now = new Date(),
): string | undefined {
  const since = resolveSearchTimeRangeSince(range, now);
  if (!since) return undefined;
  const fromYear = since.getUTCFullYear();
  const toYear = now.getUTCFullYear();
  return fromYear === toYear ? String(toYear) : `${fromYear}-${toYear}`;
}

export function getSearchTimeRangeLabel(range: SearchTimeRange): string {
  switch (range) {
    case "30d":
      return "past 1 month";
    case "90d":
      return "past 3 months";
    case "180d":
      return "past 6 months";
    case "365d":
      return "past 12 months";
    case "730d":
      return "past 24 months";
    case "all":
      return "all time";
  }
}
