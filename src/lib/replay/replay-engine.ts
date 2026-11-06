import { Bar } from "@/types/tradingview";

export type ReplayState = "IDLE" | "SELECTING" | "PAUSED" | "PLAYING";

export interface ReplayEngineListener {
  onStateChange?(state: ReplayState): void;
  onTick?(bar: Bar, cursorIndex: number, totalBars: number, isForwardStep?: boolean): void;
  onEnd?(): void;
}

/**
 * Generates a realistic intrabar price trajectory [Open -> Low -> High -> Close] for bullish candles
 * or [Open -> High -> Low -> Close] for bearish candles so Limit orders, Stop Losses, Take Profits,
 * and Crossing Alerts trigger accurately on intrabar wicks during Bar Replay (DEC-073).
 */
export function getIntrabarPricePath(bar: Bar): number[] {
  if (!bar) return [];
  const isBullish = bar.close >= bar.open;
  const rawPath = isBullish
    ? [bar.open, bar.low, bar.high, bar.close]
    : [bar.open, bar.high, bar.low, bar.close];

  // Deduplicate consecutive identical prices while preserving order
  const deduped: number[] = [];
  for (const p of rawPath) {
    if (Number.isFinite(p) && p > 0 && deduped[deduped.length - 1] !== p) {
      deduped.push(p);
    }
  }
  return deduped;
}

export class BarReplayEngine {
  private state: ReplayState = "IDLE";
  private allBars: Bar[] = [];
  private cursorIndex = -1;
  private playbackIntervalMs = 1000;
  private timer: NodeJS.Timeout | null = null;
  private listeners: Set<ReplayEngineListener> = new Set();

