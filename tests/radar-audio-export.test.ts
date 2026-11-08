import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getRadarAudioSettings,
  saveRadarAudioSettings,
  playRadarChime,
  DEFAULT_RADAR_AUDIO_SETTINGS,
  RADAR_CHIME_PRESETS,
  RadarAudioSettings,
} from "../src/lib/audio/sound-effects";
import {
  generateRadarCsv,
  generateRadarJson,
  generateRadarClipboardMarkdown,
  ExportableRadarItem,
  RadarExportMeta,
} from "../src/lib/screener/radar-export";
import { RadarPoiItem } from "../src/lib/indicators/radar-poi-engine";

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
  get length(): number {
    return Object.keys(this.store).length;
  }
  key(index: number): string | null {
    return Object.keys(this.store)[index] ?? null;
  }
}

describe("Institutional Sound Effects & Radar Audio Engine", () => {
  beforeEach(() => {
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = new MockLocalStorage();
    (globalThis as any).window.dispatchEvent = vi.fn();
    vi.restoreAllMocks();
  });

  it("returns default audio settings when localStorage is empty", () => {
    const settings = getRadarAudioSettings();
    expect(settings).toEqual(DEFAULT_RADAR_AUDIO_SETTINGS);
    expect(settings.soundType).toBe("radar_ping");
    expect(settings.volume).toBe(0.7);
    expect(settings.enabled).toBe(true);
    expect(settings.chimeOnZoneEntry).toBe(true);
  });

  it("persists and retrieves updated audio settings correctly", () => {
    const updated: RadarAudioSettings = {
      soundType: "institutional_chime",
      volume: 0.85,
      enabled: true,
      chimeOnZoneEntry: false,
    };
    saveRadarAudioSettings(updated);

    const retrieved = getRadarAudioSettings();
    expect(retrieved.soundType).toBe("institutional_chime");
    expect(retrieved.volume).toBe(0.85);
    expect(retrieved.enabled).toBe(true);
    expect(retrieved.chimeOnZoneEntry).toBe(false);
  });

  it("clamps volume between 0.0 and 1.0", () => {
    saveRadarAudioSettings({
      soundType: "cyber_blip",
      volume: 1.5,
      enabled: true,
      chimeOnZoneEntry: true,
    });
    expect(getRadarAudioSettings().volume).toBe(1.0);

    saveRadarAudioSettings({
      soundType: "cyber_blip",
      volume: -0.5,
      enabled: true,
      chimeOnZoneEntry: true,
    });
    expect(getRadarAudioSettings().volume).toBe(0.0);
  });

  it("falls back to default sound type if an invalid string is present in storage", () => {
    localStorage.setItem(
      "mochex:radar_audio_settings",
      JSON.stringify({ soundType: "invalid_chime_unknown", volume: 0.5 })
    );
    const settings = getRadarAudioSettings();
    expect(settings.soundType).toBe("radar_ping");
    expect(settings.volume).toBe(0.5);
  });

  it("exposes all 5 institutional chime presets with descriptions", () => {
    expect(RADAR_CHIME_PRESETS).toHaveLength(5);
    const ids = RADAR_CHIME_PRESETS.map((p) => p.id);
    expect(ids).toContain("radar_ping");
    expect(ids).toContain("institutional_chime");
    expect(ids).toContain("cyber_blip");
    expect(ids).toContain("sonar_pulse");
    expect(ids).toContain("urgent_alarm");

    for (const preset of RADAR_CHIME_PRESETS) {
      expect(preset.label.length).toBeGreaterThan(3);
      expect(preset.description.length).toBeGreaterThan(10);
    }
  });

  it("does not crash when calling playRadarChime in headless or audio-disabled environments", () => {
    expect(() => playRadarChime()).not.toThrow();
    expect(() => playRadarChime({ soundType: "urgent_alarm", volume: 0.5 })).not.toThrow();
    expect(() => playRadarChime({ enabled: false })).not.toThrow();
  });
});

