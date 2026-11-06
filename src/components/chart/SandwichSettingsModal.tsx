"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Sliders,
  Palette,
  RotateCcw,
  Layers,
  Shield,
  Check,
} from "lucide-react";
import {
  SandwichSettings,
  DEFAULT_SANDWICH_SETTINGS,
  ALL_SANDWICH_TIMEFRAMES,
  ALL_SR_TIMEFRAMES,
  SandwichTimeframeId,
  SrTimeframeId,
  MitigationMode,
  ConfluenceMode,
} from "@/lib/indicators/sandwich";

interface SandwichSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: SandwichSettings;
  onSaveSettings: (settings: SandwichSettings) => void;
}

const PRESET_PALETTE = [
  "#00c087", // Green
  "#089981", // Dark Green
  "#26a69a", // Teal
  "#f23645", // Red
  "#ef5350", // Coral
  "#ff3b30", // Bright Red
  "#ffd700", // Gold
  "#fbc02d", // Warm Yellow
  "#ff9800", // Orange
  "#2962ff", // Blue
  "#00e5ff", // Aqua
  "#ab47bc", // Purple
  "#787b86", // Gray
  "#ffffff", // White
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
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
        checked ? "bg-[#2962ff]" : "bg-[#2a2e39]"
      } ${disabled ? "opacity-40 cursor-not-allowed" : ""}`}
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
          className="w-7 h-7 rounded border border-[#363a45] shadow-inner transition-transform active:scale-95 flex items-center justify-center cursor-pointer"
          style={{ backgroundColor: value }}
        />
        {isOpen && (
          <div className="fixed inset-0 z-50" onClick={() => setIsOpen(false)}>
            <div
              className="absolute p-3 bg-[#1e222d] border border-[#363a45] rounded-lg shadow-2xl grid grid-cols-7 gap-1.5 w-[210px] z-50"
              style={{
                top: "50%",
                left: "50%",
                transform: "translate(-50%, -50%)",
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {PRESET_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => {
                    onChange(c);
                    setIsOpen(false);
                  }}
                  className="w-6 h-6 rounded flex items-center justify-center transition-transform hover:scale-110 cursor-pointer"
                  style={{ backgroundColor: c }}
                >
                  {value.toLowerCase() === c.toLowerCase() && (
                    <Check
                      size={13}
                      className={c === "#ffffff" ? "text-black" : "text-white"}
                    />
                  )}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function SandwichSettingsModal({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
}: SandwichSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<"patterns" | "confluence" | "mitigation">("patterns");
  const [formState, setFormState] = useState<SandwichSettings>({ ...settings });

  useEffect(() => {
    if (isOpen) {
      setFormState({ ...settings });
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleResetDefaults = () => {
    setFormState({ ...DEFAULT_SANDWICH_SETTINGS });
  };

  const handleSave = () => {
    onSaveSettings(formState);
    onClose();
  };

  const handleTimeframeToggle = (tfId: SandwichTimeframeId, val: boolean) => {
    setFormState((prev) => ({
      ...prev,
      timeframes: {
        ...prev.timeframes,
        [tfId]: val,
      },
    }));
  };

  const handleSrTimeframeToggle = (srTf: SrTimeframeId, val: boolean) => {
    setFormState((prev) => ({
      ...prev,
      srTimeframes: {
        ...prev.srTimeframes,
        [srTf]: val,
      },
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#1e222d] border border-[#2a2e39] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2a2e39] flex items-center justify-between bg-[#1e222d]">
          <div className="flex items-center gap-2.5">
            <Layers className="text-[#ffd700]" size={20} />
            <div>
              <h3 className="text-sm font-semibold text-[#f0f3fa]">
                Sandwich Zones ++
              </h3>
              <p className="text-[11px] text-[#787b86]">
                4-Candle RGRR / GRGG & Multi-Timeframe S/R Confluence
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#787b86] hover:text-[#f0f3fa] transition-colors p-1 rounded-md hover:bg-[#2a2e39]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-[#2a2e39] bg-[#171b26] px-5">
          <button
            type="button"
            onClick={() => setActiveTab("patterns")}
            className={`flex items-center gap-1.5 py-2.5 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === "patterns"
                ? "border-[#ffd700] text-[#ffd700]"
                : "border-transparent text-[#787b86] hover:text-[#d1d4dc]"
            }`}
          >
            <Sliders size={13} />
            Patterns & Timeframes
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("confluence")}
            className={`flex items-center gap-1.5 py-2.5 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === "confluence"
                ? "border-[#ffd700] text-[#ffd700]"
                : "border-transparent text-[#787b86] hover:text-[#d1d4dc]"
            }`}
          >
            <Shield size={13} />
            S/R & Confluence ++
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("mitigation")}
            className={`flex items-center gap-1.5 py-2.5 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === "mitigation"
                ? "border-[#ffd700] text-[#ffd700]"
                : "border-transparent text-[#787b86] hover:text-[#d1d4dc]"
            }`}
          >
            <Palette size={13} />
            Mitigation & Styling
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* TAB 1: PATTERNS & TIMEFRAMES */}
          {activeTab === "patterns" && (
            <div className="space-y-5">
              {/* Master toggle */}
              <div className="flex items-center justify-between pb-3 border-b border-[#2a2e39]">
                <div>
                  <div className="text-xs font-semibold text-[#f0f3fa]">Show Indicator</div>
                  <div className="text-[11px] text-[#787b86]">Master toggle to enable/disable Sandwich Zones</div>
                </div>
                <ToggleSwitch
                  checked={formState.showIndicator}
                  onChange={(val) => setFormState({ ...formState, showIndicator: val })}
                />
              </div>

              {/* Pattern Selection */}
              <div>
                <div className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider mb-2">
                  Sandwich Patterns
                </div>
                <div className="bg-[#131722] p-3 rounded-lg border border-[#2a2e39]/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs text-[#d1d4dc] font-medium">Bearish Sandwich (RGRR)</span>
                      <p className="text-[10px] text-[#787b86]">Red-Green-Red-Red; boxes Green candle #2</p>
                    </div>
                    <ToggleSwitch
                      checked={formState.enableRgrr}
                      onChange={(val) => setFormState({ ...formState, enableRgrr: val })}
                      disabled={!formState.showIndicator}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[#2a2e39]/40">
                    <div>
                      <span className="text-xs text-[#d1d4dc] font-medium">Bullish Sandwich (GRGG)</span>
                      <p className="text-[10px] text-[#787b86]">Green-Red-Green-Green; boxes Red candle #2</p>
                    </div>
                    <ToggleSwitch
                      checked={formState.enableGrgg}
                      onChange={(val) => setFormState({ ...formState, enableGrgg: val })}
                      disabled={!formState.showIndicator}
                    />
                  </div>
                </div>
              </div>

              {/* FVG Requirement & Geometry */}
              <div>
                <div className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider mb-2">
                  Fair Value Gap & Box Geometry
                </div>
                <div className="bg-[#131722] p-3 rounded-lg border border-[#2a2e39]/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs text-[#d1d4dc] font-medium">Require Fair Value Gap (FVG)</span>
                      <p className="text-[10px] text-[#787b86]">Must form FVG across candles 2, 3, and 4</p>
                    </div>
                    <ToggleSwitch
                      checked={formState.requireFvg}
                      onChange={(val) => setFormState({ ...formState, requireFvg: val })}
                      disabled={!formState.showIndicator}
                    />
                  </div>

                  {formState.requireFvg && (
                    <div className="flex items-center justify-between pt-2 border-t border-[#2a2e39]/40">
                      <div>
                        <span className="text-xs text-[#d1d4dc] font-medium">Minimum FVG Size (Ticks)</span>
                        <p className="text-[10px] text-[#787b86]">0 = any valid FVG gap</p>
                      </div>
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={formState.minFvgTicks}
                        onChange={(e) =>
                          setFormState({
                            ...formState,
                            minFvgTicks: Math.max(0, parseInt(e.target.value) || 0),
                          })
                        }
                        className="w-16 bg-[#1e222d] border border-[#2a2e39] text-[#f0f3fa] text-xs px-2 py-1 rounded text-center focus:outline-none focus:border-[#ffd700]"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-[#2a2e39]/40">
                    <div>
                      <span className="text-xs text-[#d1d4dc] font-medium">Use Body Only</span>
                      <p className="text-[10px] text-[#787b86]">
                        Box Candle #2 open/close instead of full wicks (high/low)
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={formState.useBodyOnly}
                      onChange={(val) => setFormState({ ...formState, useBodyOnly: val })}
                      disabled={!formState.showIndicator}
                    />
                  </div>
                </div>
              </div>

              {/* Timeframes Grid */}
              <div>
                <div className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider mb-2">
                  Active Detection Timeframes
                </div>
                <div className="grid grid-cols-2 gap-2 bg-[#131722] p-3 rounded-lg border border-[#2a2e39]/60">
                  {ALL_SANDWICH_TIMEFRAMES.map((tf) => (
                    <label
                      key={tf.id}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-[#2a2e39]/40 cursor-pointer transition-colors"
                    >
                      <span className="text-xs text-[#d1d4dc] font-medium">{tf.label}</span>
                      <ToggleSwitch
                        checked={!!formState.timeframes[tf.id]}
                        onChange={(val) => handleTimeframeToggle(tf.id, val)}
                        disabled={!formState.showIndicator}
                      />
                    </label>
                  ))}
                </div>
                <div className="text-[11px] text-[#787b86] mt-1.5">
                  Duplicate zones are automatically suppressed if an enabled MTF matches the current chart resolution.
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: SUPPORT/RESISTANCE & CONFLUENCE ++ */}
          {activeTab === "confluence" && (
            <div className="space-y-5">
              {/* S/R Master Toggle */}
              <div className="bg-[#131722] p-3 rounded-lg border border-[#2a2e39]/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-[#d1d4dc] font-medium">Enable S/R Detection</span>
                    <p className="text-[10px] text-[#787b86]">Detect confirmed swing high/low levels</p>
                  </div>
                  <ToggleSwitch
                    checked={formState.enableSr}
                    onChange={(val) => setFormState({ ...formState, enableSr: val })}
                    disabled={!formState.showIndicator}
                  />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#2a2e39]/40">
                  <div>
                    <span className="text-xs text-[#d1d4dc] font-medium">Show S/R Boxes on Chart</span>
                    <p className="text-[10px] text-[#787b86]">Display raw dashed S/R zones directly on chart</p>
                  </div>
                  <ToggleSwitch
                    checked={formState.showSrBoxes}
                    onChange={(val) => setFormState({ ...formState, showSrBoxes: val })}
                    disabled={!formState.showIndicator || !formState.enableSr}
                  />
                </div>
              </div>

              {/* S/R Timeframes & Pivots */}
              <div>
                <div className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider mb-2">
                  S/R Timeframes & Lookback
                </div>
                <div className="bg-[#131722] p-3 rounded-lg border border-[#2a2e39]/60 space-y-3">
                  <div className="grid grid-cols-3 gap-2">
                    {ALL_SR_TIMEFRAMES.map((tf) => (
                      <label
                        key={tf.id}
                        className="flex items-center justify-between px-2 py-1.5 rounded bg-[#1e222d] border border-[#2a2e39] cursor-pointer"
                      >
                        <span className="text-xs text-[#d1d4dc]">{tf.label}</span>
                        <ToggleSwitch
                          checked={!!formState.srTimeframes[tf.id]}
                          onChange={(val) => handleSrTimeframeToggle(tf.id, val)}
                          disabled={!formState.showIndicator || !formState.enableSr}
                        />
                      </label>
                    ))}
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[#2a2e39]/40">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#d1d4dc]">Pivot Left:</span>
                      <input
                        type="number"
                        min={1}
                        max={15}
                        value={formState.pivotLeft}
                        onChange={(e) =>
                          setFormState({
                            ...formState,
                            pivotLeft: Math.max(1, Math.min(15, parseInt(e.target.value) || 3)),
                          })
                        }
                        className="w-14 bg-[#1e222d] border border-[#2a2e39] text-[#f0f3fa] text-xs px-2 py-1 rounded text-center focus:outline-none focus:border-[#ffd700]"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-[#d1d4dc]">Pivot Right:</span>
                      <input
                        type="number"
                        min={1}
                        max={15}
                        value={formState.pivotRight}
                        onChange={(e) =>
                          setFormState({
                            ...formState,
                            pivotRight: Math.max(1, Math.min(15, parseInt(e.target.value) || 3)),
                          })
                        }
                        className="w-14 bg-[#1e222d] border border-[#2a2e39] text-[#f0f3fa] text-xs px-2 py-1 rounded text-center focus:outline-none focus:border-[#ffd700]"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Sandwich ++ Confluence */}
              <div>
                <div className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider mb-2">
                  Sandwich ++ Confluence Upgrade
                </div>
                <div className="bg-[#131722] p-3 rounded-lg border border-[#2a2e39]/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs text-[#ffd700] font-semibold">
                        Upgrade to Sandwich ++
                      </span>
                      <p className="text-[10px] text-[#787b86]">
                        Highlights zone in Gold when overlapping confirmed HTF S/R
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={formState.enableConfluence}
                      onChange={(val) => setFormState({ ...formState, enableConfluence: val })}
                      disabled={!formState.showIndicator || !formState.enableSr}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[#2a2e39]/40">
                    <div>
                      <span className="text-xs text-[#d1d4dc] font-medium">Confluence Mode</span>
                      <p className="text-[10px] text-[#787b86]">
                        Directional (RGRR@Res, GRGG@Sup) or Any S/R
                      </p>
                    </div>
                    <div className="flex items-center gap-1 bg-[#1e222d] p-1 rounded border border-[#2a2e39]">
                      <button
                        type="button"
                        onClick={() => setFormState({ ...formState, confluenceMode: "directional" })}
                        className={`px-2.5 py-1 text-xs rounded cursor-pointer transition-colors ${
                          formState.confluenceMode === "directional"
                            ? "bg-[#ffd700] text-black font-semibold"
                            : "text-[#787b86] hover:text-[#d1d4dc]"
                        }`}
                      >
                        Directional
                      </button>
                      <button
                        type="button"
                        onClick={() => setFormState({ ...formState, confluenceMode: "any" })}
                        className={`px-2.5 py-1 text-xs rounded cursor-pointer transition-colors ${
                          formState.confluenceMode === "any"
                            ? "bg-[#ffd700] text-black font-semibold"
                            : "text-[#787b86] hover:text-[#d1d4dc]"
                        }`}
                      >
                        Any S/R
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: MITIGATION & STYLING */}
          {activeTab === "mitigation" && (
            <div className="space-y-5">
              {/* Mitigation Lifecycle */}
              <div>
                <div className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider mb-2">
                  Zone Lifecycle & Mitigation
                </div>
                <div className="bg-[#131722] p-3 rounded-lg border border-[#2a2e39]/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs text-[#d1d4dc] font-medium">Auto Mitigation</span>
                      <p className="text-[10px] text-[#787b86]">
                        Freeze box at first touch and switch styling to gray
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={formState.enableMitigation}
                      onChange={(val) => setFormState({ ...formState, enableMitigation: val })}
                      disabled={!formState.showIndicator}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[#2a2e39]/40">
                    <span className="text-xs text-[#d1d4dc] font-medium">Mitigation Mode</span>
                    <div className="flex items-center gap-1 bg-[#1e222d] p-1 rounded border border-[#2a2e39]">
                      {(
                        [
                          { id: "firstTouch", label: "First Touch" },
                          { id: "halfFill", label: "50% Fill" },
                          { id: "fullFill", label: "Full Fill" },
                        ] as const
                      ).map((m) => (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setFormState({ ...formState, mitigationMode: m.id })}
                          className={`px-2 py-1 text-xs rounded cursor-pointer transition-colors ${
                            formState.mitigationMode === m.id
                              ? "bg-[#2962ff] text-white font-semibold"
                              : "text-[#787b86] hover:text-[#d1d4dc]"
                          }`}
                        >
                          {m.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#2a2e39]/40">
                    <label className="flex items-center justify-between px-2 py-1 rounded hover:bg-[#2a2e39]/30 cursor-pointer">
                      <span className="text-xs text-[#d1d4dc]">Show Active</span>
                      <ToggleSwitch
                        checked={formState.showActiveZones}
                        onChange={(val) => setFormState({ ...formState, showActiveZones: val })}
                      />
                    </label>
                    <label className="flex items-center justify-between px-2 py-1 rounded hover:bg-[#2a2e39]/30 cursor-pointer">
                      <span className="text-xs text-[#d1d4dc]">Show Mitigated</span>
                      <ToggleSwitch
                        checked={formState.showMitigatedZones}
                        onChange={(val) => setFormState({ ...formState, showMitigatedZones: val })}
                      />
                    </label>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[#2a2e39]/40">
                    <div>
                      <span className="text-xs text-[#d1d4dc] font-medium">Show Only Unmitigated</span>
                      <p className="text-[10px] text-[#787b86]">Hide all historical mitigated zones</p>
                    </div>
                    <ToggleSwitch
                      checked={formState.showOnlyUnmitigated}
                      onChange={(val) => setFormState({ ...formState, showOnlyUnmitigated: val })}
                    />
                  </div>
                </div>
              </div>

              {/* Colors & Appearance */}
              <div>
                <div className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider mb-2">
                  Colors & Appearance
                </div>
                <div className="bg-[#131722] p-3 rounded-lg border border-[#2a2e39]/60 divide-y divide-[#2a2e39]/40">
                  <ColorPickerRow
                    label="Bullish Zone (GRGG)"
                    value={formState.bullishColor}
                    onChange={(c) => setFormState({ ...formState, bullishColor: c })}
                  />
                  <ColorPickerRow
                    label="Bearish Zone (RGRR)"
                    value={formState.bearishColor}
                    onChange={(c) => setFormState({ ...formState, bearishColor: c })}
                  />
                  <ColorPickerRow
                    label="Sandwich ++ Confluence"
                    sublabel="(Gold Highlight)"
                    value={formState.plusColor}
                    onChange={(c) => setFormState({ ...formState, plusColor: c })}
                  />
                  <ColorPickerRow
                    label="Mitigated Zone"
                    sublabel="(Gray Frozen)"
                    value={formState.mitigatedColor}
                    onChange={(c) => setFormState({ ...formState, mitigatedColor: c })}
                  />
                  <ColorPickerRow
                    label="Support Zone"
                    value={formState.supportColor}
                    onChange={(c) => setFormState({ ...formState, supportColor: c })}
                  />
                  <ColorPickerRow
                    label="Resistance Zone"
                    value={formState.resistanceColor}
                    onChange={(c) => setFormState({ ...formState, resistanceColor: c })}
                  />

                  {/* Fill Opacities & Max Limits */}
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs text-[#d1d4dc]">Active Fill Opacity</span>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min={5}
                        max={80}
                        value={Math.round(formState.fillOpacity * 100)}
                        onChange={(e) =>
                          setFormState({
                            ...formState,
                            fillOpacity: Number(e.target.value) / 100,
                          })
                        }
                        className="w-24 accent-[#ffd700] cursor-pointer"
                      />
                      <span className="text-xs font-mono text-[#f0f3fa] w-8 text-right">
                        {Math.round(formState.fillOpacity * 100)}%
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs text-[#d1d4dc]">Show Labels</span>
                    <ToggleSwitch
                      checked={formState.showLabels}
                      onChange={(val) => setFormState({ ...formState, showLabels: val })}
                    />
                  </div>

                  <div className="flex items-center justify-between py-2">
                    <div>
                      <span className="text-xs text-[#d1d4dc]">Max Historical Zones</span>
                      <p className="text-[10px] text-[#787b86]">Keep chart lightweight</p>
                    </div>
                    <input
                      type="number"
                      min={10}
                      max={500}
                      value={formState.maxHistoricalZones}
                      onChange={(e) =>
                        setFormState({
                          ...formState,
                          maxHistoricalZones: Math.max(10, Math.min(500, parseInt(e.target.value) || 100)),
                        })
                      }
                      className="w-16 bg-[#1e222d] border border-[#2a2e39] text-[#f0f3fa] text-xs px-2 py-1 rounded text-center focus:outline-none focus:border-[#ffd700]"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-[#2a2e39] bg-[#1e222d] flex items-center justify-between">
          <button
            type="button"
            onClick={handleResetDefaults}
            className="flex items-center gap-1.5 text-xs text-[#787b86] hover:text-[#f0f3fa] transition-colors py-1 px-2 rounded hover:bg-[#2a2e39]/50 cursor-pointer"
          >
            <RotateCcw size={13} />
            <span>Reset Defaults</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs text-[#d1d4dc] hover:text-[#f0f3fa] hover:bg-[#2a2e39] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="px-4 py-1.5 rounded text-xs font-semibold bg-[#ffd700] text-black hover:bg-[#ffc107] transition-colors shadow-sm cursor-pointer"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
