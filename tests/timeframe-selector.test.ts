import { describe, it, expect, beforeEach, vi, beforeAll } from "vitest";
import {
  ALL_TIMEFRAMES,
  DEFAULT_FAVORITE_TIMEFRAMES,
  TIMEFRAME_STORAGE_KEY,
  getStoredFavoriteTimeframes,
  saveStoredFavoriteTimeframes,
  findTimeframe,
  validateCustomTimeframe,
} from "../src/lib/chart/timeframes";

class MockLocalStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
}

describe("TradingView Timeframe System & MEXC Intervals", () => {
  beforeAll(() => {
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = new MockLocalStorage();
  });

  beforeEach(() => {
    (globalThis as any).localStorage.clear();
    vi.restoreAllMocks();
  });

  it("defines complete TradingView categorized intervals", () => {
    expect(ALL_TIMEFRAMES.length).toBe(10);

    const values = ALL_TIMEFRAMES.map((tf) => tf.value);
    expect(values).toEqual(["1", "5", "15", "30", "60", "120", "240", "1D", "1W", "1M"]);

    const minutes = ALL_TIMEFRAMES.filter((tf) => tf.category === "minutes");
    expect(minutes.map((tf) => tf.label)).toEqual(["1m", "5m", "15m", "30m"]);

    const hours = ALL_TIMEFRAMES.filter((tf) => tf.category === "hours");
    expect(hours.map((tf) => tf.label)).toEqual(["1h", "2h", "4h"]);

    const days = ALL_TIMEFRAMES.filter((tf) => tf.category === "days");
    expect(days.map((tf) => tf.label)).toEqual(["1D"]);

    const weeks = ALL_TIMEFRAMES.filter((tf) => tf.category === "weeks");
    expect(weeks.map((tf) => tf.label)).toEqual(["1W"]);

    const months = ALL_TIMEFRAMES.filter((tf) => tf.category === "months");
    expect(months.map((tf) => tf.label)).toEqual(["1M"]);
  });

  it("loads default favorites when localStorage is empty or corrupt", () => {
    expect(getStoredFavoriteTimeframes()).toEqual(DEFAULT_FAVORITE_TIMEFRAMES);

    (globalThis as any).localStorage.setItem(TIMEFRAME_STORAGE_KEY, "invalid-json");
    expect(getStoredFavoriteTimeframes()).toEqual(DEFAULT_FAVORITE_TIMEFRAMES);

    (globalThis as any).localStorage.setItem(TIMEFRAME_STORAGE_KEY, JSON.stringify(["unsupported-interval"]));
    expect(getStoredFavoriteTimeframes()).toEqual(DEFAULT_FAVORITE_TIMEFRAMES);
  });

  it("persists and restores valid custom favorite selections", () => {
    const customFavorites = ["1", "15", "30", "60", "1D", "1M"];
    saveStoredFavoriteTimeframes(customFavorites);

    const restored = getStoredFavoriteTimeframes();
    expect(restored).toEqual(customFavorites);
  });

  it("finds timeframe metadata correctly", () => {
    const tf15 = findTimeframe("15");
    expect(tf15).toBeDefined();
    expect(tf15?.label).toBe("15m");
    expect(tf15?.description).toBe("15 minutes");
    expect(tf15?.category).toBe("minutes");

    const tf4h = findTimeframe("240");
    expect(tf4h?.label).toBe("4h");
    expect(tf4h?.description).toBe("4 hours");
    expect(tf4h?.category).toBe("hours");

    const nonExistent = findTimeframe("999");
    expect(nonExistent).toBeUndefined();
  });

  describe("Custom Timeframe Validation against MEXC Spot API", () => {
    it("validates valid native intervals", () => {
      // 30 minutes
      const res30m = validateCustomTimeframe(30, "minutes");
      expect(res30m.valid).toBe(true);
      expect(res30m.timeframe?.value).toBe("30");

      // 1 hour
      const res1h = validateCustomTimeframe(1, "hours");
      expect(res1h.valid).toBe(true);
      expect(res1h.timeframe?.value).toBe("60");

      // 2 hours
      const res2h = validateCustomTimeframe(2, "hours");
      expect(res2h.valid).toBe(true);
      expect(res2h.timeframe?.value).toBe("120");

      // 4 hours
      const res4h = validateCustomTimeframe(4, "hours");
      expect(res4h.valid).toBe(true);
      expect(res4h.timeframe?.value).toBe("240");

      // 1 day
      const res1d = validateCustomTimeframe(1, "days");
      expect(res1d.valid).toBe(true);
      expect(res1d.timeframe?.value).toBe("1D");

      // 1 month
      const res1m = validateCustomTimeframe(1, "months");
      expect(res1m.valid).toBe(true);
      expect(res1m.timeframe?.value).toBe("1M");
    });

    it("rejects non-positive, decimal, or NaN amounts", () => {
      expect(validateCustomTimeframe(0, "minutes").valid).toBe(false);
      expect(validateCustomTimeframe(-5, "minutes").valid).toBe(false);
      expect(validateCustomTimeframe(1.5, "hours").valid).toBe(false);
      expect(validateCustomTimeframe(NaN, "days").valid).toBe(false);
    });

    it("rejects unsupported intervals with explicit MEXC Spot guidance", () => {
      const res3m = validateCustomTimeframe(3, "minutes");
      expect(res3m.valid).toBe(false);
      expect(res3m.message).toContain("MEXC Spot only natively supports");

      const res3h = validateCustomTimeframe(3, "hours");
      expect(res3h.valid).toBe(false);
      expect(res3h.message).toContain("MEXC Spot only natively supports");

      const res3d = validateCustomTimeframe(3, "days");
      expect(res3d.valid).toBe(false);
      expect(res3d.message).toContain("MEXC Spot only natively supports");
    });
  });
});
