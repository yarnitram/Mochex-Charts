import { describe, it, expect, beforeAll } from "vitest";
import {
  DEFAULT_ADAM_EVE_SCRIPT,
  DEFAULT_HEAD_SHOULDERS_SCRIPT,
  getCustomScripts,
  resolveCatalogScriptCode,
} from "../src/lib/indicators/custom-scripts-store";
import { indicatorSandbox } from "../src/lib/indicators/sandbox";

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

describe("Chart Patterns Recognition Suite: Adam & Eve and Head & Shoulders", () => {
  beforeAll(() => {
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = new MockLocalStorage();
  });

  describe("Catalog & Storage Registration", () => {
    it("seeds Adam & Eve and Head & Shoulders into custom scripts store", () => {
      const scripts = getCustomScripts();
      const adamEve = scripts.find((s) => s.id === "script-adam-eve");
      const hs = scripts.find((s) => s.id === "script-head-shoulders");

      expect(adamEve).toBeDefined();
      expect(adamEve?.name).toContain("Adam and Eve");
      expect(hs).toBeDefined();
      expect(hs?.name).toContain("Head and Shoulders");
    });

    it("resolves catalog script code by pattern query names", () => {
      expect(resolveCatalogScriptCode("adam-eve-patterns")).toBe(DEFAULT_ADAM_EVE_SCRIPT);
      expect(resolveCatalogScriptCode("eve-bottom")).toBe(DEFAULT_ADAM_EVE_SCRIPT);
      expect(resolveCatalogScriptCode("head-and-shoulders")).toBe(DEFAULT_HEAD_SHOULDERS_SCRIPT);
      expect(resolveCatalogScriptCode("inverse-hs")).toBe(DEFAULT_HEAD_SHOULDERS_SCRIPT);
    });
  });

  describe("Adam & Eve Pattern Recognition Engine", () => {
    it("detects Bullish Adam (sharp V) and Eve (rounded U) double bottom with neckline breakout", async () => {
      const bars = [
        { time: 1000, open: 120, high: 122, low: 118, close: 119, volume: 100 },
        { time: 2000, open: 119, high: 120, low: 112, close: 113, volume: 120 },
        { time: 3000, open: 113, high: 114, low: 90, close: 92, volume: 280 },  // Adam sharp V-bottom (low 90)
        { time: 4000, open: 92, high: 115, low: 95, close: 114, volume: 220 },  // Rapid rebound
        { time: 5000, open: 114, high: 130, low: 112, close: 128, volume: 180 }, // Interim Neckline peak (high 130)
        { time: 6000, open: 128, high: 125, low: 108, close: 110, volume: 110 }, // Pullback into Eve
        { time: 7000, open: 110, high: 112, low: 91, close: 92, volume: 90 },   // Eve base (low 91)
        { time: 8000, open: 92, high: 110, low: 93, close: 108, volume: 130 },  // Eve rebound
        { time: 9000, open: 108, high: 135, low: 107, close: 133, volume: 300 }, // Breakout (close 133 > 130)
        { time: 10000, open: 133, high: 145, low: 132, close: 142, volume: 200 },
      ];

      const res = await indicatorSandbox.execute({
        scriptId: "adam-eve-test",
        code: DEFAULT_ADAM_EVE_SCRIPT,
        bars,
        inputs: { lookback: 1, minEveBars: 2, priceTolerancePct: 5.0, minBouncePct: 0.5, showPositionTool: true },
      });

      expect(res.success).toBe(true);
      expect(Array.isArray(res.boxes)).toBe(true);
      expect(res.boxes!.length).toBeGreaterThan(0);

      const adamBox = res.boxes!.find((b) => b.label?.includes("Adam (V-Bottom)"));
      const eveBox = res.boxes!.find((b) => b.label?.includes("Eve (U-Bottom)"));
      const necklineBox = res.boxes!.find((b) => b.label?.includes("Neckline Breakout"));

      expect(adamBox).toBeDefined();
      expect(adamBox?.color).toBe("#00d8ff");
      expect(eveBox).toBeDefined();
      expect(eveBox?.color).toBe("#e040fb");
      expect(necklineBox).toBeDefined();
      expect(necklineBox?.color).toBe("#00c087");

      const tp1Box = res.boxes!.find((b) => b.label?.includes("TP1 (1R)"));
      const tp2Box = res.boxes!.find((b) => b.label?.includes("TP2 (3R)"));
      const slBox = res.boxes!.find((b) => b.label?.includes("SL (Extreme Adam)"));
      expect(tp1Box).toBeDefined();
      expect(tp2Box).toBeDefined();
      expect(slBox).toBeDefined();
    });

    it("detects Bearish Inverted Adam (V-top) and Eve (rounded U-top) with breakdown", async () => {
      const bars = [
        { time: 1000, open: 100, high: 102, low: 98, close: 101, volume: 100 },
        { time: 2000, open: 101, high: 110, low: 100, close: 108, volume: 120 },
        { time: 3000, open: 108, high: 140, low: 107, close: 138, volume: 300 }, // Adam V-Top (high 140)
        { time: 4000, open: 138, high: 136, low: 112, close: 114, volume: 220 }, // Sharp drop
        { time: 5000, open: 114, high: 115, low: 98, close: 100, volume: 180 },  // Interim Neckline Trough (low 98)
        { time: 6000, open: 100, high: 125, low: 99, close: 122, volume: 110 },  // Rally into Eve
        { time: 7000, open: 122, high: 139, low: 120, close: 136, volume: 90 },  // Eve top (high 139)
        { time: 8000, open: 136, high: 137, low: 115, close: 118, volume: 130 },
        { time: 9000, open: 118, high: 119, low: 90, close: 92, volume: 320 },   // Breakdown below 98
        { time: 10000, open: 92, high: 93, low: 78, close: 80, volume: 200 },
      ];

      const res = await indicatorSandbox.execute({
        scriptId: "adam-eve-bear-test",
        code: DEFAULT_ADAM_EVE_SCRIPT,
        bars,
        inputs: { lookback: 1, minEveBars: 2, priceTolerancePct: 5.0, minBouncePct: 0.5, showPositionTool: true },
      });

      expect(res.success).toBe(true);
      expect(Array.isArray(res.boxes)).toBe(true);

      const adamTop = res.boxes!.find((b) => b.label?.includes("Adam (V-Top)"));
      const eveTop = res.boxes!.find((b) => b.label?.includes("Eve (U-Top)"));
      const necklineDown = res.boxes!.find((b) => b.label?.includes("Neckline Breakdown"));

      expect(adamTop).toBeDefined();
      expect(eveTop).toBeDefined();
      expect(necklineDown).toBeDefined();
    });
  });

  describe("Head and Shoulders Pattern Recognition Engine", () => {
    it("detects Bearish Head & Shoulders (LS, Head, RS) and triggers breakdown short", async () => {
      const bars = [
        { time: 1000, open: 105, high: 110, low: 104, close: 108, volume: 100 },
        { time: 2000, open: 108, high: 120, low: 107, close: 118, volume: 150 }, // Left Shoulder (high 120)
        { time: 3000, open: 118, high: 112, low: 102, close: 104, volume: 120 }, // Trough 1 (low 102)
        { time: 4000, open: 104, high: 135, low: 105, close: 132, volume: 250 }, // Head Peak (high 135)
        { time: 5000, open: 132, high: 114, low: 103, close: 105, volume: 160 }, // Trough 2 (low 103)
        { time: 6000, open: 105, high: 121, low: 106, close: 119, volume: 130 }, // Right Shoulder (high 121)
        { time: 7000, open: 119, high: 115, low: 108, close: 110, volume: 110 },
        { time: 8000, open: 110, high: 111, low: 96, close: 98, volume: 290 },   // Breakdown below Neckline 102.5
        { time: 9000, open: 98, high: 99, low: 80, close: 82, volume: 210 },
      ];

      const res = await indicatorSandbox.execute({
        scriptId: "hs-bear-test",
        code: DEFAULT_HEAD_SHOULDERS_SCRIPT,
        bars,
        inputs: { lookback: 1, shoulderTolerancePct: 6.0, minHeadDominancePct: 0.5, showPositionTool: true },
      });

      expect(res.success).toBe(true);
      expect(Array.isArray(res.boxes)).toBe(true);
      expect(res.boxes!.length).toBeGreaterThan(0);

      const lsBox = res.boxes!.find((b) => b.label?.includes("Left Shoulder"));
      const headBox = res.boxes!.find((b) => b.label?.includes("Head"));
      const rsBox = res.boxes!.find((b) => b.label?.includes("Right Shoulder"));
      const necklineBox = res.boxes!.find((b) => b.label?.includes("Neckline"));

      expect(lsBox).toBeDefined();
      expect(headBox).toBeDefined();
      expect(rsBox).toBeDefined();
      expect(necklineBox).toBeDefined();

      const tp1Box = res.boxes!.find((b) => b.label?.includes("TP1 (1R)"));
      const tp2Box = res.boxes!.find((b) => b.label?.includes("TP2 (3R)"));
      const slBox = res.boxes!.find((b) => b.label?.includes("SL (Extreme Head)"));
      expect(tp1Box).toBeDefined();
      expect(tp2Box).toBeDefined();
      expect(slBox).toBeDefined();
    });

    it("detects Bullish Inverse Head & Shoulders (Inv LS, Inv Head, Inv RS) and triggers breakout long", async () => {
      const bars = [
        { time: 1000, open: 115, high: 116, low: 112, close: 113, volume: 100 },
        { time: 2000, open: 113, high: 114, low: 100, close: 102, volume: 150 }, // Inv Left Shoulder (low 100)
        { time: 3000, open: 102, high: 118, low: 101, close: 117, volume: 120 }, // Peak 1 (high 118)
        { time: 4000, open: 117, high: 110, low: 85, close: 88, volume: 260 },   // Inv Head Trough (low 85)
        { time: 5000, open: 88, high: 119, low: 104, close: 117, volume: 160 },  // Peak 2 (high 119)
        { time: 6000, open: 117, high: 112, low: 99, close: 101, volume: 130 },  // Inv Right Shoulder (low 99)
        { time: 7000, open: 101, high: 110, low: 100, close: 108, volume: 110 },
        { time: 8000, open: 108, high: 126, low: 107, close: 124, volume: 310 }, // Breakout above Neckline 118.5
        { time: 9000, open: 124, high: 140, low: 123, close: 138, volume: 220 },
      ];

      const res = await indicatorSandbox.execute({
        scriptId: "ihs-bull-test",
        code: DEFAULT_HEAD_SHOULDERS_SCRIPT,
        bars,
        inputs: { lookback: 1, shoulderTolerancePct: 6.0, minHeadDominancePct: 0.5, showPositionTool: true },
      });

      expect(res.success).toBe(true);
      expect(Array.isArray(res.boxes)).toBe(true);

      const invLsBox = res.boxes!.find((b) => b.label?.includes("Inv Left Shoulder"));
      const invHeadBox = res.boxes!.find((b) => b.label?.includes("Inv Head"));
      const invRsBox = res.boxes!.find((b) => b.label?.includes("Inv Right Shoulder"));
      const necklineBox = res.boxes!.find((b) => b.label?.includes("Neckline"));

      expect(invLsBox).toBeDefined();
      expect(invHeadBox).toBeDefined();
      expect(invRsBox).toBeDefined();
      expect(necklineBox).toBeDefined();

      const tp1Box = res.boxes!.find((b) => b.label?.includes("TP1 (1R)"));
      const tp2Box = res.boxes!.find((b) => b.label?.includes("TP2 (3R)"));
      const slBox = res.boxes!.find((b) => b.label?.includes("SL (Extreme Head)"));
      expect(tp1Box).toBeDefined();
      expect(tp2Box).toBeDefined();
      expect(slBox).toBeDefined();
    });
  
    it("stops position box at the exact candle where TP1 or SL is hit instead of extending to the right", async () => {
      const bars = [
        { time: 1000, open: 105, high: 110, low: 104, close: 108, volume: 100 },
        { time: 2000, open: 108, high: 120, low: 107, close: 118, volume: 150 },
        { time: 3000, open: 118, high: 112, low: 102, close: 104, volume: 120 },
        { time: 4000, open: 104, high: 135, low: 105, close: 132, volume: 250 },
        { time: 5000, open: 132, high: 114, low: 103, close: 105, volume: 160 },
        { time: 6000, open: 105, high: 121, low: 106, close: 119, volume: 130 },
        { time: 7000, open: 119, high: 115, low: 108, close: 110, volume: 110 },
        { time: 8000, open: 110, high: 111, low: 96, close: 98, volume: 290 },
        { time: 9000, open: 98, high: 99, low: 58, close: 60, volume: 210 },
        { time: 10000, open: 60, high: 62, low: 57, close: 59, volume: 180 },
        { time: 11000, open: 59, high: 60, low: 55, close: 56, volume: 150 },
      ];

      const res = await indicatorSandbox.execute({
        scriptId: "hs-stop-tp-test",
        code: DEFAULT_HEAD_SHOULDERS_SCRIPT,
        bars,
        inputs: { lookback: 1, shoulderTolerancePct: 6.0, minHeadDominancePct: 0.5, showPositionTool: true },
      });

      expect(res.success).toBe(true);
      const tp1Box = res.boxes!.find((b) => b.label?.includes("TP1 (1R)"));
      expect(tp1Box).toBeDefined();
      expect(tp1Box?.endTime).toBe(9000);
      expect(tp1Box?.endTime).toBeLessThan(11000);
    });
});
});
