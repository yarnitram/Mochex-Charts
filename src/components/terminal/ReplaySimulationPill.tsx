"use client";

import React, { useEffect, useState } from "react";
import { replayEngine, ReplayState } from "@/lib/replay/replay-engine";
import { Bar } from "@/types/tradingview";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  X,
  Scissors,
  FastForward,
  Clock,
} from "lucide-react";

interface ReplaySimulationPillProps {
  onClose?: () => void;
}

export function ReplaySimulationPill({ onClose }: ReplaySimulationPillProps) {
  const [state, setState] = useState<ReplayState>("IDLE");
  const [cursor, setCursor] = useState(-1);
  const [total, setTotal] = useState(0);
  const [currentBar, setCurrentBar] = useState<Bar | null>(null);
  const [speedMs, setSpeedMs] = useState(1000);

  useEffect(() => {
    const unsubscribe = replayEngine.subscribe({
      onStateChange: (newState) => {
        setState(newState);
        setCursor(replayEngine.getCursorIndex());
        setTotal(replayEngine.getTotalBars());
        setCurrentBar(replayEngine.getCurrentBar());
      },
      onTick: (bar, c, t) => {
        setCurrentBar(bar);
        setCursor(c);
        setTotal(t);
      },
    });
    setState(replayEngine.getState());
    setCursor(replayEngine.getCursorIndex());
    setTotal(replayEngine.getTotalBars());
    setCurrentBar(replayEngine.getCurrentBar());
    return unsubscribe;
  }, []);

  // Keyboard shortcuts for TradingView Replay Dock (DEC-073):
  // Space = Play/Pause, ArrowRight = Step Forward, ArrowLeft = Step Backward
  useEffect(() => {
    if (state === "IDLE") return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement ||
        document.activeElement instanceof HTMLSelectElement
      ) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        if (replayEngine.getState() === "PLAYING") {
          replayEngine.pause();
        } else {
          replayEngine.play();
        }
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        if (replayEngine.getState() === "PLAYING") {
          replayEngine.pause();
        }
        replayEngine.stepForward();
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        replayEngine.stepBackward();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [state]);

  const handleToggleSelecting = () => {
    // Always keep or enter SELECTING mode without jumping to total - 30 (present price)
    // so users scrolled into past dates stay at their historical viewport to click a candle.
    replayEngine.startSelecting();
  };

  const handlePlayPause = () => {
    if (state === "PLAYING") {
      replayEngine.pause();
    } else {
      replayEngine.play();
    }
  };

  const handleStepForward = () => {
    if (state === "PLAYING") {
      replayEngine.pause();
    }
    replayEngine.stepForward();
  };

  const handleStepBackward = () => {
    replayEngine.stepBackward();
  };

  const handleSpeedSelect = (ms: number) => {
    setSpeedMs(ms);
    replayEngine.setSpeed(ms);
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const idx = parseInt(e.target.value, 10);
    if (!Number.isNaN(idx)) {
      replayEngine.setCursorIndex(idx);
    }
  };

  const handleExit = () => {
    replayEngine.exitReplay();
    onClose?.();
  };

  if (state === "IDLE") return null;

  const formattedDate = currentBar
    ? new Date(currentBar.time).toLocaleString("en-US", {
        month: "short",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      })
    : "Select Cutoff...";

  return (
    <div className="absolute top-11 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-surface-container-lowest/95 backdrop-blur-md border border-border px-3 py-1.5 rounded-xl shadow-2xl text-xs font-mono select-none">
      {/* Jump to Bar (Scissors) Toggle Button */}
      <button
        onClick={handleToggleSelecting}
        title="Jump to Bar — Click any candle on the chart to slice history (Scissors)"
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[10px] font-bold transition-colors cursor-pointer ${
          state === "SELECTING"
            ? "bg-gold text-[#0a141f] border-gold shadow-sm animate-pulse"
            : "bg-gold/15 hover:bg-gold/25 text-gold border-gold/30"
        }`}
      >
        <Scissors size={12} />
        <span>{state === "SELECTING" ? "Click Bar to Cut..." : "Jump to Bar"}</span>
      </button>

      <div className="h-4 w-px bg-border" />

      {/* Playback Controls: Step Back, Play/Pause, Step Forward */}
      <div className="flex items-center gap-1">
        <button
          onClick={handleStepBackward}
          disabled={cursor <= 0 || state === "SELECTING"}
          className="p-1.5 hover:bg-surface-container rounded text-muted hover:text-on-surface disabled:opacity-30 transition-colors cursor-pointer"
          title="Step Backward 1 Bar (← Left Arrow)"
        >
          <SkipBack size={13} />
        </button>

        <button
          onClick={handlePlayPause}
          className="p-1.5 bg-primary-container hover:bg-primary text-white rounded-lg font-bold shadow-xs transition-colors cursor-pointer"
          title={state === "PLAYING" ? "Pause Replay (Space)" : "Play Replay (Space)"}
        >
          {state === "PLAYING" ? <Pause size={13} /> : <Play size={13} />}
        </button>

        <button
          onClick={handleStepForward}
          disabled={cursor >= total - 1}
          className="p-1.5 hover:bg-surface-container rounded text-muted hover:text-on-surface disabled:opacity-30 transition-colors cursor-pointer"
          title="Step Forward 1 Bar (→ Right Arrow)"
        >
          <SkipForward size={13} />
        </button>
      </div>

      <div className="h-4 w-px bg-border" />

      {/* Interactive Timeline Scrubber + Timestamp & Bar Counter */}
      <div className="flex items-center gap-2 px-1">
        <div className="flex flex-col min-w-[115px]">
          <div className="flex items-center justify-between text-[10px]">
            <span className="flex items-center gap-1 text-on-surface font-semibold">
              <Clock size={10} className="text-primary" />
              {formattedDate}
            </span>
          </div>
          <div className="flex items-center justify-between text-[9px] text-muted">
            <span>
              Bar <strong className="text-primary">{cursor >= 0 ? cursor + 1 : total}</strong> / {total}
            </span>
            {currentBar && (
              <span className="text-secondary font-semibold">
                ${currentBar.close >= 1 ? currentBar.close.toFixed(2) : currentBar.close.toFixed(4)}
              </span>
            )}
          </div>
        </div>

        {total > 1 && (
          <input
            type="range"
            min={0}
            max={Math.max(0, total - 1)}
            value={cursor >= 0 ? cursor : total - 1}
            onChange={handleScrub}
            title="Scrub Replay Timeline"
            className="w-24 accent-primary cursor-pointer h-1.5 bg-surface-container-high rounded-lg"
          />
        )}
      </div>

      <div className="h-4 w-px bg-border" />

      {/* Speed Selector Pills (0.5x, 1x, 2x, 5x, 10x) */}
      <div className="flex items-center gap-0.5 bg-surface-container p-0.5 rounded-lg border border-border/60">
        {[
          { label: "0.5x", ms: 2000 },
          { label: "1x", ms: 1000 },
          { label: "2x", ms: 500 },
          { label: "5x", ms: 200 },
          { label: "10x", ms: 100 },
        ].map((s) => (
          <button
            key={s.label}
            onClick={() => handleSpeedSelect(s.ms)}
            className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
              speedMs === s.ms
                ? "bg-primary-container text-white"
                : "text-muted hover:text-on-surface"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="h-4 w-px bg-border" />

      {/* Jump to Real-Time & Exit Button */}
      <button
        onClick={handleExit}
        className="flex items-center gap-1 px-2 py-1 hover:bg-tertiary/20 hover:text-tertiary rounded-lg text-muted transition-colors cursor-pointer text-[10px] font-semibold"
        title="Jump to Real-Time & Exit Replay"
      >
        <FastForward size={12} />
        <span className="hidden lg:inline">Real-Time</span>
        <X size={12} />
      </button>
    </div>
  );
}
