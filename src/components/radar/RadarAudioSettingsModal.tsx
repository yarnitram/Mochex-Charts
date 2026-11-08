"use client";

import React, { useState, useEffect, useRef } from "react";
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
  Upload,
  Trash2,
  FileAudio,
  Music,
  Loader2,
} from "lucide-react";
import {
  RadarAudioSettings,
  RadarChimeType,
  RADAR_CHIME_PRESETS,
  getRadarAudioSettings,
  saveRadarAudioSettings,
  playRadarChime,
} from "@/lib/audio/sound-effects";
import {
  CustomSoundAsset,
  getStoredCustomSounds,
  saveCustomSound,
  deleteCustomSound,
  validateAudioFile,
  convertAudioBlobToBase64,
} from "@/lib/audio/custom-audio-store";

interface RadarAudioSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function RadarAudioSettingsModal({
  isOpen,
  onClose,
}: RadarAudioSettingsModalProps) {
  const [settings, setSettings] = useState<RadarAudioSettings>(getRadarAudioSettings());
  const [activeTab, setActiveTab] = useState<"presets" | "custom">("presets");
  const [customSounds, setCustomSounds] = useState<CustomSoundAsset[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      const current = getRadarAudioSettings();
      setSettings(current);
      if (current.soundType.startsWith("custom:")) {
        setActiveTab("custom");
      }
      getStoredCustomSounds().then((sounds) => setCustomSounds(sounds));
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleUpdate = (partial: Partial<RadarAudioSettings>) => {
    const next = { ...settings, ...partial };
    setSettings(next);
    saveRadarAudioSettings(next);
  };

  const handlePreview = (soundType?: RadarChimeType, dataUrl?: string) => {
    playRadarChime({
      soundType: soundType || settings.soundType,
      volume: settings.volume,
      enabled: true,
      customSoundDataUrl: dataUrl || settings.customSoundDataUrl,
    });
  };

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

      // Cloud backup
      fetch("/api/audio/custom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(asset),
      }).catch(() => {});

      setCustomSounds((prev) => [asset, ...prev.filter((s) => s.id !== asset.id)]);
      const chimeId = `custom:${asset.id}`;
      handleUpdate({
        soundType: chimeId,
        customSoundId: asset.id,
        customSoundDataUrl: asset.dataUrl,
        customSoundName: asset.name,
      });

      playRadarChime({
        soundType: chimeId,
        customSoundDataUrl: asset.dataUrl,
        volume: settings.volume,
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
    if (settings.soundType === `custom:${id}`) {
      handleUpdate({
        soundType: "radar_ping",
        customSoundId: undefined,
        customSoundDataUrl: undefined,
        customSoundName: undefined,
      });
    }
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

          {/* Sound Presets & Custom Sounds (DEC-140, DEC-147) */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-[11px] text-[#b6c4ff] font-semibold">
              <span>Chime Audio Selection</span>
              <div className="flex items-center bg-[#090d14] p-0.5 rounded-lg border border-[#1f2c3f] text-[10px]">
                <button
                  type="button"
                  onClick={() => setActiveTab("presets")}
                  className={`px-2.5 py-0.5 rounded font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === "presets"
                      ? "bg-[#2962ff] text-white"
                      : "text-[#848e9c] hover:text-white"
                  }`}
                >
                  <Music size={11} />
                  <span>Presets ({RADAR_CHIME_PRESETS.length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("custom")}
                  className={`px-2.5 py-0.5 rounded font-medium transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === "custom"
                      ? "bg-[#2962ff] text-white"
                      : "text-[#848e9c] hover:text-white"
                  }`}
                >
                  <FileAudio size={11} />
                  <span>Custom ({customSounds.length})</span>
                </button>
              </div>
            </div>

            {activeTab === "presets" ? (
              <div className="flex flex-col gap-1.5">
                {RADAR_CHIME_PRESETS.map((preset) => {
                  const isSelected = settings.soundType === preset.id;
                  return (
                    <div
                      key={preset.id}
                      onClick={() =>
                        handleUpdate({
                          soundType: preset.id,
                          customSoundId: undefined,
                          customSoundDataUrl: undefined,
                          customSoundName: undefined,
                        })
                      }
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
            ) : (
              <div className="flex flex-col gap-2">
                {/* Upload Action */}
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
                  className="w-full py-2.5 px-3 rounded-lg border border-dashed border-[#2962ff]/50 bg-[#2962ff]/10 hover:bg-[#2962ff]/20 text-[#2962ff] hover:text-[#7096ff] text-xs font-semibold flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  {isUploading ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      <span>Processing & Persisting Audio Asset...</span>
                    </>
                  ) : (
                    <>
                      <Upload size={14} />
                      <span>Upload Custom Sound (.wav, .mp3 - Max 2.5MB)</span>
                    </>
                  )}
                </button>

                {uploadError && (
                  <div className="p-2 rounded bg-[#ff3b30]/15 border border-[#ff3b30]/40 text-[#ff3b30] text-xs">
                    {uploadError}
                  </div>
                )}

                {/* Custom Sounds Library */}
                {customSounds.length === 0 ? (
                  <div className="py-6 px-4 rounded-lg bg-[#0e141f] border border-[#1f2c3f] text-center text-xs text-[#848e9c] flex flex-col items-center gap-2">
                    <FileAudio size={24} className="text-[#405068]" />
                    <span>No custom sounds uploaded yet.</span>
                    <span className="text-[10px] text-[#55657e]">
                      Upload your favorite trading alerts or chimes to set them as your default Radar alarm!
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col gap-1.5 max-h-[180px] overflow-y-auto pr-1">
                    {customSounds.map((s) => {
                      const isSelected = settings.soundType === `custom:${s.id}`;
                      const sizeKb = Math.round(s.fileSize / 1024);
                      return (
                        <div
                          key={s.id}
                          onClick={() =>
                            handleUpdate({
                              soundType: `custom:${s.id}`,
                              customSoundId: s.id,
                              customSoundDataUrl: s.dataUrl,
                              customSoundName: s.name,
                            })
                          }
                          className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-[#2962ff]/10 border-[#2962ff] text-white"
                              : "bg-[#0e141f] border-[#1f2c3f] text-[#848e9c] hover:text-white"
                          }`}
                        >
                          <div className="flex items-center gap-2.5 truncate pr-2">
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${
                                isSelected
                                  ? "border-[#2962ff] bg-[#2962ff] text-white"
                                  : "border-[#405068] bg-transparent"
                              }`}
                            >
                              {isSelected && <Check size={10} />}
                            </div>

                            <FileAudio
                              size={14}
                              className={isSelected ? "text-[#2962ff]" : "text-[#848e9c]"}
                            />
                            <div className="truncate">
                              <div
                                className={`font-semibold text-xs truncate max-w-[200px] ${
                                  isSelected ? "text-[#2962ff]" : "text-white"
                                }`}
                                title={s.name}
                              >
                                {s.name}
                              </div>
                              <div className="text-[9px] text-[#55657e]">
                                {sizeKb} KB • Uploaded {new Date(s.createdAt).toLocaleDateString()}
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handlePreview(`custom:${s.id}`, s.dataUrl);
                              }}
                              className="px-2 py-1 rounded bg-[#1a2332] hover:bg-[#233144] border border-[#2b3a4f] text-[#b6c4ff] hover:text-white font-bold text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                              title="Play Sound Preview"
                            >
                              <Play size={10} className="fill-current" />
                              <span>Play</span>
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteCustomSound(s.id, e)}
                              className="p-1 rounded hover:bg-[#ff3b30]/20 text-[#848e9c] hover:text-[#ff3b30] cursor-pointer"
                              title="Delete Sound"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
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
