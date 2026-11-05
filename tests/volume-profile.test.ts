import { describe, it, expect } from "vitest";
import {
  calculateVisibleVolumeProfile,
  calculateFixedRangeVolumeProfile,
} from "../src/lib/indicators/volume-profile";
import { formatDrawingObjectLabel, ChartDrawing } from "../src/lib/chart/drawing-math";
import { CandlestickBar } from "../src/lib/mexc/types";

describe("Visible Range & Fixed Range Volume Profile (VPVR & FRVP) Engine (DEC-071, DEC-121)", () => {
  const sampleBars: CandlestickBar[] = [
    { time: 1000, open: 68000, high: 68200, low: 67900, close: 68150, volume: 120 },
    { time: 2000, open: 68150, high: 68500, low: 68100, close: 68450, volume: 300 },
    { time: 3000, open: 68450, high: 68600, low: 68350, close: 68420, volume: 950 }, // High volume node around 68350-68600
    { time: 4000, open: 68420, high: 68550, low: 68380, close: 68510, volume: 820 }, // High volume node around 68380-68550
    { time: 5000, open: 68510, high: 69000, low: 68480, close: 68920, volume: 180 },
    { time: 6000, open: 68920, high: 69100, low: 68800, close: 68850, volume: 110 },
  ];

  it("computes horizontal volume buckets, conserves total volume, and identifies POC, VAH, and VAL", () => {
    const profile = calculateVisibleVolumeProfile(sampleBars, 12, 0.7);
    expect(profile).not.toBeNull();
    if (!profile) return;

    expect(profile.buckets).toHaveLength(12);

    // Total volume across buckets should equal sum of bar volumes (2480)
    const sumBuckets = profile.buckets.reduce((acc, b) => acc + b.totalVolume, 0);
    expect(sumBuckets).toBeCloseTo(2480, 3);
    expect(profile.totalVolume).toBeCloseTo(2480, 3);

    // POC should lie inside the high-density 68350 - 68600 consolidation cluster
    expect(profile.pocPrice).toBeGreaterThanOrEqual(68300);
    expect(profile.pocPrice).toBeLessThanOrEqual(68650);

    // VAH >= POC >= VAL
    expect(profile.vahPrice).toBeGreaterThanOrEqual(profile.pocPrice);
    expect(profile.valPrice).toBeLessThanOrEqual(profile.pocPrice);

    // Value Area buckets should account for at least 70% of total volume
    const vaVolume = profile.buckets
      .filter((b) => b.isValueArea)
      .reduce((acc, b) => acc + b.totalVolume, 0);
    expect(vaVolume / profile.totalVolume).toBeGreaterThanOrEqual(0.7);
  });

  it("returns null for empty or flat-range bar arrays", () => {
    expect(calculateVisibleVolumeProfile([])).toBeNull();
    expect(
      calculateVisibleVolumeProfile([
        { time: 1000, open: 100, high: 100, low: 100, close: 100, volume: 50 },
      ])
    ).toBeNull();
  });

  it("computes Fixed Range Volume Profile (FRVP) for a sliced time interval and reverses start/end timestamps seamlessly", () => {
    // Slice only bars at time 2000, 3000, 4000 (volumes: 300 + 950 + 820 = 2070)
    const frvp = calculateFixedRangeVolumeProfile(sampleBars, 4000, 2000, 16, 0.7);
    expect(frvp).not.toBeNull();
    if (!frvp) return;

    expect(frvp.barCount).toBe(3);
    expect(frvp.startTime).toBe(2000);
    expect(frvp.endTime).toBe(4000);
    expect(frvp.minLow).toBe(68100);
    expect(frvp.maxHigh).toBe(68600);
    expect(frvp.totalVolume).toBeCloseTo(2070, 3);
    expect(frvp.buckets).toHaveLength(16);
    expect(frvp.pocPrice).toBeGreaterThanOrEqual(68350);
    expect(frvp.pocPrice).toBeLessThanOrEqual(68600);
    expect(frvp.vahPrice).toBeGreaterThanOrEqual(frvp.pocPrice);
    expect(frvp.valPrice).toBeLessThanOrEqual(frvp.pocPrice);
  });

  it("snaps Fixed Range Volume Profile to nearest bar when startTime equals endTime during initial click", () => {
    const frvp = calculateFixedRangeVolumeProfile(sampleBars, 3000, 3000, 10, 0.7);
    expect(frvp).not.toBeNull();
    if (!frvp) return;

    expect(frvp.barCount).toBe(1);
    expect(frvp.totalVolume).toBeCloseTo(950, 3);
    expect(frvp.minLow).toBe(68350);
    expect(frvp.maxHigh).toBe(68600);
  });

  it("formats Fixed Range Volume Profile object tree label properly", () => {
    const drawing: ChartDrawing = {
      id: "frvp-1",
      type: "fixed_range_volume_profile",
      startTime: 2000,
      endTime: 5000,
      startPrice: 68150,
      endPrice: 68920,
    };
    expect(formatDrawingObjectLabel(drawing)).toBe("Fixed Range Volume Profile");
  });
});
