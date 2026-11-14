"use client";

import React, { useState, useEffect } from "react";
import { X, Sliders, Palette, RotateCcw, Check, Lock } from "lucide-react";
import {
  ObFvgSettings,
  DEFAULT_OB_FVG_SETTINGS,
  ObZoneType,
} from "@/lib/indicators/validated-ob-engine";

interface ObFvgSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: ObFvgSettings;
  onSaveSettings: (settings: ObFvgSettings) => void;
}

const PRESET_PALETTE = [
  "#00c087",
  "#089981",
  "#26a69a",
  "#f23645",
  "#ef5350",
  "#ff9800",
  "#2962ff",
  "#ab47bc",
  "#787b86",
  "#ffffff",
];

function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
}: {
  checked: boolean;
  onChange: (val: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        checked ? "bg-[#2962ff]" : "bg-[#2a2e39]"
      } ${disabled ? "opacity-55 cursor-not-allowed" : ""}`}
    >
      <span
        aria-hidden="true"
        className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

function ColorPickerRow({
  label,
  value,
  onChange,
  sublabel,
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
  sublabel?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="flex items-center justify-between py-2 border-b border-[#2a2e39]/50 last:border-b-0">
      <div>
        <span className="text-xs text-[#d1d4dc] font-medium">{label}</span>
        {sublabel && <span className="text-[10px] text-[#787b86] ml-2">{sublabel}</span>}
      </div>
      <div className="relative flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex items-center gap-1.5 px-2 py-1 rounded bg-[#2a2e39] hover:bg-[#363a45] transition-colors cursor-pointer"
        >
          <span
            className="w-3.5 h-3.5 rounded-sm border border-white/20"
            style={{ backgroundColor: value }}
          />
          <span className="text-[10px] font-mono text-[#d1d4dc] uppercase">{value}</span>
        </button>

        {isOpen && (
          <div className="absolute right-0 top-8 z-50 p-2 bg-[#1e222d] border border-[#2a2e39] rounded-md shadow-xl w-44">
            <div className="grid grid-cols-5 gap-1.5 mb-2">
              {PRESET_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    onChange(c);
                    setIsOpen(false);
                  }}
                  className="w-6 h-6 rounded-sm border border-white/10 hover:scale-110 transition-transform flex items-center justify-center cursor-pointer"
                  style={{ backgroundColor: c }}
                >
                  {value.toLowerCase() === c.toLowerCase() && (
                    <Check size={10} className={c === "#ffffff" ? "text-black" : "text-white"} />
                  )}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 pt-1 border-t border-[#2a2e39]">
              <input
                type="color"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="w-6 h-6 bg-transparent border-0 cursor-pointer p-0"
              />
              <input
                type="text"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="flex-1 bg-[#131722] border border-[#2a2e39] rounded px-1.5 py-0.5 text-[10px] font-mono text-[#d1d4dc] focus:outline-none focus:border-[#2962ff]"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function ObFvgSettingsModal({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
}: ObFvgSettingsModalProps) {
  const [draft, setDraft] = useState<ObFvgSettings>(settings);
  const [activeTab, setActiveTab] = useState<"pattern" | "visual">("pattern");

  useEffect(() => {
    if (isOpen) {
      setDraft(settings);
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const update = <K extends keyof ObFvgSettings>(key: K, val: ObFvgSettings[K]) => {
    setDraft((prev) => ({ ...prev, [key]: val }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-[#1e222d] border border-[#2a2e39] rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#2a2e39] bg-[#131722]/60">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[#00c087]" />
            <h2 className="text-sm font-semibold text-[#d1d4dc]">
              Validated OB + FVG (RGG / GRR) Settings
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#787b86] hover:text-white p-1 rounded hover:bg-[#2a2e39] cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[#2a2e39] bg-[#131722]/40 px-4">
          <button
            type="button"
            onClick={() => setActiveTab("pattern")}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === "pattern"
                ? "border-[#2962ff] text-white"
                : "border-transparent text-[#787b86] hover:text-[#d1d4dc]"
            }`}
          >
            <Sliders size={13} />
            <span>Pattern Settings</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("visual")}
            className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
              activeTab === "visual"
                ? "border-[#2962ff] text-white"
                : "border-transparent text-[#787b86] hover:text-[#d1d4dc]"
            }`}
          >
            <Palette size={13} />
            <span>Visual Settings</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 overflow-y-auto space-y-4">
          {activeTab === "pattern" ? (
            <div className="space-y-3">
              {/* Show Indicator */}
              <div className="flex items-center justify-between py-2 border-b border-[#2a2e39]/60">
                <div>
                  <div className="text-xs font-semibold text-[#d1d4dc]">Show Indicator Overlay</div>
                  <div className="text-[10px] text-[#787b86]">Master toggle for RGG/GRR OB & FVG boxes</div>
                </div>
                <ToggleSwitch checked={draft.showIndicator} onChange={(v) => update("showIndicator", v)} />
              </div>

              {/* Bullish RGG */}
              <div className="flex items-center justify-between py-2 border-b border-[#2a2e39]/60">
                <div>
                  <div className="text-xs font-semibold text-emerald-300">Enable Bullish RGG</div>
                  <div className="text-[10px] text-[#787b86]">
                    Candle 1 Red (OB), Candle 2 &amp; 3 Green with C3.low &gt; C1.high
                  </div>
                </div>
                <ToggleSwitch checked={draft.enableBullishRgg} onChange={(v) => update("enableBullishRgg", v)} />
              </div>

              {/* Bearish GRR */}
              <div className="flex items-center justify-between py-2 border-b border-[#2a2e39]/60">
                <div>
                  <div className="text-xs font-semibold text-rose-300">Enable Bearish GRR</div>
                  <div className="text-[10px] text-[#787b86]">
                    Candle 1 Green (OB), Candle 2 &amp; 3 Red with C3.high &lt; C1.low
                  </div>
                </div>
                <ToggleSwitch checked={draft.enableBearishGrr} onChange={(v) => update("enableBearishGrr", v)} />
              </div>

              {/* Mandatory Valid FVG */}
              <div className="flex items-center justify-between py-2 border-b border-[#2a2e39]/60">
                <div>
                  <div className="text-xs font-semibold text-[#d1d4dc] flex items-center gap-1.5">
                    <span>Require Valid FVG</span>
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.2 rounded bg-[#2962ff]/20 text-[#8ab4ff] text-[9px] font-bold">
                      <Lock size={9} /> MANDATORY
                    </span>
                  </div>
                  <div className="text-[10px] text-[#787b86]">
                    Rejects RGG/GRR setups without a real wick-to-wick Fair Value Gap
                  </div>
                </div>
                <ToggleSwitch checked={true} onChange={() => {}} disabled />
              </div>

              {/* Minimum FVG Size */}
              <div className="flex items-center justify-between py-2 border-b border-[#2a2e39]/60">
                <div>
                  <div className="text-xs font-semibold text-[#d1d4dc]">Minimum FVG Size (%)</div>
                  <div className="text-[10px] text-[#787b86]">Default 0 accepts any valid wick gap</div>
                </div>
                <input
                  type="number"
                  min={0}
                  max={25}
                  step={0.05}
                  value={draft.minFvgPct}
                  onChange={(e) => update("minFvgPct", Math.max(0, Number(e.target.value) || 0))}
                  className="w-24 bg-[#131722] border border-[#2a2e39] rounded px-2 py-1 text-xs font-mono text-right text-[#d1d4dc] focus:outline-none focus:border-[#2962ff]"
                />
              </div>

              {/* Optional Minimum Displacement Size */}
              <div className="py-2 border-b border-[#2a2e39]/60 space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-[#d1d4dc]">
                      Minimum Displacement Size (Optional)
                    </div>
                    <div className="text-[10px] text-[#787b86]">
                      Require minimum Candle 2 body expansion % (disabled by default)
                    </div>
                  </div>
                  <ToggleSwitch
                    checked={draft.enableMinDisplacement}
                    onChange={(v) => update("enableMinDisplacement", v)}
                  />
                </div>
                {draft.enableMinDisplacement && (
                  <div className="flex items-center justify-between pl-2">
                    <span className="text-[11px] text-[#848e9c]">Min Candle 2 Body (%)</span>
                    <input
                      type="number"
                      min={0}
                      max={25}
                      step={0.05}
                      value={draft.minDisplacementPct}
                      onChange={(e) =>
                        update("minDisplacementPct", Math.max(0, Number(e.target.value) || 0))
                      }
                      className="w-24 bg-[#131722] border border-[#2a2e39] rounded px-2 py-1 text-xs font-mono text-right text-[#d1d4dc] focus:outline-none focus:border-[#2962ff]"
                    />
                  </div>
                )}
              </div>

              {/* OB Zone Type */}
              <div className="flex items-center justify-between py-2 border-b border-[#2a2e39]/60">
                <div>
                  <div className="text-xs font-semibold text-[#d1d4dc]">OB Zone Type</div>
                  <div className="text-[10px] text-[#787b86]">Full Candle (High–Low) or Body Only</div>
                </div>
                <div className="flex rounded-md bg-[#131722] border border-[#2a2e39] p-0.5">
                  {(
                    [
                      { id: "full", label: "Full Candle" },
                      { id: "body", label: "Body Only" },
                    ] as { id: ObZoneType; label: string }[]
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => update("obZoneType", opt.id)}
                      className={`px-2.5 py-1 rounded text-[11px] font-semibold cursor-pointer transition-colors ${
                        draft.obZoneType === opt.id
                          ? "bg-[#2962ff] text-white"
                          : "text-[#848e9c] hover:text-white"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Max Active OB Zones */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <div className="text-xs font-semibold text-[#d1d4dc]">Maximum Active OB Zones</div>
                  <div className="text-[10px] text-[#787b86]">Maximum unmitigated active OBs retained (default 100)</div>
                </div>
                <input
                  type="number"
                  min={1}
                  max={500}
                  step={1}
                  value={draft.maxActiveObZones}
                  onChange={(e) =>
                    update("maxActiveObZones", Math.max(1, Math.min(500, Math.floor(Number(e.target.value) || 100))))
                  }
                  className="w-24 bg-[#131722] border border-[#2a2e39] rounded px-2 py-1 text-xs font-mono text-right text-[#d1d4dc] focus:outline-none focus:border-[#2962ff]"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              <ColorPickerRow
                label="Bullish OB"
                sublabel="Active RGG zone"
                value={draft.bullishObColor}
                onChange={(c) => update("bullishObColor", c)}
              />
              <ColorPickerRow
                label="Bearish OB"
                sublabel="Active GRR zone"
                value={draft.bearishObColor}
                onChange={(c) => update("bearishObColor", c)}
              />
              <ColorPickerRow
                label="Bullish FVG"
                sublabel="Translucent green box"
                value={draft.bullishFvgColor}
                onChange={(c) => update("bullishFvgColor", c)}
              />
              <ColorPickerRow
                label="Bearish FVG"
                sublabel="Translucent red box"
                value={draft.bearishFvgColor}
                onChange={(c) => update("bearishFvgColor", c)}
              />
              <ColorPickerRow
                label="Mitigated OB"
                sublabel="Gray after first touch"
                value={draft.mitigatedObColor}
                onChange={(c) => update("mitigatedObColor", c)}
              />

              <div className="flex items-center justify-between py-2 border-b border-[#2a2e39]/50">
                <span className="text-xs text-[#d1d4dc] font-medium">Show OB Labels</span>
                <ToggleSwitch checked={draft.showObLabels} onChange={(v) => update("showObLabels", v)} />
              </div>

              <div className="flex items-center justify-between py-2 border-b border-[#2a2e39]/50">
                <span className="text-xs text-[#d1d4dc] font-medium">Show FVG Labels</span>
                <ToggleSwitch checked={draft.showFvgLabels} onChange={(v) => update("showFvgLabels", v)} />
              </div>

              <div className="flex items-center justify-between py-2 border-b border-[#2a2e39]/50">
                <div>
                  <span className="text-xs text-[#d1d4dc] font-medium">Extend Unmitigated OB</span>
                  <span className="block text-[10px] text-[#787b86]">Stops automatically at touching candle when mitigated</span>
                </div>
                <ToggleSwitch
                  checked={draft.extendUnmitigatedOb}
                  onChange={(v) => update("extendUnmitigatedOb", v)}
                />
              </div>

              <div className="flex items-center justify-between py-2">
                <span className="text-xs text-[#d1d4dc] font-medium">Show Mitigated OBs</span>
                <ToggleSwitch
                  checked={draft.showMitigatedObs}
                  onChange={(v) => update("showMitigatedObs", v)}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-[#2a2e39] bg-[#131722]/60">
          <button
            type="button"
            onClick={() => setDraft({ ...DEFAULT_OB_FVG_SETTINGS })}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs text-[#848e9c] hover:text-white hover:bg-[#2a2e39] cursor-pointer"
          >
            <RotateCcw size={12} />
            <span>Reset Defaults</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs font-medium text-[#d1d4dc] hover:bg-[#2a2e39] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                onSaveSettings(draft);
                onClose();
              }}
              className="px-4 py-1.5 rounded bg-[#2962ff] hover:bg-[#1e53e5] text-white text-xs font-semibold cursor-pointer"
            >
              Apply Settings
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