describe("Institutional Radar Export Engine", () => {
  const mockPois: ExportableRadarItem[] = [
    {
      symbol: "BTCUSDT",
      name: "Bitcoin",
      price: 76540.25,
      change24h: 3.45,
      volume24h: 1250000000,
      selectedPoi: {
        id: "poi-btc-4h-ob",
        symbol: "BTCUSDT",
        category: "order_block",
        type: "BULLISH",
        timeframe: "4H",
        label: "4H Bullish OB",
        isPlus: true,
        entryPrice: 76000,
        meanThreshold: 75500,
        fullRetestPrice: 75000,
        top: 76000,
        bottom: 75000,
        status: "testing",
        isInsideZone: true,
        distanceToEntryPct: 0.0,
        distanceToMtPct: 1.36,
        currentPrice: 76540.25,
        time: 1730000000,
        correlation: {
          btcCorrelation: 1.0,
          correlationTier: "HIGH",
          sector: "majors_l1",
          sectorLabel: "Layer 1 / Majors",
          sectorBadge: "🏛️ L1/Majors",
          clusterExposureScore: 75,
          correlatedPeersCount: 3,
        },
      },
    },
    {
      symbol: "ETHUSDT",
      name: "Ethereum",
      price: 2980.1,
      change24h: -1.2,
      volume24h: 650000000,
      selectedPoi: {
        id: "poi-eth-1h-fvg",
        symbol: "ETHUSDT",
        category: "fvg",
        type: "BEARISH",
        timeframe: "1H",
        label: "1H Bearish FVG",
        isPlus: false,
        entryPrice: 3010,
        meanThreshold: 3025,
        fullRetestPrice: 3040,
        top: 3040,
        bottom: 3010,
        status: "fresh",
        isInsideZone: false,
        distanceToEntryPct: 1.0,
        distanceToMtPct: 1.5,
        currentPrice: 2980.1,
        time: 1730000000,
      },
    },
    {
      symbol: "SOLUSDT",
      name: "Solana",
      price: 198.5,
      change24h: 5.12,
      volume24h: 320000000,
      selectedPoi: null,
    },
  ];

  const mockMeta: RadarExportMeta = {
    universeName: "Majors & Volume",
    categoryFilter: "ALL",
    timeframe: "4H",
    totalCoins: 3,
    exportedAt: "2026-11-08 14:00:00 UTC",
  };

  it("generates RFC 4180 compliant CSV lines with correct headers", () => {
    const csv = generateRadarCsv(mockPois);
    const lines = csv.split("\r\n");

    expect(lines.length).toBe(4); // 1 header + 3 rows
    expect(lines[0]).toContain("Symbol,Asset Name,Mark Price (USDT),24h Change %");
    expect(lines[0]).toContain("Zone Entry Price,50% Midpoint (MT/CE)");
    expect(lines[0]).toContain("BTC Correlation (rho),Sector,Cluster Risk %");

    // BTC Row
    expect(lines[1]).toContain("BTCUSDT,Bitcoin,76540.2500,3.45");
    expect(lines[1]).toContain("Testing In-Zone");
    expect(lines[1]).toContain("YES (++ Confluence)");

    // ETH Row
    expect(lines[2]).toContain("ETHUSDT,Ethereum,2980.1000,-1.20");
    expect(lines[2]).toContain("Fair Value Gap");
    expect(lines[2]).toContain("Fresh");

    // SOL Row (no POI)
    expect(lines[3]).toContain("SOLUSDT,Solana,198.5000,5.12");
    expect(lines[3]).toContain("None");
  });

  it("generates valid parseable JSON with metadata and structured items", () => {
    const jsonStr = generateRadarJson(mockPois, mockMeta);
    const parsed = JSON.parse(jsonStr);

    expect(parsed.radar).toBe("Mochex POI Radar");
    expect(parsed.universe).toBe("Majors & Volume");
    expect(parsed.timeframe).toBe("4H");
    expect(parsed.scannedItemsCount).toBe(3);
    expect(parsed.items).toHaveLength(3);

    expect(parsed.items[0].symbol).toBe("BTCUSDT");
    expect(parsed.items[0].poi.category).toBe("order_block");
    expect(parsed.items[0].poi.isInsideZone).toBe(true);
    expect(parsed.items[0].poi.correlation.sector).toBe("majors_l1");

    expect(parsed.items[2].symbol).toBe("SOLUSDT");
    expect(parsed.items[2].poi).toBeNull();
  });

  it("generates a clean markdown table for clipboard copy", () => {
    const md = generateRadarClipboardMarkdown(mockPois, mockMeta);

    expect(md).toContain("### 📡 Mochex Institutional POI Radar Report");
    expect(md).toContain("**Universe:** Majors & Volume");
    expect(md).toContain("**Total Scanned:** 3 pairs");
    expect(md).toContain("🚨 IN-ZONE");
    expect(md).toContain("**BTCUSDT**");
    expect(md).toContain("**ETHUSDT**");
    expect(md).toContain("*No Active POI*");
  });
});
