/**
 * Mock earnings data for the dashboard's Earnings card.
 *
 * Deterministic — same inputs always produce the same numbers, so the
 * chart doesn't flicker between renders. In a real app this would be
 * an API call (or a server component fetch).
 */

export type TimeRange = "7d" | "30d" | "90d";
export type VehicleFilter = "all" | string;

export type EarningsPoint = {
  /** Pre-formatted short label, e.g. "Mar 14" */
  label: string;
  /** Full date object — handy for tooltips / day-of-week derivation */
  date: Date;
  /** Total earnings on this day for the active filter, in whole dollars */
  value: number;
};

const DAYS_BY_RANGE: Record<TimeRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

/** Tiny seedable PRNG so generated values stay stable across renders. */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/** Hash a string into a stable integer (for seeding per-vehicle data). */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

/**
 * Generate earnings data for the given range and vehicle filter.
 *
 * @param range          Time range — determines how many days back to generate.
 * @param vehicleIds     The user's connected vehicle ids (used as seeds for the per-vehicle baseline).
 * @param filter         "all" sums across all vehicles; a vehicle id returns just that vehicle's daily values.
 * @param dayOffset      Shift the window back by this many days. Used for
 *                       computing the "previous period" total for the trend pill.
 */
export function generateEarnings(
  range: TimeRange,
  vehicleIds: string[],
  filter: VehicleFilter,
  dayOffset = 0,
): EarningsPoint[] {
  const days = DAYS_BY_RANGE[range];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const targetIds = filter === "all" ? vehicleIds : [filter];

  const points: EarningsPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - (i + dayOffset));
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    // "Days since epoch" — stable seed per day
    const dayKey = Math.floor(date.getTime() / 86_400_000);

    let value = 0;
    for (const id of targetIds) {
      const seed = dayKey * 7 + hash(id);
      const noise = pseudoRandom(seed); // 0..1
      const noise2 = pseudoRandom(seed + 1);

      // Weekday baseline: $20–$70 per vehicle per day.
      const base = 20 + noise * 50;
      // Weekend bump: extra $15–$40.
      const weekendBump = isWeekend ? 15 + noise2 * 25 : 0;
      // Mild upward trend, normalized by range length so 90d doesn't balloon
      // (trend caps at ~$8/day extra at the latest point, regardless of range).
      const trend = ((days - i) / days) * 8;

      value += base + weekendBump + trend;
    }

    points.push({
      label: date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      date,
      value: Math.round(value),
    });
  }

  return points;
}

export type EarningsSummary = {
  total: number;
  prevTotal: number;
  trendPct: number;
  bestDay: EarningsPoint;
  avgPerDay: number;
};

/** Run the basic stats over a generated series (total, trend vs previous period, best, avg). */
export function summarize(
  current: EarningsPoint[],
  previous: EarningsPoint[],
): EarningsSummary {
  const total = current.reduce((sum, p) => sum + p.value, 0);
  const prevTotal = previous.reduce((sum, p) => sum + p.value, 0);
  const trendPct =
    prevTotal > 0 ? ((total - prevTotal) / prevTotal) * 100 : 0;
  const bestDay = current.reduce(
    (best, p) => (p.value > best.value ? p : best),
    current[0],
  );
  const avgPerDay = total / Math.max(current.length, 1);

  return { total, prevTotal, trendPct, bestDay, avgPerDay };
}
