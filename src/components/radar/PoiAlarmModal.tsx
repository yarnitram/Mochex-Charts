"use client";

import React, { useState } from "react";
import { X, Bell, Check, Loader2, Sparkles, Send, Star } from "lucide-react";
import {
  RadarPoiItem,
  getRadarPoiAlarmTargetPrice,
} from "@/lib/indicators/radar-poi-engine";
import { OrderBlockTouchLevel } from "@/lib/indicators/validated-ob-engine";
import { DiscordIcon, TelegramIcon } from "@/components/terminal/AlertChannelsModal";
import { PriceAlert } from "@/lib/alerts/alerts-engine";

interface PoiAlarmModalProps {
  isOpen: boolean;
  onClose: () => void;
  symbol: string;
  poi: RadarPoiItem;
  availablePoisByTimeframe?: Record<string, RadarPoiItem[]>;
  onSuccess?: (createdAlertsCount: number) => void;
}

export function PoiAlarmModal({
  isOpen,
  onClose,
  symbol,
  poi,
  availablePoisByTimeframe = {},
  onSuccess,
}: PoiAlarmModalProps) {
  // Multi-select timeframes
  const [selectedTimeframes, setSelectedTimeframes] = useState<string[]>([
    poi.timeframe || "4H",
  ]);

  // Touch Level choice: "entry" | "fifty_pct" | "full"
  const [touchLevel, setTouchLevel] = useState<OrderBlockTouchLevel>("fifty_pct");

  // Notification delivery preferences
  const [notifyDiscord, setNotifyDiscord] = useState(true);
  const [notifyTelegram, setNotifyTelegram] = useState(true);

  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const toggleTimeframe = (tf: string) => {
    setSelectedTimeframes((prev) =>
      prev.includes(tf) ? (prev.length > 1 ? prev.filter((t) => t !== tf) : prev) : [...prev, tf]
    );
  };

  const handleCreateAlarms = async () => {
    setSaving(true);
    setStatusMessage(null);

    let createdCount = 0;
    const now = Date.now();

    try {
      for (const tf of selectedTimeframes) {
        // Find matching POI for this timeframe, or fallback to the current poi
        const tfPois = availablePoisByTimeframe[tf] || [];
        const targetPoi =
          tfPois.find((p) => p.category === poi.category && p.type === poi.type) ||
          (tf === poi.timeframe ? poi : null);

        if (!targetPoi) continue;

        const targetPrice = getRadarPoiAlarmTargetPrice(targetPoi, touchLevel);
        const touchLabel =
          touchLevel === "entry"
            ? "Zone Entry"
            : touchLevel === "fifty_pct"
            ? "50% Mean Threshold"
            : "Full Retest";

        const indicatorName =
          targetPoi.category === "sandwich_zone"
            ? "Sandwich Zones ++ (Supply & Demand)"
            : "Validated Order Block (OB + FVG)";

        const alert: PriceAlert = {
          id: `alert-poi-${symbol}-${tf}-${targetPoi.category}-${touchLevel}-${now}`,
          symbol: symbol.toUpperCase(),
          targetPrice,
          condition: targetPoi.type === "BULLISH" ? "crossing_down" : "crossing_up",
          frequency: "only_once",
          sourceType: "indicator_condition",
          indicatorName,
          label: `${symbol.replace("USDT", "")} ${tf} ${targetPoi.label} (${touchLabel})`,
          conditionMessage: `Price touched ${touchLabel} of ${tf} ${targetPoi.label} @ $${targetPrice >= 1 ? targetPrice.toFixed(2) : targetPrice.toFixed(4)}`,
          active: true,
          triggeredCount: 0,
          createdAt: now,
          notifyDiscord,
          notifyTelegram,
        };

        // 1. Post to Server API (DEC-135) for 24/7 offline cloud listening
        const res = await fetch("/api/alerts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(alert),
        });

        if (res.ok) {
          createdCount++;
        }

        // 2. Local storage cache sync
        try {
          const raw = localStorage.getItem("mochex:price_alerts");
          const existing = raw ? JSON.parse(raw) : [];
          localStorage.setItem("mochex:price_alerts", JSON.stringify([alert, ...existing]));
          window.dispatchEvent(new CustomEvent("mochex:alerts-updated"));
        } catch {}
      }

      setStatusMessage(`Successfully set ${createdCount} 24/7 Cloud POI Alarm(s)!`);
      if (onSuccess) {
        onSuccess(createdCount);
      }
      setTimeout(() => {
        onClose();
      }, 900);
    } catch (err: any) {
      setStatusMessage(err?.message || "Failed to set alarm");
    } finally {
      setSaving(false);
    }
  };

  const previewTargetPrice = getRadarPoiAlarmTargetPrice(poi, touchLevel);
  const formattedPreview =
    previewTargetPrice >= 1
      ? previewTargetPrice.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
      : previewTargetPrice.toFixed(4);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs select-none">
      <div className="bg-[#121824] border border-[#233144] w-[460px] max-w-[95vw] rounded-xl shadow-2xl flex flex-col overflow-hidden text-xs font-mono animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1f293d] bg-[#0c1017]">
          <div className="flex items-center gap-2">
            <div className="p-1 rounded bg-[#2962ff]/15 text-[#2962ff]">
              <Bell size={15} />
            </div>
            <div>
              <div className="font-bold text-white text-sm">
                Set 24/7 POI Alarm: {symbol.replace("USDT", "/USDT")}
              </div>
              <div className="text-[10px] text-[#848e9c] flex items-center gap-1">
                <span>{poi.label}</span>
                {poi.isPlus && <Star size={10} className="text-yellow-400 fill-yellow-400" />}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#848e9c] hover:text-white p-1 rounded hover:bg-[#1a2332] cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 flex flex-col gap-4 max-h-[80vh] overflow-y-auto">
          {/* Active POI Details Card */}
          <div className="p-3 rounded-lg bg-[#0e141f] border border-[#1f2c3f] flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-[#848e9c] uppercase font-bold tracking-wider">
                {poi.category === "sandwich_zone" ? "Sandwich Zone Range" : "Order Block Zone"}
              </span>
              <div className="flex items-center gap-1">
                {poi.isPlus && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 flex items-center gap-0.5">
                    <Star size={9} className="fill-yellow-400" />
                    <span>++ CONFLUENCE</span>
                  </span>
                )}
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                    poi.type === "BULLISH"
                      ? "bg-[#00c087]/15 text-[#00c087] border border-[#00c087]/30"
                      : "bg-[#ff3b30]/15 text-[#ff3b30] border border-[#ff3b30]/30"
                  }`}
                >
                  {poi.type === "BULLISH" ? "DEMAND" : "SUPPLY"}
                </span>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center pt-1 border-t border-[#172233]">
              <div>
                <div className="text-[9px] text-[#848e9c]">Zone Top</div>
                <div className="font-bold text-white text-[11px]">${poi.top.toFixed(2)}</div>
              </div>
              <div className="bg-[#151e2c] rounded py-0.5 border border-[#223044]">
                <div className="text-[9px] text-[#2962ff] font-semibold">50% MT</div>
                <div className="font-bold text-[#b6c4ff] text-[11px]">${poi.meanThreshold.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-[9px] text-[#848e9c]">Zone Bottom</div>
                <div className="font-bold text-white text-[11px]">${poi.bottom.toFixed(2)}</div>
              </div>
            </div>
          </div>

          {/* 1. Timeframe Selection (Multi-Select) */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-[#b6c4ff] font-semibold flex items-center justify-between">
              <span>Timeframe(s) to Monitor</span>
              <span className="text-[9px] text-[#848e9c]">Multi-select enabled</span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {["15m", "1H", "4H", "1D"].map((tf) => {
                const isSelected = selectedTimeframes.includes(tf);
                return (
                  <button
                    key={tf}
                    type="button"
                    onClick={() => toggleTimeframe(tf)}
                    className={`py-2 rounded-lg border font-bold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                      isSelected
                        ? "bg-[#2962ff]/20 text-[#2962ff] border-[#2962ff]"
                        : "bg-[#0e141f] text-[#848e9c] border-[#1f2c3f] hover:text-white"
                    }`}
                  >
                    {isSelected && <Check size={11} />}
                    <span>{tf}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Touch Level Options */}
          <div className="flex flex-col gap-1.5">
            <label className="text-[11px] text-[#b6c4ff] font-semibold">
              Trigger Touch Level
            </label>
            <div className="flex flex-col gap-1.5">
              <label
                onClick={() => setTouchLevel("entry")}
                className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                  touchLevel === "entry"
                    ? "bg-[#2962ff]/10 border-[#2962ff] text-white"
                    : "bg-[#0e141f] border-[#1f2c3f] text-[#848e9c] hover:text-white"
                }`}
              >
                <input
                  type="radio"
                  name="touchLevel"
                  checked={touchLevel === "entry"}
                  onChange={() => setTouchLevel("entry")}
                  className="mt-0.5 accent-[#2962ff]"
                />
                <div>
                  <div className="font-semibold text-xs">Zone Entry / Wick Touch</div>
                  <div className="text-[10px] text-[#848e9c]">
                    Alarms when price touches outer zone boundary (${poi.entryPrice.toFixed(2)})
                  </div>
                </div>
              </label>

              <label
                onClick={() => setTouchLevel("fifty_pct")}
                className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                  touchLevel === "fifty_pct"
                    ? "bg-[#2962ff]/10 border-[#2962ff] text-white"
                    : "bg-[#0e141f] border-[#1f2c3f] text-[#848e9c] hover:text-white"
                }`}
              >
                <input
                  type="radio"
                  name="touchLevel"
                  checked={touchLevel === "fifty_pct"}
                  onChange={() => setTouchLevel("fifty_pct")}
                  className="mt-0.5 accent-[#2962ff]"
                />
                <div>
                  <div className="font-semibold text-xs text-[#2962ff]">
                    50% Mean Threshold (Equilibrium) • Recommended
                  </div>
                  <div className="text-[10px] text-[#848e9c]">
                    Alarms when price hits exact institutional 50% midpoint (${poi.meanThreshold.toFixed(2)})
                  </div>
                </div>
              </label>

              <label
                onClick={() => setTouchLevel("full")}
                className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                  touchLevel === "full"
                    ? "bg-[#2962ff]/10 border-[#2962ff] text-white"
                    : "bg-[#0e141f] border-[#1f2c3f] text-[#848e9c] hover:text-white"
                }`}
              >
                <input
                  type="radio"
                  name="touchLevel"
                  checked={touchLevel === "full"}
                  onChange={() => setTouchLevel("full")}
                  className="mt-0.5 accent-[#2962ff]"
                />
                <div>
                  <div className="font-semibold text-xs">Full Zone Retest / Invalidation Level</div>
                  <div className="text-[10px] text-[#848e9c]">
                    Alarms on deep retest to opposite boundary (${poi.fullRetestPrice.toFixed(2)})
                  </div>
                </div>
              </label>
            </div>
          </div>

          {/* 3. Delivery Channels */}
          <div className="flex flex-col gap-1.5 pt-2 border-t border-[#1f2c3f]">
            <label className="text-[11px] text-[#b6c4ff] font-semibold flex items-center justify-between">
              <span>Notification Channels</span>
              <span className="text-[9px] text-[#00c087] font-bold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00c087] animate-pulse" />
                24/7 Cloud Offline Ready
              </span>
            </label>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyDiscord}
                  onChange={(e) => setNotifyDiscord(e.target.checked)}
                  className="accent-[#5865F2] rounded cursor-pointer"
                />
                <span className="flex items-center gap-1 text-[#5865F2] font-semibold">
                  <DiscordIcon size={14} /> Discord Webhook
                </span>
              </label>

              <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyTelegram}
                  onChange={(e) => setNotifyTelegram(e.target.checked)}
                  className="accent-[#229ED9] rounded cursor-pointer"
                />
                <span className="flex items-center gap-1 text-[#229ED9] font-semibold">
                  <TelegramIcon size={14} /> Telegram Bot
                </span>
              </label>
            </div>
          </div>

          {statusMessage && (
            <div className="p-2 rounded bg-[#2962ff]/15 border border-[#2962ff]/30 text-white text-xs text-center">
              {statusMessage}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#1f293d] bg-[#0c1017]">
          <div className="text-[11px] text-[#848e9c]">
            Target: <strong className="text-white">${formattedPreview}</strong>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-3 py-1.5 rounded border border-[#233144] text-[#848e9c] hover:text-white hover:bg-[#1a2332] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleCreateAlarms}
              disabled={saving}
              className="px-4 py-1.5 rounded bg-[#2962ff] hover:bg-[#1e50db] text-white font-bold flex items-center gap-1.5 transition-all shadow-md shadow-[#2962ff]/30 cursor-pointer disabled:opacity-50"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
              <span>Set 24/7 Alarm</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
