"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Bell,
  Check,
  Loader2,
  Sparkles,
  Send,
  Star,
  Volume2,
  Play,
  Upload,
  Music,
  Trash2,
  FileAudio,
  Zap,
} from "lucide-react";
import {
  RadarPoiItem,
  getRadarPoiAlarmTargetPrice,
} from "@/lib/indicators/radar-poi-engine";
import { OrderBlockTouchLevel } from "@/lib/indicators/validated-ob-engine";
import { DiscordIcon, TelegramIcon } from "@/components/terminal/AlertChannelsModal";
import { PriceAlert } from "@/lib/alerts/alerts-engine";
import {
  RadarChimeType,
  RADAR_CHIME_PRESETS,
  playRadarChime,
  getRadarAudioSettings,
} from "@/lib/audio/sound-effects";
import {
  CustomSoundAsset,
  getStoredCustomSounds,
  saveCustomSound,
  deleteCustomSound,
  validateAudioFile,
  convertAudioBlobToBase64,
} from "@/lib/audio/custom-audio-store";

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
  const [notifyTradingWebhook, setNotifyTradingWebhook] = useState(true);
  const [notifyOnInvalidation, setNotifyOnInvalidation] = useState(true);

  // Audio chime selection & custom sounds (DEC-147)
  const [audioTab, setAudioTab] = useState<"presets" | "custom">("presets");
  const [customSounds, setCustomSounds] = useState<CustomSoundAsset[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [alarmChime, setAlarmChime] = useState<RadarChimeType>(
    () => getRadarAudioSettings().soundType
  );

  useEffect(() => {
    getStoredCustomSounds().then((sounds) => {
      setCustomSounds(sounds);
      const current = getRadarAudioSettings();
      if (current.soundType.startsWith("custom:")) {
        setAudioTab("custom");
      }
    });
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    const validation = validateAudioFile(file);
    if (!validation.valid) {
      setUploadError(validation.error || "Invalid file format or size");
      return;
    }

    setIsUploading(true);
    try {
      const base64 = await convertAudioBlobToBase64(file);
      const asset: CustomSoundAsset = {
        id: `custom-sound-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        dataUrl: base64,
        fileType: file.type || "audio/mpeg",
        fileSize: file.size,
        createdAt: Date.now(),
      };

      await saveCustomSound(asset);

      // Cloud backup to .data/custom-sounds.json
      fetch("/api/audio/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(asset),
      }).catch(() => {});

      setCustomSounds((prev) => [asset, ...prev.filter((s) => s.id !== asset.id)]);
      const chimeId = `custom:${asset.id}`;
      setAlarmChime(chimeId);
      playRadarChime({
        soundType: chimeId,
        customSoundDataUrl: base64,
        volume: 0.8,
        enabled: true,
      });
    } catch (err: any) {
      setUploadError(err?.message || "Failed to process audio file");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDeleteCustomSound = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteCustomSound(id);
    fetch(`/api/audio/custom?id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    }).catch(() => {});

    setCustomSounds((prev) => prev.filter((s) => s.id !== id));
    if (alarmChime === `custom:${id}`) {
      setAlarmChime("radar_ping");
    }
  };

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
          notifyTradingWebhook,
          notifyOnInvalidation,
          invalidationPrice: targetPoi.invalidationPrice ?? targetPoi.fullRetestPrice,
          poiMetadata: {
            poiId: targetPoi.id,
            category: targetPoi.category,
            direction: targetPoi.type,
            timeframe: tf,
            zoneTop: targetPoi.top,
            zoneBottom: targetPoi.bottom,
            invalidationPrice: targetPoi.invalidationPrice ?? targetPoi.fullRetestPrice,
          },
          soundType: alarmChime,
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
                {poi.category === "sandwich_zone"
                  ? "Sandwich Zone Range"
                  : poi.category === "fvg"
                  ? "Fair Value Gap (FVG)"
                  : "Order Block Zone"}
              </span>
              <div className="flex items-center gap-1">
                {poi.isPlus && (
                  <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-yellow-500/20 text-yellow-400 border border-yellow-500/40 flex items-center gap-0.5">
                    <Star size={9} className="fill-yellow-400" />
                    <span>++ CONFLUENCE</span>
                  </span>
                )}
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase border ${
                    poi.exchange === "binance"
                      ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                      : poi.exchange === "bybit"
                      ? "bg-orange-500/10 text-orange-400 border-orange-500/30"
                      : "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                  }`}
                >
                  {poi.exchangeLabel || (poi.exchange ? poi.exchange.toUpperCase() : "MEXC")}
                </span>
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
                <div className="text-[9px] text-[#2962ff] font-semibold">
                  {poi.category === "fvg" ? "50% CE" : "50% MT"}
                </div>
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
                    {poi.category === "fvg"
                      ? "50% Consequent Encroachment (CE) • Recommended"
                      : "50% Mean Threshold (Equilibrium) • Recommended"}
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
            <div className="flex flex-wrap items-center gap-3">
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

              <label className="flex items-center gap-2 text-xs text-white cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyTradingWebhook}
                  onChange={(e) => setNotifyTradingWebhook(e.target.checked)}
                  className="accent-[#00c087] rounded cursor-pointer"
                />
                <span className="flex items-center gap-1 text-[#00c087] font-semibold">
                  <Zap size={13} className="fill-current text-[#00c087]" /> Trading Bot (3Commas / Cornix)
                </span>
              </label>

              <label className="flex items-center gap-2 text-xs text-white cursor-pointer w-full mt-1 pt-1.5 border-t border-[#1f2c3f]/60">
                <input
                  type="checkbox"
                  checked={notifyOnInvalidation}
                  onChange={(e) => setNotifyOnInvalidation(e.target.checked)}
                  className="accent-[#ef4444] rounded cursor-pointer"
                />
                <span className="flex items-center gap-1 text-red-400 font-semibold">
                  <span>🚨</span> Notify on Invalidation / Stop-Out Break
                </span>
                <span className="text-[10px] text-[#848e9c] ml-auto">
                  Breach Stop (${(poi.invalidationPrice ?? poi.fullRetestPrice).toFixed(2)})
                </span>
              </label>
            </div>
          </div>

          {/* 4. Trigger Audio Chime (DEC-140, DEC-147) */}
          <div className="flex flex-col gap-2 pt-2 border-t border-[#1f2c3f]">
            <div className="flex items-center justify-between text-[11px] text-[#b6c4ff] font-semibold">
              <span className="flex items-center gap-1.5">
                <Volume2 size={13} className="text-[#2962ff]" />
                <span>Trigger Audio Chime</span>
              </span>

              {/* Audio category tabs */}
              <div className="flex items-center bg-[#090d14] p-0.5 rounded-lg border border-[#1f2c3f] text-[10px]">
                <button
                  type="button"
                  onClick={() => setAudioTab("presets")}
                  className={`px-2 py-0.5 rounded font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                    audioTab === "presets"
                      ? "bg-[#2962ff] text-white"
                      : "text-[#848e9c] hover:text-white"
                  }`}
                >
                  <Music size={10} />
                  <span>Presets ({RADAR_CHIME_PRESETS.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setAudioTab("custom")}
                  className={`px-2 py-0.5 rounded font-medium transition-colors cursor-pointer flex items-center gap-1 ${
                    audioTab === "custom"
                      ? "bg-[#2962ff] text-white"
                      : "text-[#848e9c] hover:text-white"
                  }`}
                >
                  <FileAudio size={10} />
                  <span>Custom ({customSounds.length})</span>
                </button>
              </div>
            </div>

            {audioTab === "presets" ? (
              <div className="grid grid-cols-2 gap-1.5">
                {RADAR_CHIME_PRESETS.map((p) => {
                  const isSel = alarmChime === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setAlarmChime(p.id);
                        playRadarChime({ soundType: p.id, volume: 0.8, enabled: true });
                      }}
                      className={`px-2.5 py-1.5 rounded-lg border text-left text-[10px] font-semibold transition-colors flex items-center justify-between cursor-pointer ${
                        isSel
                          ? "bg-[#2962ff]/20 text-[#2962ff] border-[#2962ff]"
                          : "bg-[#0e141f] text-[#848e9c] border-[#1f2c3f] hover:text-white"
                      }`}
                    >
                      <span className="truncate">{p.label}</span>
                      {isSel && <Check size={11} className="shrink-0 ml-1 text-[#2962ff]" />}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                {/* Upload Input */}
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  accept=".wav,.mp3,.ogg,.m4a,audio/*"
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="w-full py-2 px-3 rounded-lg border border-dashed border-[#2962ff]/50 bg-[#2962ff]/10 hover:bg-[#2962ff]/20 text-[#2962ff] hover:text-[#7096ff] text-[11px] font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  {isUploading ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Processing Audio Asset...</span>
                    </>
                  ) : (
                    <>
                      <Upload size={13} />
                      <span>Upload Custom Sound (.wav, .mp3 - Max 2.5MB)</span>
                    </>
                  )}
                </button>

                {uploadError && (
                  <div className="p-1.5 rounded bg-[#ff3b30]/15 border border-[#ff3b30]/40 text-[#ff3b30] text-[10px]">
                    {uploadError}
                  </div>
                )}

                {/* Custom sounds list */}
                {customSounds.length === 0 ? (
                  <div className="py-2.5 px-3 rounded-lg bg-[#0e141f] border border-[#1f2c3f] text-center text-[10px] text-[#848e9c]">
                    No custom sounds uploaded yet. Upload a .wav or .mp3 audio file above.
                  </div>
                ) : (
                  <div className="flex flex-col gap-1 max-h-[120px] overflow-y-auto pr-1">
                    {customSounds.map((s) => {
                      const isSel = alarmChime === `custom:${s.id}`;
                      const sizeKb = Math.round(s.fileSize / 1024);
                      return (
                        <div
                          key={s.id}
                          onClick={() => {
                            setAlarmChime(`custom:${s.id}`);
                            playRadarChime({
                              soundType: `custom:${s.id}`,
                              customSoundDataUrl: s.dataUrl,
                              volume: 0.8,
                              enabled: true,
                            });
                          }}
                          className={`px-2 py-1.5 rounded-lg border text-[10px] font-medium flex items-center justify-between cursor-pointer transition-colors ${
                            isSel
                              ? "bg-[#2962ff]/20 border-[#2962ff] text-white"
                              : "bg-[#0e141f] border-[#1f2c3f] text-[#848e9c] hover:text-white"
                          }`}
                        >
                          <div className="flex items-center gap-2 truncate pr-2">
                            <FileAudio size={12} className={isSel ? "text-[#2962ff]" : "text-[#848e9c]"} />
                            <span className="truncate max-w-[170px]" title={s.name}>
                              {s.name}
                            </span>
                            <span className="text-[9px] text-[#55657e]">({sizeKb} KB)</span>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                playRadarChime({
                                  soundType: `custom:${s.id}`,
                                  customSoundDataUrl: s.dataUrl,
                                  volume: 0.8,
                                  enabled: true,
                                });
                              }}
                              className="p-1 rounded hover:bg-[#233144] text-[#2962ff] cursor-pointer"
                              title="Preview sound"
                            >
                              <Play size={10} className="fill-current" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteCustomSound(s.id, e)}
                              className="p-1 rounded hover:bg-[#ff3b30]/20 text-[#848e9c] hover:text-[#ff3b30] cursor-pointer"
                              title="Delete sound"
                            >
                              <Trash2 size={10} />
                            </button>
                            {isSel && <Check size={11} className="text-[#2962ff]" />}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
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
