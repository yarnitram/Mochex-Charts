import { describe, it, expect, beforeEach, beforeAll } from "vitest";
import {
  getCustomScripts,
  saveCustomScript,
  deleteCustomScript,
  saveStudioDraft,
  getStudioDraft,
  DEFAULT_FVG_SCRIPT,
} from "../src/lib/indicators/custom-scripts-store";

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

describe("CustomScriptsStore", () => {
  beforeAll(() => {
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = new MockLocalStorage();
  });

  beforeEach(() => {
    (globalThis as any).localStorage.clear();
  });

  it("seeds default FVG script when local storage is empty", () => {
    const scripts = getCustomScripts();
    expect(scripts.length).toBeGreaterThan(0);
    expect(scripts[0].id).toBe("script-fvg-unmitigated");
    expect(scripts[0].name).toContain("Unmitigated FVG");
  });

  it("saves and updates a custom script with persistence", () => {
    const saved = saveCustomScript({
      name: "My Custom RSI Band",
      description: "Custom RSI indicator test",
      code: "function calculate(bars, inputs, ta) { return []; }",
      type: "indicator",
    });

    expect(saved.id).toBeDefined();
    expect(saved.name).toBe("My Custom RSI Band");

    const scripts = getCustomScripts();
    expect(scripts.some((s) => s.id === saved.id)).toBe(true);

    // Update
    const updated = saveCustomScript({
      id: saved.id,
      name: "My Custom RSI Band (Updated)",
      code: "function calculate(bars, inputs, ta) { return [{ time: 100, value: 50 }]; }",
    });

    expect(updated.name).toBe("My Custom RSI Band (Updated)");
    const reloaded = getCustomScripts().find((s) => s.id === saved.id);
    expect(reloaded?.name).toBe("My Custom RSI Band (Updated)");
  });

  it("deletes a custom script by id", () => {
    const saved = saveCustomScript({
      name: "To Delete",
      code: "// delete me",
    });

    let current = getCustomScripts();
    expect(current.some((s) => s.id === saved.id)).toBe(true);

    const remaining = deleteCustomScript(saved.id);
    expect(remaining.some((s) => s.id === saved.id)).toBe(false);
  });

  it("saves and restores script studio working drafts", () => {
    saveStudioDraft({
      name: "Unfinished Strategy",
      code: "function calculate() { ... }",
      scriptId: "draft-123",
    });

    const draft = getStudioDraft();
    expect(draft).toBeDefined();
    expect(draft?.name).toBe("Unfinished Strategy");
    expect(draft?.scriptId).toBe("draft-123");
  });

  it("resolves catalog script code for built-in indicators including 4 EMA Ribbon", async () => {
    const { resolveCatalogScriptCode, DEFAULT_EMA_RIBBON_SCRIPT } = await import(
      "../src/lib/indicators/custom-scripts-store"
    );

    const emaCode = resolveCatalogScriptCode("ind-ema-ribbon", "4 EMA Ribbon (20, 50, 100, 200)");
    expect(emaCode).toBe(DEFAULT_EMA_RIBBON_SCRIPT);
    expect(emaCode).toContain("ta.ema(closes, 20)");
    expect(emaCode).toContain("ta.ema(closes, 50)");
    expect(emaCode).toContain("ta.ema(closes, 100)");
    expect(emaCode).toContain("ta.ema(closes, 200)");

    const bbCode = resolveCatalogScriptCode("ind-bollinger", "Bollinger Bands Squeeze Breakout");
    expect(bbCode).toContain("ta.bollinger");

    const rsiCode = resolveCatalogScriptCode("ind-rsi", "RSI Divergence Engine Pro");
    expect(rsiCode).toContain("ta.rsi");

    const macdCode = resolveCatalogScriptCode("ind-macd", "Zero-Lag MACD Histogram");
    expect(macdCode).toContain("ta.macd");
  });

  it("seeds and executes DEFAULT_OB_SCRIPT in indicator sandbox returning boxes", async () => {
    const { DEFAULT_OB_SCRIPT } = await import("../src/lib/indicators/custom-scripts-store");
    const { indicatorSandbox } = await import("../src/lib/indicators/sandbox");

    const scripts = getCustomScripts();
    expect(scripts.some((s) => s.id === "script-order-blocks")).toBe(true);

    const bars = [
      { time: 1000, open: 100, high: 105, low: 98, close: 102, volume: 50 },
      { time: 2000, open: 102, high: 103, low: 95, close: 96, volume: 150 }, // Bearish OB candle
      { time: 3000, open: 96, high: 115, low: 96, close: 114, volume: 180 },  // Bullish expansion candle 1
      { time: 4000, open: 114, high: 125, low: 112, close: 122, volume: 120 }, // Bullish expansion candle 2
      { time: 5000, open: 122, high: 126, low: 118, close: 124, volume: 100 },
    ];

    const res = await indicatorSandbox.execute({
      scriptId: "ob-test",
      code: DEFAULT_OB_SCRIPT,
      bars,
      inputs: { lookback: 2, volMultiplier: 1.0, minBodyPct: 0.001 },
    });

    expect(res.success).toBe(true);
    expect(Array.isArray(res.boxes)).toBe(true);
    expect(res.boxes!.length).toBeGreaterThan(0);
    expect(res.boxes![0].type).toBe("BULLISH");
    expect(res.boxes![0].showMidLine).toBe(true);
  });

  it("seeds and executes DEFAULT_PHANTOM_SMC_SCRIPT in indicator sandbox returning SMC boxes and data", async () => {
    const { DEFAULT_PHANTOM_SMC_SCRIPT } = await import("../src/lib/indicators/custom-scripts-store");
    const { indicatorSandbox } = await import("../src/lib/indicators/sandbox");

    const scripts = getCustomScripts();
    expect(scripts.some((s) => s.id === "script-phantom-smc")).toBe(true);

    const bars = [
      { time: 1000, open: 100, high: 105, low: 95, close: 100, volume: 50 },
      { time: 2000, open: 100, high: 102, low: 90, close: 92, volume: 80 },  // Swept prior low (c2)
      { time: 3000, open: 92, high: 110, low: 92, close: 108, volume: 150 }, // Bullish expansion (c1)
      { time: 4000, open: 108, high: 118, low: 105, close: 116, volume: 110 },
      { time: 5000, open: 116, high: 122, low: 114, close: 120, volume: 90 },
      { time: 6000, open: 120, high: 121, low: 104, close: 106, volume: 100 }, // Pullback tapping demand
      { time: 7000, open: 106, high: 125, low: 105, close: 124, volume: 160 }, // CHoCH break above recent high
      { time: 8000, open: 124, high: 130, low: 122, close: 128, volume: 100 },
      { time: 9000, open: 128, high: 135, low: 126, close: 132, volume: 100 },
      { time: 10000, open: 132, high: 140, low: 130, close: 138, volume: 100 },
    ];

    const res = await indicatorSandbox.execute({
      scriptId: "phantom-smc-test",
      code: DEFAULT_PHANTOM_SMC_SCRIPT,
      bars,
      inputs: { ltfSwingLen: 2, rrTP1: 3.0, rrTP2: 5.0, showPositionTool: true },
    });

    expect(res.success).toBe(true);
    expect(Array.isArray(res.boxes)).toBe(true);
    expect(res.boxes!.length).toBeGreaterThan(0);
    const demandBox = res.boxes!.find((b) => b.type === "DEMAND");
    expect(demandBox).toBeDefined();
    expect(demandBox!.color).toBe("#00897b");
  });

  it("seeds and executes DEFAULT_PHANTOM_FLIP_SCRIPT in indicator sandbox returning S2D/D2S flip boxes", async () => {
    const { DEFAULT_PHANTOM_FLIP_SCRIPT } = await import("../src/lib/indicators/custom-scripts-store");
    const { indicatorSandbox } = await import("../src/lib/indicators/sandbox");

    const scripts = getCustomScripts();
    expect(scripts.some((s) => s.id === "script-phantom-flip")).toBe(true);

    const bars = [
      { time: 1000, open: 100, high: 105, low: 95, close: 100, volume: 50 },
      { time: 2000, open: 100, high: 120, low: 98, close: 102, volume: 80 },  // Supply candidate high 120
      { time: 3000, open: 102, high: 103, low: 90, close: 91, volume: 150 },  // Bearish impulse
      { time: 4000, open: 91, high: 95, low: 88, close: 93, volume: 100 },     // Base candle (low 88)
      { time: 5000, open: 93, high: 130, low: 92, close: 128, volume: 250 },   // Massive breakout closing above 120 Supply!
      { time: 6000, open: 128, high: 129, low: 94, close: 96, volume: 110 },   // Pullback tapping S2D flip base (88-95)
      { time: 7000, open: 96, high: 118, low: 95, close: 116, volume: 160 },   // Rejection candle
      { time: 8000, open: 116, high: 125, low: 114, close: 122, volume: 100 },
      { time: 9000, open: 122, high: 135, low: 120, close: 130, volume: 100 },
      { time: 10000, open: 130, high: 140, low: 128, close: 138, volume: 100 },
    ];

    const res = await indicatorSandbox.execute({
      scriptId: "phantom-flip-test",
      code: DEFAULT_PHANTOM_FLIP_SCRIPT,
      bars,
      inputs: { minDisplacementPct: 0.001, rrTP1: 3.0, rrTP2: 5.0, showPositionTool: true },
    });

    expect(res.success).toBe(true);
    expect(Array.isArray(res.boxes)).toBe(true);
    expect(res.boxes!.length).toBeGreaterThan(0);
    const flipBox = res.boxes!.find((b) => b.type === "S2D_FLIP");
    expect(flipBox).toBeDefined();
    expect(flipBox!.color).toBe("#ff9800");
  });

  it("seeds and executes DEFAULT_PHANTOM_IDM_SCRIPT in indicator sandbox returning Extreme POI and IDM boxes", async () => {
    const { DEFAULT_PHANTOM_IDM_SCRIPT } = await import("../src/lib/indicators/custom-scripts-store");
    const { indicatorSandbox } = await import("../src/lib/indicators/sandbox");

    const scripts = getCustomScripts();
    expect(scripts.some((s) => s.id === "script-phantom-idm")).toBe(true);

    const bars = [
      { time: 1000, open: 100, high: 105, low: 95, close: 100, volume: 50 },
      { time: 2000, open: 100, high: 110, low: 98, close: 108, volume: 80 },
      { time: 3000, open: 108, high: 109, low: 90, close: 92, volume: 100 },
      { time: 4000, open: 92, high: 102, low: 92, close: 101, volume: 150 },
      { time: 5000, open: 101, high: 125, low: 100, close: 124, volume: 250 },
      { time: 6000, open: 124, high: 128, low: 108, close: 110, volume: 100 },
      { time: 7000, open: 110, high: 116, low: 109, close: 115, volume: 90 },
      { time: 8000, open: 115, high: 116, low: 91, close: 114, volume: 200 },
      { time: 9000, open: 114, high: 130, low: 112, close: 128, volume: 150 },
      { time: 10000, open: 128, high: 140, low: 126, close: 138, volume: 100 },
    ];

    const res = await indicatorSandbox.execute({
      scriptId: "phantom-idm-test",
      code: DEFAULT_PHANTOM_IDM_SCRIPT,
      bars,
      inputs: { minFvgPct: 0.001, minRejectionWickPct: 0.25, rrTP1: 3.0, rrTP2: 6.0, showPositionTool: true },
    });

    expect(res.success).toBe(true);
    expect(Array.isArray(res.boxes)).toBe(true);
    expect(res.boxes!.length).toBeGreaterThan(0);
    const demandBox = res.boxes!.find((b) => b.type === "DEMAND");
    expect(demandBox).toBeDefined();
    expect(demandBox!.color).toBe("#089981");
  });

  it("seeds and executes DEFAULT_PHANTOM_SESSION_SCRIPT (MOD-04) returning session and position boxes", async () => {
    const { DEFAULT_PHANTOM_SESSION_SCRIPT } = await import("../src/lib/indicators/custom-scripts-store");
    const { indicatorSandbox } = await import("../src/lib/indicators/sandbox");

    const scripts = getCustomScripts();
    expect(scripts.some((s) => s.id === "script-phantom-session")).toBe(true);

    const baseTime = 1700000000;
    const bars = [
      { time: baseTime + 0, open: 100, high: 105, low: 95, close: 100, volume: 50 },
      { time: baseTime + 3600, open: 100, high: 110, low: 98, close: 108, volume: 80 },
      { time: baseTime + 7200, open: 108, high: 109, low: 90, close: 92, volume: 100 },
      { time: baseTime + 10800, open: 92, high: 102, low: 92, close: 101, volume: 150 },
      { time: baseTime + 14400, open: 101, high: 125, low: 100, close: 124, volume: 250 },
      { time: baseTime + 18000, open: 124, high: 128, low: 108, close: 110, volume: 100 },
      { time: baseTime + 21600, open: 110, high: 116, low: 109, close: 115, volume: 90 },
      { time: baseTime + 25200, open: 115, high: 116, low: 88, close: 114, volume: 200 },
      { time: baseTime + 28800, open: 114, high: 130, low: 112, close: 128, volume: 150 },
      { time: baseTime + 32400, open: 128, high: 140, low: 126, close: 138, volume: 100 },
      { time: baseTime + 36000, open: 138, high: 142, low: 134, close: 140, volume: 100 },
      { time: baseTime + 39600, open: 140, high: 145, low: 138, close: 142, volume: 100 },
      { time: baseTime + 43200, open: 142, high: 146, low: 140, close: 144, volume: 100 },
      { time: baseTime + 46800, open: 144, high: 148, low: 142, close: 146, volume: 100 },
      { time: baseTime + 50400, open: 146, high: 150, low: 144, close: 148, volume: 100 },
      { time: baseTime + 54000, open: 148, high: 152, low: 146, close: 150, volume: 100 },
    ];

    const res = await indicatorSandbox.execute({
      scriptId: "phantom-session-test",
      code: DEFAULT_PHANTOM_SESSION_SCRIPT,
      bars,
      inputs: { minRejectionWickPct: 0.2, rrTP1: 3.0, rrTP2: 5.0, showPositionTool: true },
    });

    expect(res.success).toBe(true);
    expect(Array.isArray(res.boxes)).toBe(true);
    expect(res.data?.length).toBe(bars.length);
  });

  it("seeds and executes DEFAULT_PHANTOM_CONTINUATION_SCRIPT (MOD-05) returning POI boxes", async () => {
    const { DEFAULT_PHANTOM_CONTINUATION_SCRIPT } = await import("../src/lib/indicators/custom-scripts-store");
    const { indicatorSandbox } = await import("../src/lib/indicators/sandbox");

    const scripts = getCustomScripts();
    expect(scripts.some((s) => s.id === "script-phantom-continuation")).toBe(true);

    const bars = [
      { time: 1000, open: 100, high: 105, low: 95, close: 100, volume: 50 },
      { time: 2000, open: 100, high: 104, low: 94, close: 98, volume: 50 },
      { time: 3000, open: 98, high: 108, low: 96, close: 106, volume: 80 },
      { time: 4000, open: 106, high: 107, low: 99, close: 102, volume: 60 },
      { time: 5000, open: 102, high: 104, low: 96, close: 98, volume: 60 },
      { time: 6000, open: 98, high: 100, low: 92, close: 94, volume: 70 },
      { time: 7000, open: 94, high: 102, low: 93, close: 100, volume: 80 },
      { time: 8000, open: 100, high: 115, low: 98, close: 114, volume: 150 },
      { time: 9000, open: 114, high: 125, low: 112, close: 124, volume: 200 },
      { time: 10000, open: 124, high: 128, low: 118, close: 120, volume: 100 },
      { time: 11000, open: 120, high: 122, low: 105, close: 108, volume: 90 },
      { time: 12000, open: 108, high: 130, low: 106, close: 128, volume: 180 },
      { time: 13000, open: 128, high: 135, low: 126, close: 132, volume: 100 },
      { time: 14000, open: 132, high: 140, low: 130, close: 138, volume: 100 },
      { time: 15000, open: 138, high: 142, low: 135, close: 140, volume: 100 },
      { time: 16000, open: 140, high: 145, low: 138, close: 142, volume: 100 },
    ];

    const res = await indicatorSandbox.execute({
      scriptId: "phantom-cont-test",
      code: DEFAULT_PHANTOM_CONTINUATION_SCRIPT,
      bars,
      inputs: { swingLength: 3, minRejectionWickPct: 0.25, rrTP1: 3.0, rrTP2: 5.0, showPositionTool: true },
    });

    expect(res.success).toBe(true);
    expect(Array.isArray(res.boxes)).toBe(true);
    expect(res.data?.length).toBe(bars.length);
  });

  it("seeds and executes DEFAULT_PHANTOM_RISK_SCRIPT (MOD-06) returning 50% Mean Threshold POIs", async () => {
    const { DEFAULT_PHANTOM_RISK_SCRIPT } = await import("../src/lib/indicators/custom-scripts-store");
    const { indicatorSandbox } = await import("../src/lib/indicators/sandbox");

    const scripts = getCustomScripts();
    expect(scripts.some((s) => s.id === "script-phantom-risk")).toBe(true);

    const bars = [
      { time: 1000, open: 100, high: 105, low: 95, close: 100, volume: 50 },
      { time: 2000, open: 100, high: 102, low: 90, close: 92, volume: 80 },
      { time: 3000, open: 92, high: 110, low: 92, close: 108, volume: 150 },
      { time: 4000, open: 108, high: 120, low: 107, close: 118, volume: 200 },
      { time: 5000, open: 118, high: 122, low: 112, close: 115, volume: 100 },
      { time: 6000, open: 115, high: 116, low: 94, close: 96, volume: 120 },
      { time: 7000, open: 96, high: 125, low: 95, close: 122, volume: 220 },
      { time: 8000, open: 122, high: 130, low: 120, close: 128, volume: 100 },
      { time: 9000, open: 128, high: 135, low: 126, close: 132, volume: 100 },
      { time: 10000, open: 132, high: 140, low: 130, close: 138, volume: 100 },
      { time: 11000, open: 138, high: 142, low: 135, close: 140, volume: 100 },
      { time: 12000, open: 140, high: 145, low: 138, close: 142, volume: 100 },
      { time: 13000, open: 142, high: 148, low: 140, close: 146, volume: 100 },
      { time: 14000, open: 146, high: 150, low: 144, close: 148, volume: 100 },
      { time: 15000, open: 148, high: 152, low: 146, close: 150, volume: 100 },
    ];

    const res = await indicatorSandbox.execute({
      scriptId: "phantom-risk-test",
      code: DEFAULT_PHANTOM_RISK_SCRIPT,
      bars,
      inputs: { minFvgPct: 0.001, meanThresholdRatio: 0.5, rrTP1: 3.0, rrTP2: 5.0, showPositionTool: true },
    });

    expect(res.success).toBe(true);
    expect(Array.isArray(res.boxes)).toBe(true);
    expect(res.boxes!.length).toBeGreaterThan(0);
  });

  it("seeds and executes DEFAULT_PHANTOM_BREAKER_SCRIPT (MOD-07) and DEFAULT_PHANTOM_MASTER_SCRIPT (MOD-08)", async () => {
    const { DEFAULT_PHANTOM_BREAKER_SCRIPT, DEFAULT_PHANTOM_MASTER_SCRIPT } = await import("../src/lib/indicators/custom-scripts-store");
    const { indicatorSandbox } = await import("../src/lib/indicators/sandbox");

    const scripts = getCustomScripts();
    expect(scripts.some((s) => s.id === "script-phantom-breaker")).toBe(true);
    expect(scripts.some((s) => s.id === "script-phantom-master")).toBe(true);

    const bars = [
      { time: 1000, open: 100, high: 105, low: 95, close: 100, volume: 50 },
      { time: 2000, open: 100, high: 103, low: 92, close: 94, volume: 80 },
      { time: 3000, open: 94, high: 110, low: 93, close: 108, volume: 150 },
      { time: 4000, open: 108, high: 112, low: 85, close: 86, volume: 250 },
      { time: 5000, open: 86, high: 95, low: 84, close: 93, volume: 120 },
      { time: 6000, open: 93, high: 94, low: 75, close: 76, volume: 180 },
      { time: 7000, open: 76, high: 80, low: 72, close: 74, volume: 100 },
      { time: 8000, open: 74, high: 78, low: 70, close: 72, volume: 100 },
      { time: 9000, open: 72, high: 76, low: 68, close: 70, volume: 100 },
      { time: 10000, open: 70, high: 74, low: 66, close: 68, volume: 100 },
      { time: 11000, open: 68, high: 72, low: 64, close: 66, volume: 100 },
      { time: 12000, open: 66, high: 70, low: 62, close: 64, volume: 100 },
      { time: 13000, open: 64, high: 68, low: 60, close: 62, volume: 100 },
      { time: 14000, open: 62, high: 66, low: 58, close: 60, volume: 100 },
      { time: 15000, open: 60, high: 64, low: 56, close: 58, volume: 100 },
      { time: 16000, open: 58, high: 62, low: 54, close: 56, volume: 100 },
      { time: 17000, open: 56, high: 60, low: 52, close: 54, volume: 100 },
      { time: 18000, open: 54, high: 58, low: 50, close: 52, volume: 100 },
      { time: 19000, open: 52, high: 56, low: 48, close: 50, volume: 100 },
      { time: 20000, open: 50, high: 54, low: 46, close: 48, volume: 100 },
    ];

    const resBreaker = await indicatorSandbox.execute({
      scriptId: "phantom-breaker-test",
      code: DEFAULT_PHANTOM_BREAKER_SCRIPT,
      bars,
      inputs: { minRejectionWickPct: 0.25, rrTP1: 3.0, rrTP2: 5.0, showPositionTool: true },
    });
    expect(resBreaker.success).toBe(true);
    expect(Array.isArray(resBreaker.boxes)).toBe(true);

    const resMaster = await indicatorSandbox.execute({
      scriptId: "phantom-master-test",
      code: DEFAULT_PHANTOM_MASTER_SCRIPT,
      bars,
      inputs: { minRejectionWickPct: 0.25, rrTP1: 3.0, rrTP2: 5.0, showPositionTool: true },
    });
    expect(resMaster.success).toBe(true);
    expect(Array.isArray(resMaster.boxes)).toBe(true);
  });

  it("resolves catalog script code for MOD-01 and MOD-02 SMC scripts", async () => {
    const {
      resolveCatalogScriptCode,
      DEFAULT_PHANTOM_SMC_SCRIPT,
      DEFAULT_PHANTOM_FLIP_SCRIPT,
    } = await import("../src/lib/indicators/custom-scripts-store");

    expect(resolveCatalogScriptCode("mod-01", "Phantom SMC MOD-01")).toBe(DEFAULT_PHANTOM_SMC_SCRIPT);
    expect(resolveCatalogScriptCode("md01", "MD01 Supply Demand")).toBe(DEFAULT_PHANTOM_SMC_SCRIPT);
    expect(resolveCatalogScriptCode("script-phantom-smc", "Phantom SMC Supply & Demand (v7)")).toBe(
      DEFAULT_PHANTOM_SMC_SCRIPT
    );
    expect(resolveCatalogScriptCode("script-phantom-flip", "Phantom SMC S2D & D2S Flips")).toBe(
      DEFAULT_PHANTOM_FLIP_SCRIPT
    );
  });

  it("migrates existing stored v6 Phantom SMC scripts in localStorage to v7 with mitigation capping", async () => {
    const { getCustomScripts } = await import("../src/lib/indicators/custom-scripts-store");
    const outdated = [
      {
        id: "script-phantom-smc",
        name: "Phantom SMC Supply & Demand (v6)",
        description: "Old description",
        code: "function calculate(bars) { if (!d.invalidated) d.endTime = latestTime; }",
        type: "indicator",
        color: "#00e676",
        createdAt: 1000,
        updatedAt: 1000,
      },
    ];
    (globalThis as any).localStorage.setItem("mochex_custom_scripts_v1", JSON.stringify(outdated));

    const scripts = getCustomScripts();
    const smc = scripts.find((s) => s.id === "script-phantom-smc");
    expect(smc).toBeDefined();
    expect(smc!.name).toContain("v7");
    expect(smc!.code).toContain("Phantom SMC (Smart Money Concepts) [v7]");
    expect(smc!.code).toContain("d.mitigated = true;");
  });

  it("caps mitigated zones and forward simulates trade trajectory without stretching to present price", async () => {
    const { DEFAULT_PHANTOM_SMC_SCRIPT } = await import("../src/lib/indicators/custom-scripts-store");
    const { indicatorSandbox } = await import("../src/lib/indicators/sandbox");

    const bars = [
      { time: 1000, open: 100, high: 105, low: 95, close: 100, volume: 50 },
      { time: 2000, open: 100, high: 102, low: 88, close: 90, volume: 80 },  // c2 swept low
      { time: 3000, open: 90, high: 110, low: 90, close: 108, volume: 150 }, // c1 expansion creating demand (88-90)
      { time: 4000, open: 108, high: 118, low: 105, close: 116, volume: 110 },
      { time: 5000, open: 116, high: 122, low: 114, close: 120, volume: 90 },
      { time: 6000, open: 120, high: 121, low: 89, close: 95, volume: 100 },  // c0 low 89 taps demand (88-90)! Mitigated here!
      { time: 7000, open: 95, high: 125, low: 94, close: 124, volume: 160 },
      { time: 8000, open: 124, high: 130, low: 122, close: 128, volume: 100 },
      { time: 9000, open: 128, high: 135, low: 126, close: 132, volume: 100 },
      { time: 10000, open: 132, high: 140, low: 130, close: 138, volume: 100 }, // Present price
    ];

    const res = await indicatorSandbox.execute({
      scriptId: "phantom-smc-capping-test",
      code: DEFAULT_PHANTOM_SMC_SCRIPT,
      bars,
      inputs: { ltfSwingLen: 2, maxTapWindow: 25, rrTP1: 3.0, rrTP2: 5.0, showPositionTool: true },
    });

    expect(res.success).toBe(true);
    expect(res.data).toEqual([]); // Empty line series array to avoid duplicate price line

    // Verify mitigated demand zone is capped at bar 6 (time 6000), NOT latestTime (time 10000)
    const demandBox = res.boxes!.find((b) => b.type === "DEMAND");
    expect(demandBox).toBeDefined();
    expect(demandBox!.endTime).toBe(6000);
    expect(demandBox!.label).toBe("Demand (Mitigated)");
  });
});
