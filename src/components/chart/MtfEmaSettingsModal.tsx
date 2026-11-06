"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Sliders,
  Palette,
  RotateCcw,
  Layers,
  Type,
  Check,
} from "lucide-react";
import {
  MtfEmaSettings,
  DEFAULT_MTF_EMA_SETTINGS,
  ALL_MTF_TIMEFRAMES,
  ALL_EMA_PERIODS,
  MtfTimeframeId,
  EmaPeriod,
  LabelTextSize,
} from "@/lib/indicators/mtf-ema";

interface MtfEmaSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: MtfEmaSettings;
  onSaveSettings: (settings: MtfEmaSettings) => void;
}

const PRESET_PALETTE = [
  "#ffffff",
  "#787b86",
  "#2962ff",
  "#2196f3",
  "#00e5ff",
  "#00c087",
  "#089981",
  "#fbc02d",
  "#f5ac37",
  "#ff9800",
  "#ff7043",
  "#f23645",
  "#ab47bc",
  "#e040fb",
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
          <div
            className="fixed inset-0 z-50"
            onClick={() => setIsOpen(false)}
          >
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

export function MtfEmaSettingsModal({
  isOpen,
  onClose,
  settings,
  onSaveSettings,
}: MtfEmaSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<"timeframes" | "colors" | "labels">("timeframes");
  const [formState, setFormState] = useState<MtfEmaSettings>({ ...settings });

  useEffect(() => {
    if (isOpen) {
      setFormState({ ...settings });
    }
  }, [isOpen, settings]);

  if (!isOpen) return null;

  const handleResetDefaults = () => {
    setFormState({ ...DEFAULT_MTF_EMA_SETTINGS });
  };

  const handleSave = () => {
    onSaveSettings(formState);
    onClose();
  };

  const handleTimeframeToggle = (tfId: MtfTimeframeId, val: boolean) => {
    setFormState((prev) => ({
      ...prev,
      timeframes: {
        ...prev.timeframes,
        [tfId]: val,
      },
    }));
  };

  const handlePeriodToggle = (p: EmaPeriod, val: boolean) => {
    setFormState((prev) => ({
      ...prev,
      periods: {
        ...prev.periods,
        [p]: val,
      },
    }));
  };

  const handleCurrentColorChange = (p: EmaPeriod, color: string) => {
    setFormState((prev) => ({
      ...prev,
      currentColors: {
        ...prev.currentColors,
        [p]: color,
      },
    }));
  };

  const handleTimeframeColorChange = (tf: Exclude<MtfTimeframeId, "current">, color: string) => {
    setFormState((prev) => ({
      ...prev,
      timeframeColors: {
        ...prev.timeframeColors,
        [tf]: color,
      },
    }));
  };

  const handleLineWidthChange = (p: EmaPeriod, width: number) => {
    setFormState((prev) => ({
      ...prev,
      lineWidths: {
        ...prev.lineWidths,
        [p]: width,
      },
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg bg-[#1e222d] border border-[#2a2e39] rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#2a2e39] flex items-center justify-between bg-[#1e222d]">
          <div className="flex items-center gap-2.5">
            <Layers className="text-[#2962ff]" size={20} />
            <div>
              <h3 className="text-sm font-semibold text-[#f0f3fa]">
                MTF EMA — 20/50/100/200
              </h3>
              <p className="text-[11px] text-[#787b86]">Multi-Timeframe Exponential Moving Averages</p>
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
            onClick={() => setActiveTab("timeframes")}
            className={`flex items-center gap-1.5 py-2.5 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === "timeframes"
                ? "border-[#2962ff] text-[#2962ff]"
                : "border-transparent text-[#787b86] hover:text-[#d1d4dc]"
            }`}
          >
            <Sliders size={13} />
            Timeframes & Periods
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("colors")}
            className={`flex items-center gap-1.5 py-2.5 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === "colors"
                ? "border-[#2962ff] text-[#2962ff]"
                : "border-transparent text-[#787b86] hover:text-[#d1d4dc]"
            }`}
          >
            <Palette size={13} />
            Colors & Style
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("labels")}
            className={`flex items-center gap-1.5 py-2.5 px-3 text-xs font-medium border-b-2 transition-colors cursor-pointer ${
              activeTab === "labels"
                ? "border-[#2962ff] text-[#2962ff]"
                : "border-transparent text-[#787b86] hover:text-[#d1d4dc]"
            }`}
          >
            <Type size={13} />
            Labels & Spacing
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* TAB 1: TIMEFRAMES & PERIODS */}
          {activeTab === "timeframes" && (
            <div className="space-y-5">
              {/* Master toggle */}
              <div className="flex items-center justify-between pb-3 border-b border-[#2a2e39]">
                <div>
                  <div className="text-xs font-semibold text-[#f0f3fa]">Show EMA Indicator</div>
                  <div className="text-[11px] text-[#787b86]">Master toggle to enable/disable all MTF EMAs</div>
                </div>
                <ToggleSwitch
                  checked={formState.showIndicator}
                  onChange={(val) => setFormState({ ...formState, showIndicator: val })}
                />
              </div>

              {/* Timeframes Grid */}
              <div>
                <div className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider mb-2">
                  Timeframe Checkboxes
                </div>
                <div className="grid grid-cols-2 gap-2 bg-[#131722] p-3 rounded-lg border border-[#2a2e39]/60">
                  {ALL_MTF_TIMEFRAMES.map((tf) => (
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
                  Duplicate lines are automatically suppressed if an enabled MTF matches the current chart timeframe.
                </div>
              </div>

              {/* EMA Periods */}
              <div>
                <div className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider mb-2">
                  EMA Period Visibility
                </div>
                <div className="grid grid-cols-2 gap-2 bg-[#131722] p-3 rounded-lg border border-[#2a2e39]/60">
                  {ALL_EMA_PERIODS.map((period) => (
                    <label
                      key={period}
                      className="flex items-center justify-between px-2.5 py-1.5 rounded hover:bg-[#2a2e39]/40 cursor-pointer transition-colors"
                    >
                      <span className="text-xs text-[#d1d4dc] font-medium">EMA {period}</span>
                      <ToggleSwitch
                        checked={!!formState.periods[period]}
                        onChange={(val) => handlePeriodToggle(period, val)}
                        disabled={!formState.showIndicator}
                      />
                    </label>
                  ))}
                </div>
                <div className="text-[11px] text-[#787b86] mt-1.5">
                  Period toggles apply consistently across all active timeframes.
                </div>
              </div>

              {/* Developing HTF Option */}
              <div className="flex items-center justify-between pt-2 border-t border-[#2a2e39]">
                <div>
                  <div className="text-xs text-[#d1d4dc] font-medium">Show Developing HTF EMA</div>
                  <div className="text-[11px] text-[#787b86]">
                    Provisional real-time projection for open higher-timeframe candle (default: Off)
                  </div>
                </div>
                <ToggleSwitch
                  checked={formState.showDevelopingHtf}
                  onChange={(val) => setFormState({ ...formState, showDevelopingHtf: val })}
                  disabled={!formState.showIndicator}
                />
              </div>
            </div>
          )}

          {/* TAB 2: COLORS & STYLE */}
          {activeTab === "colors" && (
            <div className="space-y-6">
              {/* Current Chart Colors & Widths */}
              <div>
                <div className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider mb-2">
                  Current Chart EMAs (Independent Colors & Widths)
                </div>
                <div className="bg-[#131722] p-3 rounded-lg border border-[#2a2e39]/60 space-y-2">
                  {ALL_EMA_PERIODS.map((p) => (
                    <div
                      key={p}
                      className="flex items-center justify-between py-1.5 border-b border-[#2a2e39]/40 last:border-b-0"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[#f0f3fa] w-16">EMA {p}</span>
                        {/* Width selector */}
                        <div className="flex items-center gap-1 bg-[#1e222d] px-2 py-0.5 rounded border border-[#2a2e39]">
                          <span className="text-[10px] text-[#787b86]">Width:</span>
                          {[1, 2, 3, 4].map((w) => (
                            <button
                              key={w}
                              type="button"
                              onClick={() => handleLineWidthChange(p, w)}
                              className={`w-5 h-5 text-[11px] font-medium rounded flex items-center justify-center cursor-pointer transition-colors ${
                                formState.lineWidths[p] === w
                                  ? "bg-[#2962ff] text-white"
                                  : "text-[#787b86] hover:text-[#d1d4dc]"
                              }`}
                            >
                              {w}
                            </button>
                          ))}
                        </div>
                      </div>
                      <ColorPickerRow
                        label=""
                        value={formState.currentColors[p]}
                        onChange={(c) => handleCurrentColorChange(p, c)}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Other Timeframe Colors */}
              <div>
                <div className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider mb-2">
                  Other Timeframe Colors (Applies to all 4 EMAs in timeframe)
                </div>
                <div className="bg-[#131722] p-3 rounded-lg border border-[#2a2e39]/60 divide-y divide-[#2a2e39]/40">
                  {(
                    [
                      { id: "1m", label: "1 minute (1m)" },
                      { id: "5m", label: "5 minutes (5m)" },
                      { id: "15m", label: "15 minutes (15m)" },
                      { id: "1h", label: "1 hour (1H)" },
                      { id: "2h", label: "2 hours (2H)" },
                      { id: "4h", label: "4 hours (4H)" },
                      { id: "1d", label: "1 day (1D)" },
                      { id: "1w", label: "1 week (1W)" },
                    ] as const
                  ).map((tf) => (
                    <ColorPickerRow
                      key={tf.id}
                      label={tf.label}
                      value={formState.timeframeColors[tf.id]}
                      onChange={(c) => handleTimeframeColorChange(tf.id, c)}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: LABELS & SPACING */}
          {activeTab === "labels" && (
            <div className="space-y-5">
              {/* Label Visibility */}
              <div className="bg-[#131722] p-3 rounded-lg border border-[#2a2e39]/60 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-xs text-[#d1d4dc] font-medium">Show Current-Chart Labels</span>
                    <p className="text-[10px] text-[#787b86]">Labels on the current chart's active EMA levels</p>
                  </div>
                  <ToggleSwitch
                    checked={formState.showCurrentLabels}
                    onChange={(val) => setFormState({ ...formState, showCurrentLabels: val })}
                  />
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-[#2a2e39]/40">
                  <div>
                    <span className="text-xs text-[#d1d4dc] font-medium">Show Other-Timeframe Labels</span>
                    <p className="text-[10px] text-[#787b86]">Labels on MTF higher/lower timeframe levels</p>
                  </div>
                  <ToggleSwitch
                    checked={formState.showMtfLabels}
                    onChange={(val) => setFormState({ ...formState, showMtfLabels: val })}
                  />
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-[#2a2e39]/40">
                  <div>
                    <span className="text-xs text-[#d1d4dc] font-medium">Abbreviated Labels</span>
                    <p className="text-[10px] text-[#787b86]">Format as "1H E200" instead of "1H EMA 200"</p>
                  </div>
                  <ToggleSwitch
                    checked={formState.abbreviatedLabels}
                    onChange={(val) => setFormState({ ...formState, abbreviatedLabels: val })}
                  />
                </div>
              </div>

              {/* Text Size & Appearance */}
              <div>
                <div className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider mb-2">
                  Label Typography & Offset
                </div>
                <div className="bg-[#131722] p-3 rounded-lg border border-[#2a2e39]/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[#d1d4dc] font-medium">Text Size</span>
                    <div className="flex items-center gap-1 bg-[#1e222d] p-1 rounded border border-[#2a2e39]">
                      {(["tiny", "small", "normal"] as LabelTextSize[]).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setFormState({ ...formState, textSize: s })}
                          className={`px-2.5 py-1 text-xs capitalize rounded cursor-pointer transition-colors ${
                            formState.textSize === s
                              ? "bg-[#2962ff] text-white font-semibold"
                              : "text-[#787b86] hover:text-[#d1d4dc]"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[#2a2e39]/40">
                    <div>
                      <span className="text-xs text-[#d1d4dc] font-medium">Label Offset (Bars)</span>
                      <p className="text-[10px] text-[#787b86]">Distance from latest bar</p>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={25}
                      value={formState.labelOffsetBars}
                      onChange={(e) =>
                        setFormState({
                          ...formState,
                          labelOffsetBars: Math.max(0, Math.min(25, Number(e.target.value) || 0)),
                        })
                      }
                      className="w-16 bg-[#1e222d] border border-[#2a2e39] text-[#f0f3fa] text-xs px-2 py-1 rounded text-center focus:outline-none focus:border-[#2962ff]"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[#2a2e39]/40">
                    <div>
                      <span className="text-xs text-[#d1d4dc] font-medium">Transparent Background</span>
                      <p className="text-[10px] text-[#787b86]">Hide dark pill badge behind label text</p>
                    </div>
                    <ToggleSwitch
                      checked={formState.transparentLabelBg}
                      onChange={(val) => setFormState({ ...formState, transparentLabelBg: val })}
                    />
                  </div>
                </div>
              </div>

              {/* Collision Avoidance */}
              <div>
                <div className="text-[11px] font-semibold text-[#787b86] uppercase tracking-wider mb-2">
                  Label Overlap Protection
                </div>
                <div className="bg-[#131722] p-3 rounded-lg border border-[#2a2e39]/60 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs text-[#d1d4dc] font-medium">Smart Label Spacing</span>
                      <p className="text-[10px] text-[#787b86]">
                        Automatically separate overlapping labels with leader ticks
                      </p>
                    </div>
                    <ToggleSwitch
                      checked={formState.smartLabelSpacing}
                      onChange={(val) => setFormState({ ...formState, smartLabelSpacing: val })}
                    />
                  </div>

                  {formState.smartLabelSpacing && (
                    <div className="flex items-center justify-between pt-2 border-t border-[#2a2e39]/40">
                      <div>
                        <span className="text-xs text-[#d1d4dc] font-medium">Minimum Spacing</span>
                        <p className="text-[10px] text-[#787b86]">Vertical separation in pixels (8px - 30px)</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="range"
                          min={8}
                          max={30}
                          value={formState.minLabelSpacingPx}
                          onChange={(e) =>
                            setFormState({
                              ...formState,
                              minLabelSpacingPx: Number(e.target.value),
                            })
                          }
                          className="w-24 accent-[#2962ff] cursor-pointer"
                        />
                        <span className="text-xs font-mono text-[#f0f3fa] w-8 text-right">
                          {formState.minLabelSpacingPx}px
                        </span>
                      </div>
                    </div>
                  )}
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
              className="px-4 py-1.5 rounded text-xs font-semibold bg-[#2962ff] text-white hover:bg-[#1e53e5] transition-colors shadow-sm cursor-pointer"
            >
              Apply
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
