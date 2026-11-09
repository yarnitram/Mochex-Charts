/**
 * Institutional TradingView Timeframe Models & MEXC Native Intervals
 */

export type TimeframeCategory = "minutes" | "hours" | "days" | "weeks" | "months";
export type TimeframeUnit = "minutes" | "hours" | "days" | "weeks" | "months";

export interface TimeframeItem {
  label: string;
  description: string;
  value: string;
  category: TimeframeCategory;
  numericAmount: number;
  unit: TimeframeUnit;
}

export const TIMEFRAME_CATEGORIES: { id: TimeframeCategory; label: string }[] = [
  { id: "minutes", label: "Minutes" },
  { id: "hours", label: "Hours" },
  { id: "days", label: "Days" },
  { id: "weeks", label: "Weeks" },
  { id: "months", label: "Months" },
];

export const ALL_TIMEFRAMES: TimeframeItem[] = [
  // Minutes
  { label: "1m", description: "1 minute", value: "1", category: "minutes", numericAmount: 1, unit: "minutes" },
  { label: "5m", description: "5 minutes", value: "5", category: "minutes", numericAmount: 5, unit: "minutes" },
  { label: "15m", description: "15 minutes", value: "15", category: "minutes", numericAmount: 15, unit: "minutes" },
  { label: "30m", description: "30 minutes", value: "30", category: "minutes", numericAmount: 30, unit: "minutes" },
  // Hours
  { label: "1h", description: "1 hour", value: "60", category: "hours", numericAmount: 1, unit: "hours" },
  { label: "2h", description: "2 hours", value: "120", category: "hours", numericAmount: 2, unit: "hours" },
  { label: "4h", description: "4 hours", value: "240", category: "hours", numericAmount: 4, unit: "hours" },
  // Days
  { label: "1D", description: "1 day", value: "1D", category: "days", numericAmount: 1, unit: "days" },
  // Weeks
  { label: "1W", description: "1 week", value: "1W", category: "weeks", numericAmount: 1, unit: "weeks" },
  // Months
  { label: "1M", description: "1 month", value: "1M", category: "months", numericAmount: 1, unit: "months" },
];

export const DEFAULT_FAVORITE_TIMEFRAMES: string[] = ["1", "5", "15", "30", "60", "120", "240", "1D", "1W"];

export const TIMEFRAME_STORAGE_KEY = "mochex_favorite_timeframes";

/**
 * Loads user favorite timeframe values from localStorage, fallback to DEFAULT_FAVORITE_TIMEFRAMES.
 */
export function getStoredFavoriteTimeframes(): string[] {
  if (typeof window === "undefined") {
    return DEFAULT_FAVORITE_TIMEFRAMES;
  }
  try {
    const raw = localStorage.getItem(TIMEFRAME_STORAGE_KEY);
    if (!raw) return DEFAULT_FAVORITE_TIMEFRAMES;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Validate that items exist in ALL_TIMEFRAMES
      const validValues = new Set(ALL_TIMEFRAMES.map((tf) => tf.value));
      const filtered = parsed.filter((v): v is string => typeof v === "string" && validValues.has(v));
      return filtered.length > 0 ? filtered : DEFAULT_FAVORITE_TIMEFRAMES;
    }
    return DEFAULT_FAVORITE_TIMEFRAMES;
  } catch {
    return DEFAULT_FAVORITE_TIMEFRAMES;
  }
}

/**
 * Persists favorite timeframe values to localStorage.
 */
export function saveStoredFavoriteTimeframes(favorites: string[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TIMEFRAME_STORAGE_KEY, JSON.stringify(favorites));
  } catch (err) {
    console.error("Failed to persist favorite timeframes", err);
  }
}

/**
 * Finds metadata for a timeframe by its resolution value.
 */
export function findTimeframe(value: string): TimeframeItem | undefined {
  return ALL_TIMEFRAMES.find((tf) => tf.value === value);
}

/**
 * Validates a custom timeframe input against MEXC's native intervals.
 */
export function validateCustomTimeframe(
  amount: number,
  unit: TimeframeUnit
): { valid: boolean; timeframe?: TimeframeItem; message?: string } {
  if (!amount || isNaN(amount) || amount <= 0 || !Number.isInteger(amount)) {
    return {
      valid: false,
      message: "Please enter a valid positive whole number.",
    };
  }

  // Find exact matching native interval
  const match = ALL_TIMEFRAMES.find((tf) => tf.numericAmount === amount && tf.unit === unit);

  if (match) {
    return { valid: true, timeframe: match };
  }

  return {
    valid: false,
    message: `MEXC Spot only natively supports: 1m, 5m, 15m, 30m, 1h, 4h, 1D, 1W, 1M.`,
  };
}