  public subscribe(listener: ReplayEngineListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  public getState(): ReplayState {
    return this.state;
  }

  public getCursorIndex(): number {
    return this.cursorIndex;
  }

  public getTotalBars(): number {
    return this.allBars.length;
  }

  public getAllBars(): Bar[] {
    return [...this.allBars];
  }

  public getCurrentBar(): Bar | null {
    if (this.cursorIndex >= 0 && this.cursorIndex < this.allBars.length) {
      return this.allBars[this.cursorIndex];
    }
    return this.allBars.length > 0 ? this.allBars[this.allBars.length - 1] : null;
  }

  public getVisibleBars(): Bar[] {
    if (this.state === "IDLE" || this.state === "SELECTING" || this.cursorIndex < 0) {
      return [...this.allBars];
    }
    return this.allBars.slice(0, this.cursorIndex + 1);
  }

  public loadHistory(bars: Bar[], targetTimestamp?: number): void {
    const prevCutoffTime =
      this.cursorIndex >= 0 && this.cursorIndex < this.allBars.length
        ? this.allBars[this.cursorIndex].time
        : null;

    this.allBars = [...bars].sort((a, b) => a.time - b.time);

    if (targetTimestamp !== undefined && this.state !== "IDLE" && this.allBars.length > 0) {
      this.stopTimer();
      this.state = "PAUSED";

      // Find nearest bar matching targetTimestamp
      let bestIdx = 0;
      let minDiff = Infinity;
      for (let i = 0; i < this.allBars.length; i++) {
        const diff = Math.abs(this.allBars[i].time - targetTimestamp);
        if (diff < minDiff) {
          minDiff = diff;
          bestIdx = i;
        }
      }
      this.cursorIndex = Math.max(0, Math.min(this.allBars.length - 1, bestIdx));
      this.notifyState();
      this.notifyTick(false);
      return;
    }

    if (prevCutoffTime !== null && this.allBars.length > 0) {
      let bestIdx = 0;
      let minDiff = Infinity;
      for (let i = 0; i < this.allBars.length; i++) {
        const diff = Math.abs(this.allBars[i].time - prevCutoffTime);
        if (diff < minDiff) {
          minDiff = diff;
          bestIdx = i;
        }
      }
      this.cursorIndex = Math.max(0, Math.min(this.allBars.length - 1, bestIdx));
    } else if (this.cursorIndex >= this.allBars.length) {
      this.cursorIndex = this.allBars.length - 1;
    }
  }

  public getCutoffTime(): number | null {
    if (this.cursorIndex >= 0 && this.cursorIndex < this.allBars.length) {
      return this.allBars[this.cursorIndex].time;
    }
    return null;
  }

  public startSelecting(): void {
    this.stopTimer();
    this.state = "SELECTING";
    this.notifyState();
  }

  public setCutoffTime(timestamp: number): boolean {
    if (this.allBars.length === 0) return false;
    // Find nearest bar at or before timestamp, or first bar if before all
    let bestIdx = 0;
    let minDiff = Infinity;
    for (let i = 0; i < this.allBars.length; i++) {
      const diff = Math.abs(this.allBars[i].time - timestamp);
      if (diff < minDiff) {
        minDiff = diff;
        bestIdx = i;
      }
    }

    this.cursorIndex = Math.max(0, Math.min(this.allBars.length - 1, bestIdx));
    this.state = "PAUSED";
    this.notifyState();
    this.notifyTick(false);
    return true;
  }

  public setCursorIndex(index: number): boolean {
    if (this.allBars.length === 0) return false;
    this.stopTimer();
    this.cursorIndex = Math.max(0, Math.min(this.allBars.length - 1, Math.round(index)));
    if (this.state === "IDLE" || this.state === "SELECTING") {
      this.state = "PAUSED";
      this.notifyState();
    } else if (this.state === "PLAYING") {
      this.state = "PAUSED";
      this.notifyState();
    }
    this.notifyTick(false);
    return true;
  }

  public play(): void {
    if (this.state === "IDLE" || this.cursorIndex >= this.allBars.length - 1) {
      return;
    }
    if (this.state === "SELECTING" && this.cursorIndex < 0 && this.allBars.length > 0) {
      this.cursorIndex = Math.max(0, this.allBars.length - 30);
    }

    this.state = "PLAYING";
    this.notifyState();

    this.stopTimer();
    this.timer = setInterval(() => {
      this.stepForward();
    }, this.playbackIntervalMs);
  }

  public pause(): void {
    this.stopTimer();
    if (this.state === "PLAYING") {
      this.state = "PAUSED";
      this.notifyState();
    }
  }

  public stepForward(): boolean {
    if (this.state === "SELECTING" && this.cursorIndex < 0 && this.allBars.length > 0) {
      this.cursorIndex = Math.max(0, this.allBars.length - 30);
      this.state = "PAUSED";
      this.notifyState();
    }

    if (this.cursorIndex >= this.allBars.length - 1) {
      this.pause();
      this.listeners.forEach((l) => l.onEnd?.());
      return false;
    }

    this.cursorIndex += 1;
    this.notifyTick(true);
    return true;
  }

  public stepBackward(): boolean {
    if (this.cursorIndex <= 0) {
      return false;
    }

    this.stopTimer();
    if (this.state === "PLAYING") {
      this.state = "PAUSED";
      this.notifyState();
    }

    this.cursorIndex -= 1;
    this.notifyTick(false);
    return true;
  }

  public setSpeed(intervalMs: number): void {
    this.playbackIntervalMs = Math.max(50, intervalMs);
    if (this.state === "PLAYING") {
      this.stopTimer();
      this.timer = setInterval(() => {
        this.stepForward();
      }, this.playbackIntervalMs);
    }
  }

  public exitReplay(): void {
    this.stopTimer();
    this.state = "IDLE";
    this.cursorIndex = -1;
    this.notifyState();
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private notifyState(): void {
    this.listeners.forEach((l) => l.onStateChange?.(this.state));
  }

  private notifyTick(isForwardStep: boolean = false): void {
    if (this.cursorIndex >= 0 && this.cursorIndex < this.allBars.length) {
      const currentBar = this.allBars[this.cursorIndex];
      this.listeners.forEach((l) =>
        l.onTick?.(currentBar, this.cursorIndex, this.allBars.length, isForwardStep)
      );
    }
  }
}

export const replayEngine = new BarReplayEngine();
