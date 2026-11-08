"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Volume2,
  VolumeX,
  Volume1,
  Play,
  Check,
  Sparkles,
  Sliders,
  Radio,
} from "lucide-react";
import {
  RadarAudioSettings,
  RadarChimeType,
  RADAR_CHIME_PRESETS,
  getRadarAudioSettings,
  saveRadarAudioSettings,
  playRadarChime,
} from "@/lib/audio/sound-effects";

interface RadarAudioSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RadarAudioSettingsModal({
  isOpen,
  onClose,
}: RadarAudioSettingsModalProps) {
  const [settings, setSettings] = useState<RadarAudioSettings>(getRadarAudioSettings());

  useEffect(() => {
    if (isOpen) {
      setSettings(getRadarAudioSettings());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleUpdate = (partial: Partial<RadarAudioSettings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    saveRadarAudioSettings(next);
  };

  const handlePreview = (soundType?: RadarChimeType) => {
    playRadarChime({
      soundType: soundType || settings.soundType,
      volume: settings.volume,
      enabled: true,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs select-none">
      <div className="bg-[#121824] border border-[#233144] w-[480px] max-w-[95vw] rounded-xl shadow-2xl flex flex-col overflow-hidden text-xs font-mono animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#1f293d] bg-[#0c1017]">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-lg bg-[#2962ff]/15 text-[#2962ff] border border-[#2962ff]/30">
              <Volume2 size={16} />
            </div>
            <div>
              <div className="font-bold text-white text-sm flex items-center gap-2">
                <span>Radar Audio Chimes</span>
                <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-[#00c087]/15 text-[#00c087] border border-[#00c087]/30">
                  WEB AUDIO SYNTH
                </span>
              </div>
              <div className="text-[10px] text-[#848e9c]">
                Zero-latency procedural sound effects for POI zone breaches
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#848e9c] hover:text-white p-1 rounded hover:bg-[#1a2332] cursor-pointer transition-colors"
          >
            <X size={15} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 flex flex-col gap-4 max-h-[75vh] overflow-y-auto">
          {/* Master Enable & Volume Controls */}
          <div className="p-3 rounded-lg bg-[#0e141f] border border-[#1f2c3f] flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleUpdate({ enabled: !settings.enabled })}
                  className={`p-1.5 rounded-lg border cursor-pointer transition-colors ${
                    settings.enabled
                      ? "bg-[#00c087]/15 text-[#00c087] border-[#00c087]/40"
                      : "bg-[#ff3b30]/15 text-[#ff3b30] border-[#ff3b30]/40"
                  }`}
                >
                  {settings.enabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
                </button>
                <div>
                  <div className="font-bold text-white text-xs">
                    {settings.enabled ? "Audio Chimes Enabled" : "Audio Chimes Muted"}
                  </div>
                  <div className="text-[10px] text-[#848e9c]">
                    Play alerts on POI zone entries and triggers
                  </div>
                </div>
              </div>

              {/* Master Toggle Switch */}
              <button
                type="button"
                onClick={() => handleUpdate({ enabled: !settings.enabled })}
                className={`w-11 h-6 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                  settings.enabled ? "bg-[#2962ff]" : "bg-[#233144]"
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    settings.enabled ? "translate-x-5" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Volume Slider */}
            <div className="flex flex-col gap-1.5 pt-2 border-t border-[#172233]">
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-[#848e9c] flex items-center gap-1.5">
                  <Sliders size={12} />
                  <span>Master Chime Volume</span>
                </span>
                <span className="font-bold text-white">{Math.round(settings.volume * 100)}%</span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={Math.round(settings.volume * 100)}
                onChange={(e) => handleUpdate({ volume: parseInt(e.target.value, 10) / 100 })}
                disabled={!settings.enabled}
                className="w-full accent-[#2962ff] bg-[#1a2332] rounded-lg h-1.5 cursor-pointer disabled:opacity-40"
              />
            </div>
          </div>

          {/* Sound Presets List */}
          <div className="flex flex-col gap-2">
            <label className="text-[11px] text-[#b6c4ff] font-semibold flex items-center justify-between">
              <span>Chime Preset Selection</span>
              <span className="text-[9px] text-[#848e9c]">Click ▶ to preview sound</span>
            </label>

            <div className="flex flex-col gap-1.5">
              {RADAR_CHIME_PRESETS.map((preset) => {
                const isSelected = settings.soundType === preset.id;
                return (
                  <div
                    key={preset.id}
                    onClick={() => handleUpdate({ soundType: preset.id })}
                    className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-[#2962ff]/10 border-[#2962ff] text-white"
                        : "bg-[#0e141f] border-[#1f2c3f] text-[#848e9c] hover:text-white"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className="mt-0.5">
                        <div
                          className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                            isSelected
                              ? "border-[#2962ff] bg-[#2962ff] text-white"
                              : "border-[#405068] bg-transparent"
                          }`}
                        >
                          {isSelected && <Check size={10} />}
                        </div>
                      </div>
                      <div>
                        <div
                          className={`font-semibold text-xs ${
                            isSelected ? "text-[#2962ff]" : "text-white"
                          }`}
                        >
                          {preset.label}
                        </div>
                        <div className="text-[10px] text-[#848e9c] mt-0.5">
                          {preset.description}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePreview(preset.id);
                      }}
                      className="px-2.5 py-1 rounded bg-[#1a2332] hover:bg-[#233144] border border-[#2b3a4f] text-[#b6c4ff] hover:text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer transition-colors shrink-0 ml-2"
                      title="Play Preview"
                    >
                      <Play size={10} className="fill-current" />
                      <span>Play</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Behavior Options */}
          <div className="p-3 rounded-lg bg-[#0e141f] border border-[#1f2c3f] flex flex-col gap-2">
            <label className="flex items-start gap-2 text-xs text-white cursor-pointer">
              <input
                type="checkbox"
                checked={settings.chimeOnZoneEntry}
                onChange={(e) => handleUpdate({ chimeOnZoneEntry: e.target.checked })}
                disabled={!settings.enabled}
                className="mt-0.5 accent-[#2962ff] rounded cursor-pointer disabled:opacity-50"
              />
              <div>
                <div className="font-semibold text-xs">Live Zone Entry Chime</div>
                <div className="text-[10px] text-[#848e9c]">
                  Automatically synthesize sound effect when a monitored pair enters an active POI zone during live WebSocket market data streaming.
                </div>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#1f293d] bg-[#0c1017]">
          <button
            type="button"
            onClick={() => handlePreview()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded border border-[#233144] bg-[#121824] hover:bg-[#1a2332] text-xs text-[#b6c4ff] hover:text-white transition-colors cursor-pointer"
          >
            <Play size={11} className="fill-current" />
            <span>Test Active Sound</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded bg-[#2962ff] hover:bg-[#1e50db] text-white font-bold text-xs transition-all shadow-md shadow-[#2962ff]/30 cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
