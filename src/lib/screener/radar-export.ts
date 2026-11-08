/**
 * Institutional Radar Export Engine
 *
 * Supports 1-Click Export to CSV, formatted JSON, and Markdown Clipboard.
 */

import { RadarPoiItem } from "@/lib/indicators/radar-poi-engine";

export interface ExportableRadarItem {
  symbol: string;
  name?: string;
  price: number;
  change24h: number;
  volume24h?: number;
  selectedPoi: RadarPoiItem | null;
  exchange?: string;
  exchangeLabel?: string;
}

export interface RadarExportMeta {
  universeName: string;
  categoryFilter: string;
  timeframe: string;
  totalCoins: number;
  exportedAt?: string;
}

/**
 * Escapes a cell value conforming to RFC 4180 CSV standard.
 */
function escapeCsvCell(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates an RFC 4180 compliant CSV string from radar items.
 */
export function generateRadarCsv(items: ExportableRadarItem[]): string {
  const headers = [
    "Exchange",
    "Symbol",
    "Asset Name",
    "Mark Price (USDT)",
    "24h Change %",
    "24h Volume (USDT)",
    "POI Label",
    "Category",
    "Direction",
    "Timeframe",
    "Confluence",
    "Status",
    "Zone Entry Price",
    "50% Midpoint (MT/CE)",
    "Opposite Boundary",
    "Zone Top",
    "Zone Bottom",
    "Proximity %",
    "Reaction Win-Rate %",
    "Reaction Samples",
  ];

  const lines: string[] = [headers.map(escapeCsvCell).join(",")];

  for (const item of items) {
    const poi = item.selectedPoi;
    const categoryLabel = poi
      ? poi.category === "sandwich_zone"
        ? "Sandwich Zone"
        : poi.category === "fvg"
        ? "Fair Value Gap"
        : "Order Block"
      : "None";

    const statusLabel = poi
      ? poi.status === "testing" || poi.isInsideZone
        ? "Testing In-Zone"
        : poi.status === "mitigated"
        ? "Mitigated"
        : poi.status === "broken"
        ? "Broken"
        : "Fresh"
      : "N/A";

    const exchangeLabel =
      poi?.exchangeLabel ||
      item.exchangeLabel ||
      (poi?.exchange ? poi.exchange.toUpperCase() : item.exchange ? item.exchange.toUpperCase() : "MEXC Spot");

    const row = [
      exchangeLabel,
      item.symbol,
      item.name || item.symbol.replace("USDT", ""),
      item.price.toFixed(item.price >= 1 ? 4 : 8),
      item.change24h.toFixed(2),
      item.volume24h ? item.volume24h.toFixed(0) : "0",
      poi ? poi.label : "None",
      categoryLabel,
      poi ? poi.type : "N/A",
      poi ? poi.timeframe : "N/A",
      poi?.isPlus ? "YES (++ Confluence)" : "Standard",
      statusLabel,
      poi ? poi.entryPrice.toFixed(poi.entryPrice >= 1 ? 4 : 8) : "",
      poi ? poi.meanThreshold.toFixed(poi.meanThreshold >= 1 ? 4 : 8) : "",
      poi ? poi.fullRetestPrice.toFixed(poi.fullRetestPrice >= 1 ? 4 : 8) : "",
      poi ? poi.top.toFixed(poi.top >= 1 ? 4 : 8) : "",
      poi ? poi.bottom.toFixed(poi.bottom >= 1 ? 4 : 8) : "",
      poi ? poi.distanceToEntryPct.toFixed(2) : "",
      poi?.metrics ? `${poi.metrics.winRatePct}%` : "N/A",
      poi?.metrics ? poi.metrics.sampleDescription : "N/A",
    ];

    lines.push(row.map(escapeCsvCell).join(","));
  }

  return lines.join("\r\n");
}

/**
 * Triggers client-side CSV download.
 */
export function downloadRadarCsv(items: ExportableRadarItem[], baseName = "mochex-poi-radar"): void {
  if (typeof window === "undefined") return;

  const csvContent = generateRadarCsv(items);
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  link.setAttribute("href", url);
  link.setAttribute("download", `${baseName}-${timestamp}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Generates structured JSON export string.
 */
export function generateRadarJson(
  items: ExportableRadarItem[],
  meta: RadarExportMeta
): string {
  const payload = {
    radar: "Mochex POI Radar",
    version: "2.0",
    exportedAt: meta.exportedAt || new Date().toISOString(),
    universe: meta.universeName,
    timeframe: meta.timeframe,
    categoryFilter: meta.categoryFilter,
    totalCoinsCount: meta.totalCoins,
    scannedItemsCount: items.length,
    items: items.map((i) => ({
      symbol: i.symbol,
      name: i.name,
      exchange: i.selectedPoi?.exchange || i.exchange || "mexc",
      exchangeLabel: i.selectedPoi?.exchangeLabel || i.exchangeLabel || "MEXC Spot",
      markPrice: i.price,
      change24hPct: i.change24h,
      volume24h: i.volume24h,
      poi: i.selectedPoi
        ? {
            id: i.selectedPoi.id,
            exchange: i.selectedPoi.exchange,
            exchangeLabel: i.selectedPoi.exchangeLabel,
            category: i.selectedPoi.category,
            type: i.selectedPoi.type,
            timeframe: i.selectedPoi.timeframe,
            label: i.selectedPoi.label,
            isPlusConfluence: Boolean(i.selectedPoi.isPlus),
            entryPrice: i.selectedPoi.entryPrice,
            meanThreshold: i.selectedPoi.meanThreshold,
            fullRetestPrice: i.selectedPoi.fullRetestPrice,
            top: i.selectedPoi.top,
            bottom: i.selectedPoi.bottom,
            status: i.selectedPoi.status,
            isInsideZone: i.selectedPoi.isInsideZone,
            distanceToEntryPct: i.selectedPoi.distanceToEntryPct,
            distanceToMtPct: i.selectedPoi.distanceToMtPct,
            metrics: i.selectedPoi.metrics || null,
          }
        : null,
    })),
  };

  return JSON.stringify(payload, null, 2);
}

/**
 * Triggers client-side JSON download.
 */
export function downloadRadarJson(
  items: ExportableRadarItem[],
  meta: RadarExportMeta,
  baseName = "mochex-poi-radar"
): void {
  if (typeof window === "undefined") return;

  const jsonContent = generateRadarJson(items, meta);
  const blob = new Blob([jsonContent], { type: "application/json;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  link.setAttribute("href", url);
  link.setAttribute("download", `${baseName}-${timestamp}.json`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Formats a clean Markdown table with summary header suitable for Discord, Telegram, or Obsidian.
 */
export function generateRadarClipboardMarkdown(
  items: ExportableRadarItem[],
  meta: RadarExportMeta
): string {
  const timestamp = meta.exportedAt || new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
  const itemsWithPois = items.filter((i) => i.selectedPoi !== null);
  const inZoneCount = items.filter(
    (i) => i.selectedPoi && (i.selectedPoi.isInsideZone || i.selectedPoi.status === "testing")
  ).length;

  let md = `### 📡 Mochex Institutional POI Radar Report\n`;
  md += `**Universe:** ${meta.universeName} | **Timeframe:** ${meta.timeframe} | **Filter:** ${meta.categoryFilter}\n`;
  md += `**Total Scanned:** ${items.length} pairs | **Active POIs:** ${itemsWithPois.length} | **🚨 In-Zone:** ${inZoneCount}\n`;
  md += `*Generated: ${timestamp}*\n\n`;

  md += `| Exchange | Ticker | Price | 24h % | POI Type | TF | Win Rate | Status | Proximity | Entry | 50% MT/CE |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;

  for (const item of items) {
    const p = item.price;
    const priceFormatted = `$${p >= 1 ? p.toFixed(2) : p.toFixed(4)}`;
    const chg = `${item.change24h >= 0 ? "+" : ""}${item.change24h.toFixed(2)}%`;
    const poi = item.selectedPoi;
    const exBadge = poi?.exchange ? poi.exchange.toUpperCase() : item.exchange ? item.exchange.toUpperCase() : "MEXC";

    if (!poi) {
      md += `| ${exBadge} | ${item.symbol} | ${priceFormatted} | ${chg} | *No Active POI* | - | - | - | - | - | - |\n`;
      continue;
    }

    const typeEmoji = poi.type === "BULLISH" ? "🟢" : "🔴";
    const plusTag = poi.isPlus ? " ⭐++" : "";
    const poiLabel = `${typeEmoji} ${poi.label}${plusTag}`;
    const statusTag = poi.isInsideZone || poi.status === "testing" ? "🚨 IN-ZONE" : poi.status.toUpperCase();
    const proxTag = poi.isInsideZone ? "0.00%" : `${poi.distanceToEntryPct.toFixed(2)}%`;
    const entryFormatted = `$${poi.entryPrice >= 1 ? poi.entryPrice.toFixed(2) : poi.entryPrice.toFixed(4)}`;
    const mtFormatted = `$${poi.meanThreshold >= 1 ? poi.meanThreshold.toFixed(2) : poi.meanThreshold.toFixed(4)}`;
    const winRateText = poi.metrics ? `${poi.metrics.winRatePct}% (${poi.metrics.wins}/${poi.metrics.totalTested})` : "N/A";

    md += `| **${exBadge}** | **${item.symbol}** | ${priceFormatted} | ${chg} | ${poiLabel} | ${poi.timeframe} | ${winRateText} | ${statusTag} | ${proxTag} | ${entryFormatted} | ${mtFormatted} |\n`;
  }

  return md;
}

/**
 * Copies the Markdown formatted report to user clipboard.
 */
export async function copyRadarToClipboard(
  items: ExportableRadarItem[],
  meta: RadarExportMeta
): Promise<boolean> {
  if (typeof window === "undefined" || !navigator.clipboard) return false;

  try {
    const text = generateRadarClipboardMarkdown(items, meta);
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
