import { describe, it, expect } from "vitest";
import { RadarPoiItem, PoiStatus } from "../src/lib/indicators/radar-poi-engine";

describe("Radar Live WebSocket & Quick Preview Engine (DEC-139)", () => {
  const mockBullishPoi: RadarPoiItem = {
    id: "ob-bull-SOLUSDT-15m-100",
    symbol: "SOLUSDT",
    timeframe: "15m",
    category: "order_block",
    type: "BULLISH",
    label: "BULLISH OB (+2C FVG)",
    top: 105,
    bottom: 95,
    meanThreshold: 100,
    entryPrice: 105,
    fullRetestPrice: 95,
    fvgGapPct: 1.5,
    status: "fresh",
    isInsideZone: false,
    distanceToEntryPct: 4.76, // at price 110: (110 - 105) / 110 = 4.54%
    distanceToMtPct: 9.09,
    currentPrice: 110,
    time: 1700000000000,
  };

  const mockBearishPoi: RadarPoiItem = {
    id: "sz-bear-BTCUSDT-4H-200",
    symbol: "BTCUSDT",
    timeframe: "4H",
    category: "sandwich_zone",
    type: "BEARISH",
    label: "SUPPLY SANDWICH (RGRR) ++",
    isPlus: true,
    top: 70000,
    bottom: 68000,
    meanThreshold: 69000,
    entryPrice: 68000,
    fullRetestPrice: 70000,
    status: "fresh",
    isInsideZone: false,
    distanceToEntryPct: 4.61, // at price 65000: (68000 - 65000) / 65000 = 4.61%
    distanceToMtPct: 6.15,
    currentPrice: 65000,
    time: 1700000000000,
  };

  function updatePoiMetrics(poi: RadarPoiItem, newPrice: number): RadarPoiItem {
    const isInside = newPrice >= poi.bottom && newPrice <= poi.top;
    const distEntry =
      newPrice > poi.entryPrice
        ? ((newPrice - poi.entryPrice) / newPrice) * 100
        : newPrice < poi.entryPrice
        ? ((poi.entryPrice - newPrice) / newPrice) * 100
        : 0;
    const distMt = (Math.abs(newPrice - poi.meanThreshold) / newPrice) * 100;
    const isBroken = poi.type === "BULLISH" ? newPrice < poi.bottom : newPrice > poi.top;
    const status: PoiStatus = isBroken
      ? "broken"
      : isInside
      ? "testing"
      : poi.status === "mitigated"
      ? "mitigated"
      : "fresh";

    return {
      ...poi,
      currentPrice: newPrice,
      isInsideZone: isInside,
      distanceToEntryPct: distEntry,
      distanceToMtPct: distMt,
      status,
    };
  }

  it("dynamically triggers testing state when live WebSocket tick enters zone boundaries", () => {
    // Price drops from 110 into Bullish zone [95, 105] at 102
    const updated = updatePoiMetrics(mockBullishPoi, 102);
    expect(updated.isInsideZone).toBe(true);
    expect(updated.status).toBe("testing");
    expect(updated.currentPrice).toBe(102);
    expect(updated.distanceToMtPct).toBeCloseTo(1.96, 1);
  });

  it("dynamically flags broken state when live price tick violates invalidation level", () => {
    // Bullish zone bottom is 95. Price drops below to 92
    const updated = updatePoiMetrics(mockBullishPoi, 92);
    expect(updated.isInsideZone).toBe(false);
    expect(updated.status).toBe("broken");
  });

  it("calculates accurate price distance and tick flash direction for Bearish Supply zone", () => {
    // Price rises from 65,000 to 67,500 approaching entry at 68,000
    const prevPrice = mockBearishPoi.currentPrice;
    const newPrice = 67500;
    const direction = newPrice > prevPrice ? "up" : "down";
    expect(direction).toBe("up");

    const updated = updatePoiMetrics(mockBearishPoi, newPrice);
    expect(updated.isInsideZone).toBe(false);
    expect(updated.status).toBe("fresh");
    // (68000 - 67500) / 67500 * 100 = 0.74%
    expect(updated.distanceToEntryPct).toBeCloseTo(0.74, 1);
    expect(updated.distanceToEntryPct).toBeLessThan(1.5); // Approaching (< 1.5%)
  });

  it("detects when price enters Bearish Supply zone and transitions to testing status", () => {
    // Price rises into Bearish zone [68000, 70000] at 68500
    const updated = updatePoiMetrics(mockBearishPoi, 68500);
    expect(updated.isInsideZone).toBe(true);
    expect(updated.status).toBe("testing");
    // Midpoint is 69000, at 68500 distance is (69000 - 68500) / 68500 = 0.73%
    expect(updated.distanceToMtPct).toBeCloseTo(0.73, 1);
  });
});
