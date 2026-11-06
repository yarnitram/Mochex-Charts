/**
 * Custom Script Persistence & Management Store
 * Handles localStorage persistence for user-created custom indicators and strategies in Mochex.
 */

export interface CustomScript {
  id: string;
  name: string;
  description: string;
  code: string;
  type: "indicator" | "strategy";
  createdAt: number;
  updatedAt: number;
  color?: string;
  isPublished?: boolean;
}

const STORAGE_KEY = "mochex:custom_scripts";
const DRAFT_KEY = "mochex:script_studio_draft";

export const DEFAULT_STARTER_SCRIPT = `/**
 * Custom Technical Analysis Indicator
 * @param {Array} bars - Candlestick dataset [{ time, open, high, low, close, volume }]
 * @param {Object} inputs - User configurable parameters
 * @param {Object} ta - Technical analysis library (ta.rsi, ta.sma, ta.ema, ta.macd, ta.atr)
 * @param {Object} strategy - Pine-style strategy tester (strategy.at(i).entry, exit, close)
 * @param {Function} alertcondition - Real-time alert emitter
 */
function calculate(bars, inputs, ta, strategy, alertcondition) {
  const period = inputs.period || 20;
  const closes = bars.map(b => b.close);
  const ema = ta.ema(closes, period);

  // Return points to render as an overlay line on the chart
  return bars.map((bar, i) => ({
    time: bar.time,
    value: ema[i] !== undefined ? ema[i] : bar.close
  }));
}`;

export const DEFAULT_FVG_SCRIPT = `/**
 * Mochex Custom Indicator: Unmitigated Fair Value Gaps (0% Wick Touch) [v7]
 * Plots 0% mitigated FVG levels, caps historical unmitigated gaps locally, and emits alerts on newly formed gaps.
 */
function calculate(bars, inputs, ta, strategy, alertcondition) {
  if (!bars || bars.length < 3) return { boxes: [], data: [] };
  const showMidLine = inputs.showMidLine !== undefined ? inputs.showMidLine : true;
  const minGapPct = inputs.minGapPct !== undefined ? inputs.minGapPct : 0.05;

  const activeFvgs = [];

  for (let i = 2; i < bars.length; i++) {
    const c1 = bars[i - 2];
    const c3 = bars[i];

    // 1. Bullish FVG: Candle 1 High < Candle 3 Low
    if (c3.low > c1.high) {
      const top = c3.low;
      const bottom = c1.high;
      const gapPct = ((top - bottom) / bottom) * 100;

      if (gapPct >= minGapPct) {
        activeFvgs.push({
          id: "bull-" + i,
          type: "BULLISH",
          createdIndex: i,
          startTime: c1.time,
          endTime: c3.time,
          top: top,
          bottom: bottom,
          mid: (top + bottom) / 2,
          color: "#00c087",
          fillColor: "rgba(0, 192, 135, 0.18)",
          label: "Bull FVG",
          showMidLine: showMidLine,
        });

        if (typeof alertcondition === "function" && i === bars.length - 1) {
          alertcondition(true, "New Bullish FVG", "Unmitigated Bullish FVG formed at " + bottom.toFixed(2) + " - " + top.toFixed(2));
        }
      }
    }

    // 2. Bearish FVG: Candle 1 Low > Candle 3 High
    if (c3.high < c1.low) {
      const top = c1.low;
      const bottom = c3.high;
      const gapPct = ((top - bottom) / bottom) * 100;

      if (gapPct >= minGapPct) {
        activeFvgs.push({
          id: "bear-" + i,
          type: "BEARISH",
          createdIndex: i,
          startTime: c1.time,
          endTime: c3.time,
          top: top,
          bottom: bottom,
          mid: (top + bottom) / 2,
          color: "#ff3b30",
          fillColor: "rgba(255, 59, 48, 0.18)",
          label: "Bear FVG",
          showMidLine: showMidLine,
        });

        if (typeof alertcondition === "function" && i === bars.length - 1) {
          alertcondition(true, "New Bearish FVG", "Unmitigated Bearish FVG formed at " + bottom.toFixed(2) + " - " + top.toFixed(2));
        }
      }
    }

    // 3. Strict 0% Wick Touch Mitigation
    for (let f = activeFvgs.length - 1; f >= 0; f--) {
      const fvg = activeFvgs[f];
      if (i > fvg.createdIndex) {
        if ((fvg.type === "BULLISH" && c3.low <= fvg.top) ||
            (fvg.type === "BEARISH" && c3.high >= fvg.bottom)) {
          activeFvgs.splice(f, 1);
        }
      }
    }
  }

  // Only extend the 4 most recent Bullish and 4 most recent Bearish unmitigated FVGs to latestTime; cap older ones locally
  const latestTime = bars[bars.length - 1].time;
  const bullFvgs = activeFvgs.filter(f => f.type === "BULLISH");
  const bearFvgs = activeFvgs.filter(f => f.type === "BEARISH");
  const recentBull = bullFvgs.slice(-4);
  const recentBear = bearFvgs.slice(-4);

  for (const fvg of bullFvgs) {
    fvg.endTime = recentBull.includes(fvg)
      ? latestTime
      : bars[Math.min(bars.length - 1, fvg.createdIndex + 25)].time;
  }
  for (const fvg of bearFvgs) {
    fvg.endTime = recentBear.includes(fvg)
      ? latestTime
      : bars[Math.min(bars.length - 1, fvg.createdIndex + 25)].time;
  }

  return {
    boxes: activeFvgs,
    data: [],
  };
}`;

export const DEFAULT_OB_SCRIPT = `/**
 * Mochex Custom Indicator: Institutional Order Blocks (OB) [v7]
 * Identifies high-volume baseline candles before expansion moves with 50% Mean Threshold and mitigation capping.
 */
function calculate(bars, inputs, ta, strategy, alertcondition) {
  if (!bars || bars.length < 5) return { boxes: [], data: [] };
  const lookback = inputs.lookback || 3;
  const volMultiplier = inputs.volMultiplier || 1.1; // Volume multiplier (1.1x 20-period avg)
  const minBodyPct = inputs.minBodyPct || 0.0015; // Minimum candle body size (0.15%)

  const activeObs = [];

  function getAvgVol(endIdx, len = 20) {
    let sum = 0;
    let count = 0;
    for (let k = Math.max(0, endIdx - len + 1); k <= endIdx; k++) {
      sum += bars[k].volume || 1;
      count++;
    }
    return sum / (count || 1);
  }

  for (let i = lookback + 1; i < bars.length; i++) {
    const obCandle = bars[i - lookback];
    const avgVol = getAvgVol(i - lookback - 1, 20);
    const hasVolume = (obCandle.volume || 1) >= avgVol * volMultiplier;
    const bodySize = Math.abs(obCandle.close - obCandle.open);
    const bodyPct = bodySize / (obCandle.open || 1);

    // 1. Bullish Order Block (+OB): Bearish candle before strong upward expansion
    const isBearishCandle = obCandle.close < obCandle.open;
    const isBullishExpansion = bars[i].close > obCandle.high &&
                               bars[i - 1].close > obCandle.high;

    if (isBearishCandle && isBullishExpansion && hasVolume && bodyPct >= minBodyPct) {
      const top = Math.max(obCandle.open, obCandle.close);
      const bottom = obCandle.low;

      activeObs.push({
        id: "bull-ob-" + (i - lookback),
        type: "BULLISH",
        createdIndex: i - lookback,
        expansionIndex: i,
        startTime: obCandle.time,
        endTime: bars[i].time,
        top: top,
        bottom: bottom,
        mid: (top + bottom) / 2,
        color: "#089981",
        fillColor: "rgba(8, 153, 129, 0.22)",
        label: "+OB",
        showMidLine: true,
        mitigated: false,
        invalidated: false,
      });

      if (typeof alertcondition === "function" && i === bars.length - 1) {
        alertcondition(true, "New Bullish OB", "Bullish Order Block formed at " + bottom.toFixed(2) + " - " + top.toFixed(2));
      }
    }

    // 2. Bearish Order Block (-OB): Bullish candle before strong downward expansion
    const isBullishCandle = obCandle.close > obCandle.open;
    const isBearishExpansion = bars[i].close < obCandle.low &&
                               bars[i - 1].close < obCandle.low;

    if (isBullishCandle && isBearishExpansion && hasVolume && bodyPct >= minBodyPct) {
      const top = obCandle.high;
      const bottom = Math.min(obCandle.open, obCandle.close);

      activeObs.push({
        id: "bear-ob-" + (i - lookback),
        type: "BEARISH",
        createdIndex: i - lookback,
        expansionIndex: i,
        startTime: obCandle.time,
        endTime: bars[i].time,
        top: top,
        bottom: bottom,
        mid: (top + bottom) / 2,
        color: "#f23645",
        fillColor: "rgba(242, 54, 69, 0.22)",
        label: "-OB",
        showMidLine: true,
        mitigated: false,
        invalidated: false,
      });

      if (typeof alertcondition === "function" && i === bars.length - 1) {
        alertcondition(true, "New Bearish OB", "Bearish Order Block formed at " + bottom.toFixed(2) + " - " + top.toFixed(2));
      }
    }

    // 3. Mitigation & Invalidation Check
    for (let k = activeObs.length - 1; k >= 0; k--) {
      const ob = activeObs[k];
      if (!ob.invalidated && !ob.mitigated && i > ob.expansionIndex) {
        if (ob.type === "BULLISH") {
          if (bars[i].low < ob.bottom) {
            ob.invalidated = true;
            ob.endTime = bars[i].time;
          } else if (bars[i].low <= ob.top && bars[i].high >= ob.bottom) {
            ob.mitigated = true;
            ob.endTime = bars[i].time;
            ob.fillColor = "rgba(8, 153, 129, 0.10)";
            ob.label = "+OB (Mitigated)";
          }
        } else {
          if (bars[i].high > ob.top) {
            ob.invalidated = true;
            ob.endTime = bars[i].time;
          } else if (bars[i].high >= ob.bottom && bars[i].low <= ob.top) {
            ob.mitigated = true;
            ob.endTime = bars[i].time;
            ob.fillColor = "rgba(242, 54, 69, 0.10)";
            ob.label = "-OB (Mitigated)";
          }
        }
      }
    }
  }

  // Only extend the 3 most recent unmitigated Bullish and Bearish OBs to latestTime; cap older ones locally
  const latestTime = bars[bars.length - 1].time;
  const validObs = activeObs.filter(ob => !ob.invalidated);
  const unmitigatedBull = validObs.filter(ob => ob.type === "BULLISH" && !ob.mitigated);
  const unmitigatedBear = validObs.filter(ob => ob.type === "BEARISH" && !ob.mitigated);
  const recentBull = unmitigatedBull.slice(-3);
  const recentBear = unmitigatedBear.slice(-3);

  for (const ob of unmitigatedBull) {
    ob.endTime = recentBull.includes(ob)
      ? latestTime
      : bars[Math.min(bars.length - 1, ob.createdIndex + 25)].time;
  }
  for (const ob of unmitigatedBear) {
    ob.endTime = recentBear.includes(ob)
      ? latestTime
      : bars[Math.min(bars.length - 1, ob.createdIndex + 25)].time;
  }

  return {
    boxes: validObs,
    data: [],
  };
}`;

export const DEFAULT_MARKET_STRUCTURE_SCRIPT = `/**
 * Mochex Custom Indicator: True Market Structure & Substructure (Classic ZigZag)
 * Calculates Swing Highs/Lows, Major Swings, Internal Substructure, BOS, and CHoCH.
 */
function calculate(bars, inputs, ta, strategy, alertcondition) {
  const majorLen = inputs.majorLength || 10;
  const subLen = inputs.subLength || 4;
  const confirmation = inputs.confirmation || "close";

  // Raw pivot finder
  function findPivots(len) {
    const p = [];
    for (let i = len; i < bars.length - len; i++) {
      let isH = true, isL = true;
      for (let k = 1; k <= len; k++) {
        if (bars[i - k].high >= bars[i].high || bars[i + k].high > bars[i].high) isH = false;
        if (bars[i - k].low <= bars[i].low || bars[i + k].low < bars[i].low) isL = false;
      }
      if (isH) p.push({ type: "HIGH", price: bars[i].high, time: bars[i].time, idx: i });
      if (isL) p.push({ type: "LOW", price: bars[i].low, time: bars[i].time, idx: i });
    }
    return p.sort((a, b) => a.idx - b.idx);
  }

  // Alternating ZigZag
  function buildZigZag(pivots) {
    const zz = [];
    for (const pt of pivots) {
      if (zz.length === 0) { zz.push(pt); continue; }
      const last = zz[zz.length - 1];
      if (last.type === pt.type) {
        if (pt.type === "HIGH" && pt.price > last.price) zz[zz.length - 1] = pt;
        else if (pt.type === "LOW" && pt.price < last.price) zz[zz.length - 1] = pt;
      } else {
        zz.push(pt);
      }
    }
    return zz;
  }

  const majorPivots = buildZigZag(findPivots(majorLen));
  
  return majorPivots.map(p => ({
    time: p.time,
    value: p.price
  }));
}`;

export const DEFAULT_CANDLE_STRUCTURE_SCRIPT = `/**
 * Mochex Custom Indicator: Candlestick Market Structure (Price Action)
 * Detects 3-bar / 5-bar Candlestick Swings (SH/SL) and Market Structure Shifts (MSS/BOS).
 */
function calculate(bars, inputs, ta, strategy, alertcondition) {
  const flank = inputs.flankBars || 1;
  const confirmation = inputs.breakoutConfirmation || "close";

  const swings = [];
  for (let i = flank; i < bars.length - flank; i++) {
    const cur = bars[i];
    let isH = true, isL = true;
    for (let k = 1; k <= flank; k++) {
      if (bars[i - k].high >= cur.high || bars[i + k].high > cur.high) isH = false;
      if (bars[i - k].low <= cur.low || bars[i + k].low < cur.low) isL = false;
    }
    if (isH) swings.push({ time: cur.time, value: cur.high, type: "HIGH" });
    if (isL) swings.push({ time: cur.time, value: cur.low, type: "LOW" });
  }

  return swings.sort((a, b) => a.time - b.time).map(s => ({ time: s.time, value: s.value }));
}`;

export const DEFAULT_PHANTOM_SMC_SCRIPT = `/**
 * Mochex Custom Indicator: Phantom SMC (Smart Money Concepts) [v7]
 * High-probability institutional Supply & Demand zones anchored to the exact base candle,
 * liquidity sweeps, Change of Character (CHoCH) confirmation entries, forward-simulated
 * risk/reward position tool brackets (Red SL / Green TP1 1:3 & TP2 1:5), and mitigation capping.
 */
function calculate(bars, inputs, ta, strategy, alertcondition) {
  if (!bars || bars.length < 10) return { boxes: [], data: [] };

  const ltfSwingLen = inputs.ltfSwingLen || 3;
  const maxTapWindow = inputs.maxTapWindow || 25;
  const rrTP1 = inputs.rrTP1 || 3.0;
  const rrTP2 = inputs.rrTP2 || 5.0;
  const showPositionTool = inputs.showPositionTool !== undefined ? inputs.showPositionTool : true;
  const posBoxOpacity = inputs.posBoxOpacity || 0.35;

  const demandZones = [];
  const supplyZones = [];
  const positionBoxes = [];

  let lastDemandTapIndex = -1;
  let lastSupplyTapIndex = -1;
  let lastTappedDemand = null;
  let lastTappedSupply = null;
  let lastTradeExitIndex = -1;

  function isPivotHigh(idx, len) {
    if (idx < len || idx >= bars.length - len) return false;
    const h = bars[idx].high;
    for (let k = idx - len; k <= idx + len; k++) {
      if (k !== idx && bars[k].high >= h) return false;
    }
    return true;
  }

  function isPivotLow(idx, len) {
    if (idx < len || idx >= bars.length - len) return false;
    const l = bars[idx].low;
    for (let k = idx - len; k <= idx + len; k++) {
      if (k !== idx && bars[k].low <= l) return false;
    }
    return true;
  }

  let lastPivotHigh = null;
  let lastPivotLow = null;

  for (let i = 3; i < bars.length; i++) {
    const c0 = bars[i];
    const c1 = bars[i - 1];
    const c2 = bars[i - 2];
    const c3 = bars[i - 3];

    // 1. Bullish Demand POI (Liquidity Sweep + FVG Displacement)
    const sweptLow = c2.low < c3.low || c1.low < c2.low;
    const bullishBody = c1.close > c1.open && (c1.close - c1.open) >= (c1.high - c1.low) * 0.35;
    const breaksHigh = c1.close > c2.high;
    const hasDemandFvg = c0.low > c2.high || (c1.close - c1.open) > ((c1.high - c1.low) * 0.4);

    if (sweptLow && bullishBody && (breaksHigh || hasDemandFvg)) {
      const top = Math.max(c1.open, c2.close);
      const bottom = Math.min(c1.low, c2.low);
      const startTime = (c2.low < c3.low) ? c2.time : c1.time;

      if (top > bottom) {
        demandZones.push({
          id: "demand-" + i,
          type: "DEMAND",
          createdIndex: i,
          startTime: startTime,
          endTime: c0.time,
          top: top,
          bottom: bottom,
          mid: (top + bottom) / 2,
          color: "#00897b",
          fillColor: "rgba(0, 137, 123, 0.22)",
          label: "Demand POI",
          showMidLine: true,
          mitigated: false,
          invalidated: false,
        });
      }
    }

    // 2. Bearish Supply POI (Liquidity Sweep + FVG Displacement)
    const sweptHigh = c2.high > c3.high || c1.high > c2.high;
    const bearishBody = c1.close < c1.open && (c1.open - c1.close) >= (c1.high - c1.low) * 0.35;
    const breaksLow = c1.close < c2.low;
    const hasSupplyFvg = c0.high < c2.low || (c1.open - c1.close) > ((c1.high - c1.low) * 0.4);

    if (sweptHigh && bearishBody && (breaksLow || hasSupplyFvg)) {
      const top = Math.max(c1.high, c2.high);
      const bottom = Math.min(c1.open, c2.close);
      const startTime = (c2.high > c3.high) ? c2.time : c1.time;

      if (top > bottom) {
        supplyZones.push({
          id: "supply-" + i,
          type: "SUPPLY",
          createdIndex: i,
          startTime: startTime,
          endTime: c0.time,
          top: top,
          bottom: bottom,
          mid: (top + bottom) / 2,
          color: "#d81b60",
          fillColor: "rgba(216, 27, 96, 0.22)",
          label: "Supply POI",
          showMidLine: true,
          mitigated: false,
          invalidated: false,
        });
      }
    }

    // 3. Monitor Taps and Invalidation
    for (const d of demandZones) {
      if (!d.mitigated && !d.invalidated && i > d.createdIndex) {
        if (c0.close < d.bottom) {
          d.invalidated = true;
          d.endTime = c0.time;
        } else if (c0.low <= d.top && c0.high >= d.bottom) {
          d.mitigated = true;
          d.endTime = c0.time;
          d.fillColor = "rgba(0, 137, 123, 0.08)";
          d.label = "Demand (Mitigated)";
          lastDemandTapIndex = i;
          lastTappedDemand = d;
        }
      }
    }

    for (const s of supplyZones) {
      if (!s.mitigated && !s.invalidated && i > s.createdIndex) {
        if (c0.close > s.top) {
          s.invalidated = true;
          s.endTime = c0.time;
        } else if (c0.high >= s.bottom && c0.low <= s.top) {
          s.mitigated = true;
          s.endTime = c0.time;
          s.fillColor = "rgba(216, 27, 96, 0.08)";
          s.label = "Supply (Mitigated)";
          lastSupplyTapIndex = i;
          lastTappedSupply = s;
        }
      }
    }

    // 4. Track Pivots for CHoCH
    if (isPivotHigh(i - ltfSwingLen, ltfSwingLen)) {
      lastPivotHigh = { index: i - ltfSwingLen, price: bars[i - ltfSwingLen].high };
    }
    if (isPivotLow(i - ltfSwingLen, ltfSwingLen)) {
      lastPivotLow = { index: i - ltfSwingLen, price: bars[i - ltfSwingLen].low };
    }

    // 5. Detect CHoCH Triggers & Forward Simulate Trade Trajectory
    const cooldownOk = i > lastTradeExitIndex;
    const withinDemandTap = lastDemandTapIndex >= 0 && (i - lastDemandTapIndex <= maxTapWindow);
    const validPivotHigh = lastPivotHigh && (lastPivotHigh.index >= lastDemandTapIndex - 5) && (i - lastPivotHigh.index <= maxTapWindow);

    if (cooldownOk && withinDemandTap && validPivotHigh && c0.close > lastPivotHigh.price && bars[i - 1].close <= lastPivotHigh.price) {
      const entryPrice = c0.close;
      const structLow = lastTappedDemand ? Math.min(lastTappedDemand.bottom, c0.low) : c0.low;
      const sl = structLow * 0.998;
      const riskDist = Math.max(entryPrice - sl, entryPrice * 0.002);
      const tp1 = entryPrice + (riskDist * rrTP1);
      const tp2 = entryPrice + (riskDist * rrTP2);

      const maxSimIndex = Math.min(bars.length - 1, i + 40);
      let tp1Hit = false;
      let tp1EndTime = bars[maxSimIndex].time;
      let tp2EndTime = bars[maxSimIndex].time;
      let slEndTime = bars[maxSimIndex].time;
      let tradeExitIndex = maxSimIndex;

      for (let m = i + 1; m <= maxSimIndex; m++) {
        const b = bars[m];
        if (!tp1Hit && b.high >= tp1) {
          tp1Hit = true;
          tp1EndTime = b.time;
        }
        const currentSl = tp1Hit ? entryPrice : sl;
        if (b.low <= currentSl) {
          if (!tp1Hit) tp1EndTime = b.time;
          tp2EndTime = b.time;
          slEndTime = b.time;
          tradeExitIndex = m;
          break;
        }
        if (b.high >= tp2) {
          tp2EndTime = b.time;
          slEndTime = b.time;
          tradeExitIndex = m;
          break;
        }
      }

      if (showPositionTool) {
        positionBoxes.push({
          id: "pos-risk-" + i,
          startTime: c0.time,
          endTime: slEndTime,
          top: entryPrice,
          bottom: sl,
          color: "#e53935",
          fillColor: "rgba(229, 57, 53, " + posBoxOpacity + ")",
          label: tp1Hit ? "SL: BE (" + entryPrice.toFixed(2) + ")" : "SL: " + sl.toFixed(2),
        });
        positionBoxes.push({
          id: "pos-tp1-" + i,
          startTime: c0.time,
          endTime: tp1EndTime,
          top: tp1,
          bottom: entryPrice,
          color: "#00c853",
          fillColor: "rgba(0, 200, 83, " + posBoxOpacity + ")",
          label: "TP1 (" + rrTP1 + "R): " + tp1.toFixed(2),
        });
        positionBoxes.push({
          id: "pos-tp2-" + i,
          startTime: c0.time,
          endTime: tp2EndTime,
          top: tp2,
          bottom: tp1,
          color: "#00c853",
          fillColor: "rgba(0, 200, 83, " + (posBoxOpacity * 0.5) + ")",
          label: "TP2 (" + rrTP2 + "R): " + tp2.toFixed(2),
        });
      }

      if (typeof alertcondition === "function" && i === bars.length - 1) {
        alertcondition(true, "Phantom SMC Long CHoCH", "Bullish CHoCH Entry at " + entryPrice.toFixed(2) + " (TP1: " + tp1.toFixed(2) + ", SL: " + sl.toFixed(2) + ")");
      }

      lastTradeExitIndex = tradeExitIndex;
      lastDemandTapIndex = -1;
      lastTappedDemand = null;
      lastPivotHigh = null;
    }

    const withinSupplyTap = lastSupplyTapIndex >= 0 && (i - lastSupplyTapIndex <= maxTapWindow);
    const validPivotLow = lastPivotLow && (lastPivotLow.index >= lastSupplyTapIndex - 5) && (i - lastPivotLow.index <= maxTapWindow);

    if (cooldownOk && withinSupplyTap && validPivotLow && c0.close < lastPivotLow.price && bars[i - 1].close >= lastPivotLow.price) {
      const entryPrice = c0.close;
      const structHigh = lastTappedSupply ? Math.max(lastTappedSupply.top, c0.high) : c0.high;
      const sl = structHigh * 1.002;
      const riskDist = Math.max(sl - entryPrice, entryPrice * 0.002);
      const tp1 = entryPrice - (riskDist * rrTP1);
      const tp2 = entryPrice - (riskDist * rrTP2);

      const maxSimIndex = Math.min(bars.length - 1, i + 40);
      let tp1Hit = false;
      let tp1EndTime = bars[maxSimIndex].time;
      let tp2EndTime = bars[maxSimIndex].time;
      let slEndTime = bars[maxSimIndex].time;
      let tradeExitIndex = maxSimIndex;

      for (let m = i + 1; m <= maxSimIndex; m++) {
        const b = bars[m];
        if (!tp1Hit && b.low <= tp1) {
          tp1Hit = true;
          tp1EndTime = b.time;
        }
        const currentSl = tp1Hit ? entryPrice : sl;
        if (b.high >= currentSl) {
          if (!tp1Hit) tp1EndTime = b.time;
          tp2EndTime = b.time;
          slEndTime = b.time;
          tradeExitIndex = m;
          break;
        }
        if (b.low <= tp2) {
          tp2EndTime = b.time;
          slEndTime = b.time;
          tradeExitIndex = m;
          break;
        }
      }

      if (showPositionTool) {
        positionBoxes.push({
          id: "pos-risk-" + i,
          startTime: c0.time,
          endTime: slEndTime,
          top: sl,
          bottom: entryPrice,
          color: "#e53935",
          fillColor: "rgba(229, 57, 53, " + posBoxOpacity + ")",
          label: tp1Hit ? "SL: BE (" + entryPrice.toFixed(2) + ")" : "SL: " + sl.toFixed(2),
        });
        positionBoxes.push({
          id: "pos-tp1-" + i,
          startTime: c0.time,
          endTime: tp1EndTime,
          top: entryPrice,
          bottom: tp1,
          color: "#00c853",
          fillColor: "rgba(0, 200, 83, " + posBoxOpacity + ")",
          label: "TP1 (" + rrTP1 + "R): " + tp1.toFixed(2),
        });
        positionBoxes.push({
          id: "pos-tp2-" + i,
          startTime: c0.time,
          endTime: tp2EndTime,
          top: tp1,
          bottom: tp2,
          color: "#00c853",
          fillColor: "rgba(0, 200, 83, " + (posBoxOpacity * 0.5) + ")",
          label: "TP2 (" + rrTP2 + "R): " + tp2.toFixed(2),
        });
      }

      if (typeof alertcondition === "function" && i === bars.length - 1) {
        alertcondition(true, "Phantom SMC Short CHoCH", "Bearish CHoCH Entry at " + entryPrice.toFixed(2) + " (TP1: " + tp1.toFixed(2) + ", SL: " + sl.toFixed(2) + ")");
      }

      lastTradeExitIndex = tradeExitIndex;
      lastSupplyTapIndex = -1;
      lastTappedSupply = null;
      lastPivotLow = null;
    }
  }

  const latestTime = bars[bars.length - 1].time;

  // Process unmitigated Demand zones: only extend recent 3 forward to latest candle
  const unmitigatedDemands = demandZones.filter(d => !d.invalidated && !d.mitigated);
  const recentDemands = unmitigatedDemands.slice(-3);
  for (const d of recentDemands) {
    d.endTime = latestTime;
  }
  for (const d of unmitigatedDemands) {
    if (!recentDemands.includes(d)) {
      d.endTime = bars[Math.min(bars.length - 1, d.createdIndex + 25)].time;
    }
  }

  // Process unmitigated Supply zones: only extend recent 3 forward to latest candle
  const unmitigatedSupplies = supplyZones.filter(s => !s.invalidated && !s.mitigated);
  const recentSupplies = unmitigatedSupplies.slice(-3);
  for (const s of recentSupplies) {
    s.endTime = latestTime;
  }
  for (const s of unmitigatedSupplies) {
    if (!recentSupplies.includes(s)) {
      s.endTime = bars[Math.min(bars.length - 1, s.createdIndex + 25)].time;
    }
  }

  const validDemands = demandZones.filter(d => !d.invalidated);
  const validSupplies = supplyZones.filter(s => !s.invalidated);
  const allBoxes = [...validDemands, ...validSupplies, ...positionBoxes];

  return {
    boxes: allBoxes,
    data: []
  };
}
`;

export const DEFAULT_PHANTOM_FLIP_SCRIPT = `/**
 * Mochex Custom Indicator: Phantom SMC MOD-02 (S2D & D2S Zone Flips) [v7]
 * Identifies institutional Supply-to-Demand and Demand-to-Supply flips,
 * tracks reaction failures and decisive opposing POI breaches, anchors the
 * flip zone to the exact origin base candle, caps mitigated zones at the tap bar,
 * and forward-simulates Long/Short Position Tool risk/reward boxes (Red SL / Green TP1 1:3 & TP2 1:5).
 */
function calculate(bars, inputs, ta, strategy, alertcondition) {
  if (!bars || bars.length < 10) return { boxes: [], data: [] };

  const minDisplacementPct = inputs.minDisplacementPct !== undefined ? inputs.minDisplacementPct : 0.002;
  const maxBarsRetest = inputs.maxBarsRetest || 40;
  const rrTP1 = inputs.rrTP1 || 3.0;
  const rrTP2 = inputs.rrTP2 || 5.0;
  const showPositionTool = inputs.showPositionTool !== undefined ? inputs.showPositionTool : true;
  const posBoxOpacity = inputs.posBoxOpacity || 0.35;

  const opposingSupplies = [];
  const opposingDemands = [];
  const flipZones = [];
  const positionBoxes = [];

  let lastTradeExitIndex = -1;

  for (let i = 3; i < bars.length; i++) {
    const c0 = bars[i];
    const c1 = bars[i - 1];
    const c2 = bars[i - 2];
    const c3 = bars[i - 3];

    // 1. Detect HTF Opposing Supply Candidates
    const sweptHigh = c2.high > c3.high || c1.high > c2.high;
    const bearishImpulse = c1.close < c1.open && (c1.open - c1.close) >= (c1.high - c1.low) * 0.3;
    if (sweptHigh && bearishImpulse) {
      const top = Math.max(c1.high, c2.high);
      const bottom = Math.min(c1.open, c2.close);
      if (top > bottom) {
        opposingSupplies.push({
          id: "opp-supply-" + i,
          type: "SUPPLY",
          createdIndex: i,
          startTime: (c2.high > c3.high) ? c2.time : c1.time,
          endTime: c0.time,
          top: top,
          bottom: bottom,
          color: "#d81b60",
          fillColor: "rgba(216, 27, 96, 0.15)",
          label: "Supply POI",
          breached: false,
          mitigated: false,
        });
      }
    }

    // 2. Detect HTF Opposing Demand Candidates
    const sweptLow = c2.low < c3.low || c1.low < c2.low;
    const bullishImpulse = c1.close > c1.open && (c1.close - c1.open) >= (c1.high - c1.low) * 0.3;
    if (sweptLow && bullishImpulse) {
      const top = Math.max(c1.open, c2.close);
      const bottom = Math.min(c1.low, c2.low);
      if (top > bottom) {
        opposingDemands.push({
          id: "opp-demand-" + i,
          type: "DEMAND",
          createdIndex: i,
          startTime: (c2.low < c3.low) ? c2.time : c1.time,
          endTime: c0.time,
          top: top,
          bottom: bottom,
          color: "#00897b",
          fillColor: "rgba(0, 137, 123, 0.15)",
          label: "Demand POI",
          breached: false,
          mitigated: false,
        });
      }
    }

    // 3. Monitor Opposing POI Taps & Breaches -> Create S2D / D2S Flip Bases
    for (const sp of opposingSupplies) {
      if (!sp.breached && i > sp.createdIndex) {
        if (i - sp.createdIndex > 60) {
          sp.breached = true; // Expire old unbreached opposing candidate
          continue;
        }
        const isBreached = c0.close > sp.top && (c0.close - c0.open) >= (c0.close * minDisplacementPct);
        if (isBreached) {
          sp.breached = true;
          sp.endTime = c0.time;

          let baseIdx = i - 1;
          let lowestLow = bars[i - 1].low;
          for (let k = i - 1; k >= Math.max(0, i - 8); k--) {
            if (bars[k].low <= lowestLow) {
              lowestLow = bars[k].low;
              baseIdx = k;
            }
          }

          const baseCandle = bars[baseIdx];
          const flipTop = Math.max(baseCandle.open, baseCandle.close);
          const flipBottom = baseCandle.low;

          flipZones.push({
            id: "flip-s2d-" + i,
            type: "S2D_FLIP",
            createdIndex: i,
            startTime: baseCandle.time,
            endTime: c0.time,
            top: flipTop,
            bottom: flipBottom,
            mid: (flipTop + flipBottom) / 2,
            color: "#ff9800",
            fillColor: "rgba(255, 152, 0, 0.25)",
            label: "S2D Flip Demand",
            showMidLine: true,
            isDemandFlip: true,
            mitigated: false,
            invalidated: false,
          });
        } else if (!sp.mitigated && c0.high >= sp.bottom && c0.low <= sp.top) {
          sp.mitigated = true;
          sp.endTime = c0.time;
        }
      }
    }

    for (const dp of opposingDemands) {
      if (!dp.breached && i > dp.createdIndex) {
        if (i - dp.createdIndex > 60) {
          dp.breached = true;
          continue;
        }
        const isBreached = c0.close < dp.bottom && (c0.open - c0.close) >= (c0.close * minDisplacementPct);
        if (isBreached) {
          dp.breached = true;
          dp.endTime = c0.time;

          let baseIdx = i - 1;
          let highestHigh = bars[i - 1].high;
          for (let k = i - 1; k >= Math.max(0, i - 8); k--) {
            if (bars[k].high >= highestHigh) {
              highestHigh = bars[k].high;
              baseIdx = k;
            }
          }

          const baseCandle = bars[baseIdx];
          const flipTop = baseCandle.high;
          const flipBottom = Math.min(baseCandle.open, baseCandle.close);

          flipZones.push({
            id: "flip-d2s-" + i,
            type: "D2S_FLIP",
            createdIndex: i,
            startTime: baseCandle.time,
            endTime: c0.time,
            top: flipTop,
            bottom: flipBottom,
            mid: (flipTop + flipBottom) / 2,
            color: "#9c27b0",
            fillColor: "rgba(156, 39, 176, 0.25)",
            label: "D2S Flip Supply",
            showMidLine: true,
            isDemandFlip: false,
            mitigated: false,
            invalidated: false,
          });
        } else if (!dp.mitigated && c0.low <= dp.top && c0.high >= dp.bottom) {
          dp.mitigated = true;
          dp.endTime = c0.time;
        }
      }
    }

    // 4. Evaluate Retest Taps into Flip Bases & Forward-Simulate Trades
    for (const fz of flipZones) {
      if (!fz.invalidated && !fz.mitigated && i > fz.createdIndex) {
        const barsSinceCreate = i - fz.createdIndex;

        if (fz.isDemandFlip) {
          if (c0.close < fz.bottom) {
            fz.invalidated = true;
            fz.endTime = c0.time;
          } else if (c0.low <= fz.top && c0.high >= fz.bottom) {
            fz.mitigated = true;
            fz.endTime = c0.time;
            fz.fillColor = "rgba(255, 152, 0, 0.12)";
            fz.label = "S2D Flip (Mitigated)";

            const candleRange = Math.max(c0.high - c0.low, 0.00001);
            const lowerWick = Math.min(c0.open, c0.close) - c0.low;
            const hasRejection = (c0.close > c0.open) || (lowerWick / candleRange >= 0.25);

            if (hasRejection && barsSinceCreate <= maxBarsRetest && i > lastTradeExitIndex) {
              const entryPrice = c0.close;
              const sl = fz.bottom * 0.998;
              const riskDist = Math.max(entryPrice - sl, entryPrice * 0.002);
              const tp1 = entryPrice + (riskDist * rrTP1);
              const tp2 = entryPrice + (riskDist * rrTP2);

              const maxSimIndex = Math.min(bars.length - 1, i + 40);
              let tp1Hit = false;
              let tp1EndTime = bars[maxSimIndex].time;
              let tp2EndTime = bars[maxSimIndex].time;
              let slEndTime = bars[maxSimIndex].time;
              let tradeExitIndex = maxSimIndex;

              for (let m = i + 1; m <= maxSimIndex; m++) {
                const b = bars[m];
                if (!tp1Hit && b.high >= tp1) {
                  tp1Hit = true;
                  tp1EndTime = b.time;
                }
                const currentSl = tp1Hit ? entryPrice : sl;
                if (b.low <= currentSl) {
                  if (!tp1Hit) tp1EndTime = b.time;
                  tp2EndTime = b.time;
                  slEndTime = b.time;
                  tradeExitIndex = m;
                  break;
                }
                if (b.high >= tp2) {
                  tp2EndTime = b.time;
                  slEndTime = b.time;
                  tradeExitIndex = m;
                  break;
                }
              }

              if (showPositionTool) {
                positionBoxes.push({
                  id: "pos-risk-" + i,
                  startTime: c0.time,
                  endTime: slEndTime,
                  top: entryPrice,
                  bottom: sl,
                  color: "#e53935",
                  fillColor: "rgba(229, 57, 53, " + posBoxOpacity + ")",
                  label: tp1Hit ? "SL: BE (" + entryPrice.toFixed(2) + ")" : "SL: " + sl.toFixed(2),
                });
                positionBoxes.push({
                  id: "pos-tp1-" + i,
                  startTime: c0.time,
                  endTime: tp1EndTime,
                  top: tp1,
                  bottom: entryPrice,
                  color: "#00c853",
                  fillColor: "rgba(0, 200, 83, " + posBoxOpacity + ")",
                  label: "TP1 (1:3): " + tp1.toFixed(2),
                });
                positionBoxes.push({
                  id: "pos-tp2-" + i,
                  startTime: c0.time,
                  endTime: tp2EndTime,
                  top: tp2,
                  bottom: tp1,
                  color: "#00c853",
                  fillColor: "rgba(0, 200, 83, " + (posBoxOpacity * 0.5) + ")",
                  label: "TP2 (1:5): " + tp2.toFixed(2),
                });
              }

              lastTradeExitIndex = tradeExitIndex;

              if (typeof alertcondition === "function" && i === bars.length - 1) {
                alertcondition(true, "Phantom S2D Flip Long", "Bullish S2D Flip Retest Entry at " + entryPrice.toFixed(2) + " (TP1: " + tp1.toFixed(2) + ", SL: " + sl.toFixed(2) + ")");
              }
            }
          }
        } else {
          if (c0.close > fz.top) {
            fz.invalidated = true;
            fz.endTime = c0.time;
          } else if (c0.high >= fz.bottom && c0.low <= fz.top) {
            fz.mitigated = true;
            fz.endTime = c0.time;
            fz.fillColor = "rgba(156, 39, 176, 0.12)";
            fz.label = "D2S Flip (Mitigated)";

            const candleRange = Math.max(c0.high - c0.low, 0.00001);
            const upperWick = c0.high - Math.max(c0.open, c0.close);
            const hasRejection = (c0.close < c0.open) || (upperWick / candleRange >= 0.25);

            if (hasRejection && barsSinceCreate <= maxBarsRetest && i > lastTradeExitIndex) {
              const entryPrice = c0.close;
              const sl = fz.top * 1.002;
              const riskDist = Math.max(sl - entryPrice, entryPrice * 0.002);
              const tp1 = entryPrice - (riskDist * rrTP1);
              const tp2 = entryPrice - (riskDist * rrTP2);

              const maxSimIndex = Math.min(bars.length - 1, i + 40);
              let tp1Hit = false;
              let tp1EndTime = bars[maxSimIndex].time;
              let tp2EndTime = bars[maxSimIndex].time;
              let slEndTime = bars[maxSimIndex].time;
              let tradeExitIndex = maxSimIndex;

              for (let m = i + 1; m <= maxSimIndex; m++) {
                const b = bars[m];
                if (!tp1Hit && b.low <= tp1) {
                  tp1Hit = true;
                  tp1EndTime = b.time;
                }
                const currentSl = tp1Hit ? entryPrice : sl;
                if (b.high >= currentSl) {
                  if (!tp1Hit) tp1EndTime = b.time;
                  tp2EndTime = b.time;
                  slEndTime = b.time;
                  tradeExitIndex = m;
                  break;
                }
                if (b.low <= tp2) {
                  tp2EndTime = b.time;
                  slEndTime = b.time;
                  tradeExitIndex = m;
                  break;
                }
              }

              if (showPositionTool) {
                positionBoxes.push({
                  id: "pos-risk-" + i,
                  startTime: c0.time,
                  endTime: slEndTime,
                  top: sl,
                  bottom: entryPrice,
                  color: "#e53935",
                  fillColor: "rgba(229, 57, 53, " + posBoxOpacity + ")",
                  label: tp1Hit ? "SL: BE (" + entryPrice.toFixed(2) + ")" : "SL: " + sl.toFixed(2),
                });
                positionBoxes.push({
                  id: "pos-tp1-" + i,
                  startTime: c0.time,
                  endTime: tp1EndTime,
                  top: entryPrice,
                  bottom: tp1,
                  color: "#00c853",
                  fillColor: "rgba(0, 200, 83, " + posBoxOpacity + ")",
                  label: "TP1 (1:3): " + tp1.toFixed(2),
                });
                positionBoxes.push({
                  id: "pos-tp2-" + i,
                  startTime: c0.time,
                  endTime: tp2EndTime,
                  top: tp1,
                  bottom: tp2,
                  color: "#00c853",
                  fillColor: "rgba(0, 200, 83, " + (posBoxOpacity * 0.5) + ")",
                  label: "TP2 (1:5): " + tp2.toFixed(2),
                });
              }

              lastTradeExitIndex = tradeExitIndex;

              if (typeof alertcondition === "function" && i === bars.length - 1) {
                alertcondition(true, "Phantom D2S Flip Short", "Bearish D2S Flip Retest Entry at " + entryPrice.toFixed(2) + " (TP1: " + tp1.toFixed(2) + ", SL: " + sl.toFixed(2) + ")");
              }
            }
          }
        }
      }
    }
  }

  const latestTime = bars[bars.length - 1].time;

  // Only extend the 3 most recent unmitigated S2D and D2S flip zones to latestTime; cap older ones locally
  const validFlips = flipZones.filter(f => !f.invalidated);
  const unmitigatedS2D = validFlips.filter(f => f.isDemandFlip && !f.mitigated);
  const unmitigatedD2S = validFlips.filter(f => !f.isDemandFlip && !f.mitigated);
  const recentS2D = unmitigatedS2D.slice(-3);
  const recentD2S = unmitigatedD2S.slice(-3);

  for (const f of unmitigatedS2D) {
    f.endTime = recentS2D.includes(f)
      ? latestTime
      : bars[Math.min(bars.length - 1, f.createdIndex + 25)].time;
  }
  for (const f of unmitigatedD2S) {
    f.endTime = recentD2S.includes(f)
      ? latestTime
      : bars[Math.min(bars.length - 1, f.createdIndex + 25)].time;
  }

  // Only include the 2 most recent unbreached, unmitigated opposing POIs per side
  const recentOppSupply = opposingSupplies.filter(s => !s.breached && !s.mitigated).slice(-2);
  const recentOppDemand = opposingDemands.filter(d => !d.breached && !d.mitigated).slice(-2);
  for (const o of [...recentOppSupply, ...recentOppDemand]) {
    o.endTime = latestTime;
  }

  return {
    boxes: [...recentOppSupply, ...recentOppDemand, ...validFlips, ...positionBoxes],
    data: []
  };
}
`;

export const DEFAULT_PHANTOM_IDM_SCRIPT = `/**
 * Mochex Custom Indicator: Phantom SMC MOD-03 (Inducement Sweep & Trap Model) [v7]
 * Detects institutional Extreme Order Blocks with confirmed FVG imbalances,
 * tracks the first internal retracement pivot (IDM), monitors liquidity sweeps
 * penetrating the IDM into the Extreme POI, caps mitigated zones at the tap bar,
 * and forward-simulates Long/Short Position Tool risk/reward boxes (Red SL / Green TP1 1:3 & TP2 1:6).
 */
function calculate(bars, inputs, ta, strategy, alertcondition) {
  if (!bars || bars.length < 10) return { boxes: [], data: [] };

  const minFvgPct = inputs.minFvgPct !== undefined ? inputs.minFvgPct : 0.001;
  const minRejectionWickPct = inputs.minRejectionWickPct !== undefined ? inputs.minRejectionWickPct : 0.25;
  const maxBarsToSweep = inputs.maxBarsToSweep || 50;
  const rrTP1 = inputs.rrTP1 || 3.0;
  const rrTP2 = inputs.rrTP2 || 6.0;
  const showPositionTool = inputs.showPositionTool !== undefined ? inputs.showPositionTool : true;
  const posBoxOpacity = inputs.posBoxOpacity || 0.35;

  const extremeDemands = [];
  const extremeSupplies = [];
  const idmZones = [];
  const positionBoxes = [];

  let lastTradeExitIndex = -1;
  let lastSwingHigh = null;
  let lastSwingLow = null;

  for (let i = 3; i < bars.length; i++) {
    const c0 = bars[i];
    const c1 = bars[i - 1];
    const c2 = bars[i - 2];
    const c3 = bars[i - 3];

    // Local swing pivots (3-bar fractal)
    if (c2.high > c3.high && c2.high > c1.high) {
      lastSwingHigh = c2.high;
    }
    if (c2.low < c3.low && c2.low < c1.low) {
      lastSwingLow = c2.low;
    }

    // 1. Detect Bullish Extreme Demand (+OB with FVG and BOS)
    const isBullFvg = c0.low > c2.high && ((c0.low - c2.high) / c2.high >= minFvgPct);
    const isBullBos = lastSwingHigh !== null && c0.close > lastSwingHigh && c1.close <= lastSwingHigh;

    if (isBullFvg && isBullBos) {
      let originIdx = i - 2;
      let minLow = bars[originIdx].low;
      for (let k = i - 2; k >= Math.max(0, i - 6); k--) {
        if (bars[k].low <= minLow) {
          minLow = bars[k].low;
          originIdx = k;
        }
      }
      const baseCandle = bars[originIdx];
      const obTop = Math.max(baseCandle.open, baseCandle.close);
      const obBottom = baseCandle.low;

      if (obTop > obBottom) {
        extremeDemands.push({
          id: "extreme-demand-" + originIdx,
          type: "DEMAND",
          createdIndex: i,
          startTime: baseCandle.time,
          endTime: c0.time,
          top: obTop,
          bottom: obBottom,
          color: "#089981",
          fillColor: "rgba(8, 153, 129, 0.2)",
          label: "Extreme Demand (+OB)",
          isMitigated: false,
          isInvalidated: false,
          hasIdm: false,
          idm: null
        });
      }
    }

    // 2. Detect Bearish Extreme Supply (-OB with FVG and BOS)
    const isBearFvg = c0.high < c2.low && ((c2.low - c0.high) / c2.low >= minFvgPct);
    const isBearBos = lastSwingLow !== null && c0.close < lastSwingLow && c1.close >= lastSwingLow;

    if (isBearFvg && isBearBos) {
      let originIdx = i - 2;
      let maxHigh = bars[originIdx].high;
      for (let k = i - 2; k >= Math.max(0, i - 6); k--) {
        if (bars[k].high >= maxHigh) {
          maxHigh = bars[k].high;
          originIdx = k;
        }
      }
      const baseCandle = bars[originIdx];
      const obTop = baseCandle.high;
      const obBottom = Math.min(baseCandle.open, baseCandle.close);

      if (obTop > obBottom) {
        extremeSupplies.push({
          id: "extreme-supply-" + originIdx,
          type: "SUPPLY",
          createdIndex: i,
          startTime: baseCandle.time,
          endTime: c0.time,
          top: obTop,
          bottom: obBottom,
          color: "#f23645",
          fillColor: "rgba(242, 54, 69, 0.2)",
          label: "Extreme Supply (-OB)",
          isMitigated: false,
          isInvalidated: false,
          hasIdm: false,
          idm: null
        });
      }
    }

    // 3. Detect Inducement (IDM) for active unmitigated POIs
    for (let d = 0; d < extremeDemands.length; d++) {
      const poi = extremeDemands[d];
      if (!poi.isMitigated && !poi.isInvalidated && !poi.hasIdm && i > poi.createdIndex) {
        const isPivotLow = c1.low < c2.low && c1.low < c0.low;
        if (isPivotLow && c1.low > poi.top && c1.time > poi.startTime) {
          poi.hasIdm = true;
          const idmObj = {
            id: "idm-low-" + i,
            poiId: poi.id,
            isBullish: true,
            createdIndex: i,
            startTime: c1.time,
            endTime: c0.time,
            price: c1.low,
            top: c1.low,
            bottom: c1.low * 0.9995,
            color: "#f5ac37",
            fillColor: "rgba(245, 172, 55, 0.7)",
            label: "IDM Low",
            isSwept: false
          };
          poi.idm = idmObj;
          idmZones.push(idmObj);
        }
      }
    }

    for (let s = 0; s < extremeSupplies.length; s++) {
      const poi = extremeSupplies[s];
      if (!poi.isMitigated && !poi.isInvalidated && !poi.hasIdm && i > poi.createdIndex) {
        const isPivotHigh = c1.high > c2.high && c1.high > c0.high;
        if (isPivotHigh && c1.high < poi.bottom && c1.time > poi.startTime) {
          poi.hasIdm = true;
          const idmObj = {
            id: "idm-high-" + i,
            poiId: poi.id,
            isBullish: false,
            createdIndex: i,
            startTime: c1.time,
            endTime: c0.time,
            price: c1.high,
            top: c1.high * 1.0005,
            bottom: c1.high,
            color: "#f5ac37",
            fillColor: "rgba(245, 172, 55, 0.7)",
            label: "IDM High",
            isSwept: false
          };
          poi.idm = idmObj;
          idmZones.push(idmObj);
        }
      }
    }

    // 4. Evaluate POI Invalidation, Mitigation & Inducement Sweeps
    for (let d = 0; d < extremeDemands.length; d++) {
      const poi = extremeDemands[d];
      if (!poi.isInvalidated && !poi.isMitigated && i > poi.createdIndex) {
        if (poi.idm && !poi.idm.isSwept && c0.low < poi.idm.price) {
          poi.idm.isSwept = true;
          poi.idm.endTime = c0.time;
          poi.idm.color = "#888888";
          poi.idm.label = "IDM Swept";
        }

        if (c0.close < poi.bottom) {
          poi.isInvalidated = true;
          poi.endTime = c0.time;
          if (poi.idm && !poi.idm.isSwept) {
            poi.idm.isSwept = true;
            poi.idm.endTime = c0.time;
          }
        } else if (c0.low <= poi.top && c0.high >= poi.bottom) {
          poi.isMitigated = true;
          poi.endTime = c0.time;
          poi.fillColor = "rgba(8, 153, 129, 0.10)";
          poi.label = "Extreme Demand (Mitigated)";

          if (poi.hasIdm && poi.idm && (i - poi.idm.createdIndex <= maxBarsToSweep)) {
            poi.idm.isSwept = true;
            poi.idm.endTime = c0.time;
            poi.idm.color = "#888888";
            poi.idm.label = "IDM Swept (Buy)";

            const candleRange = Math.max(c0.high - c0.low, 0.0001);
            const lowerWick = Math.min(c0.open, c0.close) - c0.low;
            const hasWickRej = (lowerWick / candleRange >= minRejectionWickPct) && (c0.close >= poi.idm.price || c0.close >= poi.top);

            if (hasWickRej && i > lastTradeExitIndex) {
              const entryPrice = c0.close;
              const sl = Math.min(c0.low * 0.999, poi.bottom * 0.9995);
              const riskDist = Math.max(entryPrice - sl, 0.001);
              const tp1 = entryPrice + (riskDist * rrTP1);
              const tp2 = entryPrice + (riskDist * rrTP2);

              const maxSimIndex = Math.min(bars.length - 1, i + 40);
              let tp1Hit = false;
              let tp1EndTime = bars[maxSimIndex].time;
              let tp2EndTime = bars[maxSimIndex].time;
              let slEndTime = bars[maxSimIndex].time;
              let tradeExitIndex = maxSimIndex;

              for (let m = i + 1; m <= maxSimIndex; m++) {
                const b = bars[m];
                if (!tp1Hit && b.high >= tp1) {
                  tp1Hit = true;
                  tp1EndTime = b.time;
                }
                const currentSl = tp1Hit ? entryPrice : sl;
                if (b.low <= currentSl) {
                  if (!tp1Hit) tp1EndTime = b.time;
                  tp2EndTime = b.time;
                  slEndTime = b.time;
                  tradeExitIndex = m;
                  break;
                }
                if (b.high >= tp2) {
                  tp2EndTime = b.time;
                  slEndTime = b.time;
                  tradeExitIndex = m;
                  break;
                }
              }

              if (showPositionTool) {
                positionBoxes.push({
                  id: "pos-risk-" + i,
                  startTime: c0.time,
                  endTime: slEndTime,
                  top: entryPrice,
                  bottom: sl,
                  color: "#e53935",
                  fillColor: "rgba(229, 57, 53, " + posBoxOpacity + ")",
                  label: tp1Hit ? "SL: BE (" + entryPrice.toFixed(2) + ")" : "SL: " + sl.toFixed(2)
                });
                positionBoxes.push({
                  id: "pos-tp1-" + i,
                  startTime: c0.time,
                  endTime: tp1EndTime,
                  top: tp1,
                  bottom: entryPrice,
                  color: "#00c853",
                  fillColor: "rgba(0, 200, 83, " + posBoxOpacity + ")",
                  label: "TP1 (1:3): " + tp1.toFixed(2)
                });
                positionBoxes.push({
                  id: "pos-tp2-" + i,
                  startTime: c0.time,
                  endTime: tp2EndTime,
                  top: tp2,
                  bottom: tp1,
                  color: "#00c853",
                  fillColor: "rgba(0, 200, 83, " + (posBoxOpacity * 0.5) + ")",
                  label: "TP2 (1:6): " + tp2.toFixed(2)
                });
              }

              lastTradeExitIndex = tradeExitIndex;

              if (typeof alertcondition === "function" && i === bars.length - 1) {
                alertcondition(true, "Phantom IDM Long Entry", "[Phantom IDM] Bullish IDM swept into Extreme Demand! Long entry triggered.");
              }
            }
          }
        }
      }
    }

    for (let s = 0; s < extremeSupplies.length; s++) {
      const poi = extremeSupplies[s];
      if (!poi.isInvalidated && !poi.isMitigated && i > poi.createdIndex) {
        if (poi.idm && !poi.idm.isSwept && c0.high > poi.idm.price) {
          poi.idm.isSwept = true;
          poi.idm.endTime = c0.time;
          poi.idm.color = "#888888";
          poi.idm.label = "IDM Swept";
        }

        if (c0.close > poi.top) {
          poi.isInvalidated = true;
          poi.endTime = c0.time;
          if (poi.idm && !poi.idm.isSwept) {
            poi.idm.isSwept = true;
            poi.idm.endTime = c0.time;
          }
        } else if (c0.high >= poi.bottom && c0.low <= poi.top) {
          poi.isMitigated = true;
          poi.endTime = c0.time;
          poi.fillColor = "rgba(242, 54, 69, 0.10)";
          poi.label = "Extreme Supply (Mitigated)";

          if (poi.hasIdm && poi.idm && (i - poi.idm.createdIndex <= maxBarsToSweep)) {
            poi.idm.isSwept = true;
            poi.idm.endTime = c0.time;
            poi.idm.color = "#888888";
            poi.idm.label = "IDM Swept (Sell)";

            const candleRange = Math.max(c0.high - c0.low, 0.0001);
            const upperWick = c0.high - Math.max(c0.open, c0.close);
            const hasWickRej = (upperWick / candleRange >= minRejectionWickPct) && (c0.close <= poi.idm.price || c0.close <= poi.bottom);

            if (hasWickRej && i > lastTradeExitIndex) {
              const entryPrice = c0.close;
              const sl = Math.max(c0.high * 1.001, poi.top * 1.0005);
              const riskDist = Math.max(sl - entryPrice, 0.001);
              const tp1 = entryPrice - (riskDist * rrTP1);
              const tp2 = entryPrice - (riskDist * rrTP2);

              const maxSimIndex = Math.min(bars.length - 1, i + 40);
              let tp1Hit = false;
              let tp1EndTime = bars[maxSimIndex].time;
              let tp2EndTime = bars[maxSimIndex].time;
              let slEndTime = bars[maxSimIndex].time;
              let tradeExitIndex = maxSimIndex;

              for (let m = i + 1; m <= maxSimIndex; m++) {
                const b = bars[m];
                if (!tp1Hit && b.low <= tp1) {
                  tp1Hit = true;
                  tp1EndTime = b.time;
                }
                const currentSl = tp1Hit ? entryPrice : sl;
                if (b.high >= currentSl) {
                  if (!tp1Hit) tp1EndTime = b.time;
                  tp2EndTime = b.time;
                  slEndTime = b.time;
                  tradeExitIndex = m;
                  break;
                }
                if (b.low <= tp2) {
                  tp2EndTime = b.time;
                  slEndTime = b.time;
                  tradeExitIndex = m;
                  break;
                }
              }

              if (showPositionTool) {
                positionBoxes.push({
                  id: "pos-risk-" + i,
                  startTime: c0.time,
                  endTime: slEndTime,
                  top: sl,
                  bottom: entryPrice,
                  color: "#e53935",
                  fillColor: "rgba(229, 57, 53, " + posBoxOpacity + ")",
                  label: tp1Hit ? "SL: BE (" + entryPrice.toFixed(2) + ")" : "SL: " + sl.toFixed(2)
                });
                positionBoxes.push({
                  id: "pos-tp1-" + i,
                  startTime: c0.time,
                  endTime: tp1EndTime,
                  top: entryPrice,
                  bottom: tp1,
                  color: "#00c853",
                  fillColor: "rgba(0, 200, 83, " + posBoxOpacity + ")",
                  label: "TP1 (1:3): " + tp1.toFixed(2)
                });
                positionBoxes.push({
                  id: "pos-tp2-" + i,
                  startTime: c0.time,
                  endTime: tp2EndTime,
                  top: tp1,
                  bottom: tp2,
                  color: "#00c853",
                  fillColor: "rgba(0, 200, 83, " + (posBoxOpacity * 0.5) + ")",
                  label: "TP2 (1:6): " + tp2.toFixed(2)
                });
              }

              lastTradeExitIndex = tradeExitIndex;

              if (typeof alertcondition === "function" && i === bars.length - 1) {
                alertcondition(true, "Phantom IDM Short Entry", "[Phantom IDM] Bearish IDM swept into Extreme Supply! Short entry triggered.");
              }
            }
          }
        }
      }
    }
  }

  const latestTime = bars[bars.length - 1].time;
  const validDemands = extremeDemands.filter(d => !d.isInvalidated);
  const validSupplies = extremeSupplies.filter(s => !s.isInvalidated);

  // Only extend the 3 most recent unmitigated Extreme Demands and Supplies to latestTime; cap older ones locally
  const unmitigatedDemands = validDemands.filter(d => !d.isMitigated);
  const unmitigatedSupplies = validSupplies.filter(s => !s.isMitigated);
  const recentDemands = unmitigatedDemands.slice(-3);
  const recentSupplies = unmitigatedSupplies.slice(-3);

  for (const d of unmitigatedDemands) {
    d.endTime = recentDemands.includes(d)
      ? latestTime
      : bars[Math.min(bars.length - 1, d.createdIndex + 25)].time;
  }
  for (const s of unmitigatedSupplies) {
    s.endTime = recentSupplies.includes(s)
      ? latestTime
      : bars[Math.min(bars.length - 1, s.createdIndex + 25)].time;
  }

  const recentPoiIds = new Set([...recentDemands, ...recentSupplies].map(p => p.id));
  for (const idm of idmZones) {
    if (!idm.isSwept) {
      idm.endTime = recentPoiIds.has(idm.poiId)
        ? latestTime
        : bars[Math.min(bars.length - 1, idm.createdIndex + 20)].time;
    }
  }

  const allBoxes = [
    ...validDemands,
    ...validSupplies,
    ...idmZones,
    ...positionBoxes
  ];

  return {
    boxes: allBoxes,
    data: []
  };
}
`;

/**
 * Retrieves all saved custom scripts from localStorage
 */
export const DEFAULT_PHANTOM_SESSION_SCRIPT = `/**
 * Phantom SMC MOD-04: Session Killzone Sweeps Indicator (Mochex Web Terminal Engine) [v7]
 * Identifies Asian Session range (00:00 - 06:00 UTC), tracks Asian High & Asian Low liquidity bounds,
 * detects London (07:00 - 10:00 UTC) and New York (12:00 - 15:00 UTC) boundary sweeps with rejection wicks,
 * emits real-time alertcondition() events, and forward-simulates Long/Short Position Tool shapes.
 */
function calculate(bars, inputs, ta, strategy, alertcondition) {
  inputs = inputs || {};
  const minRejectionWickPct = inputs.minRejectionWickPct !== undefined ? inputs.minRejectionWickPct : 0.25;
  const rrTP1 = inputs.rrTP1 || 3.0;
  const rrTP2 = inputs.rrTP2 || 5.0;
  const showPositionTool = inputs.showPositionTool !== undefined ? inputs.showPositionTool : true;
  const posBoxOpacity = inputs.posBoxOpacity || 0.25;

  if (!bars || bars.length < 8) {
    return { boxes: [], data: [] };
  }

  const sessionBoxes = [];
  const positionBoxes = [];

  let currentAsianHigh = null;
  let currentAsianLow = null;
  let asianStartTime = null;
  let asianEndTime = null;
  let inAsian = false;
  let asianLowSwept = false;
  let asianHighSwept = false;

  let lastTradeExitIndex = -1;

  for (let i = 0; i < bars.length; i++) {
    const bar = bars[i];
    const date = new Date(bar.time * 1000);
    const utcHour = date.getUTCHours();
    const isAsianBar = utcHour >= 0 && utcHour < 6;
    const isLondonBar = utcHour >= 7 && utcHour < 10;
    const isNyBar = utcHour >= 12 && utcHour < 15;
    const isKillzone = isLondonBar || isNyBar;

    // Track Asian Session
    if (isAsianBar) {
      if (!inAsian) {
        inAsian = true;
        currentAsianHigh = bar.high;
        currentAsianLow = bar.low;
        asianStartTime = bar.time;
        asianEndTime = bar.time;
        asianLowSwept = false;
        asianHighSwept = false;
      } else {
        currentAsianHigh = Math.max(currentAsianHigh, bar.high);
        currentAsianLow = Math.min(currentAsianLow, bar.low);
        asianEndTime = bar.time;
      }
    } else {
      if (inAsian) {
        inAsian = false;
        if (currentAsianHigh !== null && currentAsianLow !== null) {
          sessionBoxes.push({
            id: "asian-range-" + asianStartTime,
            startTime: asianStartTime,
            endTime: asianEndTime,
            top: currentAsianHigh,
            bottom: currentAsianLow,
            color: "#f5ac37",
            fillColor: "rgba(245, 172, 55, 0.08)",
            label: "Asian Range (" + currentAsianLow.toFixed(2) + " - " + currentAsianHigh.toFixed(2) + ")"
          });
        }
      }
    }

    // Killzone Sweep Detection & Forward-Simulated Trade Trajectory
    if (isKillzone && currentAsianHigh !== null && currentAsianLow !== null && i > lastTradeExitIndex) {
      const candleRange = Math.max(bar.high - bar.low, 0.0001);
      const lowerWick = Math.min(bar.open, bar.close) - bar.low;
      const upperWick = bar.high - Math.max(bar.open, bar.close);

      // 1. Asian Low Swept (Bullish Trap)
      if (!asianLowSwept && bar.low < currentAsianLow) {
        const hasWickRej = (lowerWick / candleRange) >= minRejectionWickPct;
        const closesInside = bar.close > currentAsianLow || bar.close > bar.open;

        if (hasWickRej || closesInside) {
          asianLowSwept = true;
          const entryPrice = bar.close;
          const sl = Math.min(bar.low * 0.999, currentAsianLow * 0.998);
          const riskDist = Math.max(entryPrice - sl, 0.001);
          const tp1 = entryPrice + (riskDist * rrTP1);
          const tp2 = Math.max(entryPrice + (riskDist * rrTP2), currentAsianHigh);

          const maxSimIndex = Math.min(bars.length - 1, i + 36);
          let tp1Hit = false;
          let tp1EndTime = bars[maxSimIndex].time;
          let tp2EndTime = bars[maxSimIndex].time;
          let slEndTime = bars[maxSimIndex].time;
          let tradeExitIndex = maxSimIndex;

          for (let m = i + 1; m <= maxSimIndex; m++) {
            const b = bars[m];
            if (!tp1Hit && b.high >= tp1) {
              tp1Hit = true;
              tp1EndTime = b.time;
            }
            const currentSl = tp1Hit ? entryPrice : sl;
            if (b.low <= currentSl) {
              if (!tp1Hit) tp1EndTime = b.time;
              tp2EndTime = b.time;
              slEndTime = b.time;
              tradeExitIndex = m;
              break;
            }
            if (b.high >= tp2) {
              tp2EndTime = b.time;
              slEndTime = b.time;
              tradeExitIndex = m;
              break;
            }
          }

          if (showPositionTool) {
            positionBoxes.push({
              id: "pos-risk-" + i,
              startTime: bar.time,
              endTime: slEndTime,
              top: entryPrice,
              bottom: sl,
              color: "#e53935",
              fillColor: "rgba(229, 57, 53, " + posBoxOpacity + ")",
              label: tp1Hit ? "SL: BE (" + entryPrice.toFixed(2) + ")" : "SL: " + sl.toFixed(2)
            });
            positionBoxes.push({
              id: "pos-tp1-" + i,
              startTime: bar.time,
              endTime: tp1EndTime,
              top: tp1,
              bottom: entryPrice,
              color: "#00c853",
              fillColor: "rgba(0, 200, 83, " + posBoxOpacity + ")",
              label: "TP1 (1:3): " + tp1.toFixed(2)
            });
            positionBoxes.push({
              id: "pos-tp2-" + i,
              startTime: bar.time,
              endTime: tp2EndTime,
              top: tp2,
              bottom: tp1,
              color: "#00c853",
              fillColor: "rgba(0, 200, 83, " + (posBoxOpacity * 0.5) + ")",
              label: "TP2 (1:5): " + tp2.toFixed(2)
            });
          }

          lastTradeExitIndex = tradeExitIndex;

          if (typeof alertcondition === "function" && i === bars.length - 1) {
            alertcondition(true, "Killzone Long Sweep Entry", "[Phantom MOD-04] Asian Low swept in Killzone! Bullish reversal trigger.");
          }
        }
      }

      // 2. Asian High Swept (Bearish Trap)
      if (!asianHighSwept && bar.high > currentAsianHigh && i > lastTradeExitIndex) {
        const hasWickRej = (upperWick / candleRange) >= minRejectionWickPct;
        const closesInside = bar.close < currentAsianHigh || bar.close < bar.open;

        if (hasWickRej || closesInside) {
          asianHighSwept = true;
          const entryPrice = bar.close;
          const sl = Math.max(bar.high * 1.001, currentAsianHigh * 1.002);
          const riskDist = Math.max(sl - entryPrice, 0.001);
          const tp1 = entryPrice - (riskDist * rrTP1);
          const tp2 = Math.min(entryPrice - (riskDist * rrTP2), currentAsianLow);

          const maxSimIndex = Math.min(bars.length - 1, i + 36);
          let tp1Hit = false;
          let tp1EndTime = bars[maxSimIndex].time;
          let tp2EndTime = bars[maxSimIndex].time;
          let slEndTime = bars[maxSimIndex].time;
          let tradeExitIndex = maxSimIndex;

          for (let m = i + 1; m <= maxSimIndex; m++) {
            const b = bars[m];
            if (!tp1Hit && b.low <= tp1) {
              tp1Hit = true;
              tp1EndTime = b.time;
            }
            const currentSl = tp1Hit ? entryPrice : sl;
            if (b.high >= currentSl) {
              if (!tp1Hit) tp1EndTime = b.time;
              tp2EndTime = b.time;
              slEndTime = b.time;
              tradeExitIndex = m;
              break;
            }
            if (b.low <= tp2) {
              tp2EndTime = b.time;
              slEndTime = b.time;
              tradeExitIndex = m;
              break;
            }
          }

          if (showPositionTool) {
            positionBoxes.push({
              id: "pos-risk-" + i,
              startTime: bar.time,
              endTime: slEndTime,
              top: sl,
              bottom: entryPrice,
              color: "#e53935",
              fillColor: "rgba(229, 57, 53, " + posBoxOpacity + ")",
              label: tp1Hit ? "SL: BE (" + entryPrice.toFixed(2) + ")" : "SL: " + sl.toFixed(2)
            });
            positionBoxes.push({
              id: "pos-tp1-" + i,
              startTime: bar.time,
              endTime: tp1EndTime,
              top: entryPrice,
              bottom: tp1,
              color: "#00c853",
              fillColor: "rgba(0, 200, 83, " + posBoxOpacity + ")",
              label: "TP1 (1:3): " + tp1.toFixed(2)
            });
            positionBoxes.push({
              id: "pos-tp2-" + i,
              startTime: bar.time,
              endTime: tp2EndTime,
              top: tp1,
              bottom: tp2,
              color: "#00c853",
              fillColor: "rgba(0, 200, 83, " + (posBoxOpacity * 0.5) + ")",
              label: "TP2 (1:5): " + tp2.toFixed(2)
            });
          }

          lastTradeExitIndex = tradeExitIndex;

          if (typeof alertcondition === "function" && i === bars.length - 1) {
            alertcondition(true, "Killzone Short Sweep Entry", "[Phantom MOD-04] Asian High swept in Killzone! Bearish reversal trigger.");
          }
        }
      }
    }
  }

  return {
    boxes: [...sessionBoxes, ...positionBoxes],
    data: []
  };
}`;

export const DEFAULT_PHANTOM_CONTINUATION_SCRIPT = `/**
 * Phantom SMC MOD-05: Decisional vs Extreme Continuation (Mochex Web Terminal Engine) [v7]
 * Identifies Break of Structure (BOS), tracks Extreme POIs and Decisional POIs within 50% Equilibrium,
 * detects in-trend retests with rejection wick triggers, caps mitigated POIs at the tap bar,
 * and forward-simulates Long/Short Position Tool shapes.
 */
function calculate(bars, inputs, ta, strategy, alertcondition) {
  inputs = inputs || {};
  const swingLen = inputs.swingLength || 5;
  const minRejectionWickPct = inputs.minRejectionWickPct !== undefined ? inputs.minRejectionWickPct : 0.25;
  const rrTP1 = inputs.rrTP1 || 3.0;
  const rrTP2 = inputs.rrTP2 || 5.0;
  const showPositionTool = inputs.showPositionTool !== undefined ? inputs.showPositionTool : true;
  const posBoxOpacity = inputs.posBoxOpacity || 0.25;

  if (!bars || bars.length < swingLen * 3) {
    return { boxes: [], data: [] };
  }

  const orderBlocks = [];
  const positionBoxes = [];

  let lastSwingHigh = null;
  let lastSwingLow = null;
  let lastSwingHighIndex = -1;
  let lastSwingLowIndex = -1;
  let lastTradeExitIndex = -1;

  for (let i = swingLen; i < bars.length; i++) {
    const c0 = bars[i];

    // Detect Swing Pivots
    const checkIdx = i - swingLen;
    if (checkIdx >= swingLen) {
      const midHigh = bars[checkIdx].high;
      let isHigh = true;
      for (let k = checkIdx - swingLen; k <= checkIdx + swingLen; k++) {
        if (bars[k].high > midHigh) { isHigh = false; break; }
      }
      if (isHigh) {
        lastSwingHigh = midHigh;
        lastSwingHighIndex = checkIdx;
      }

      const midLow = bars[checkIdx].low;
      let isLow = true;
      for (let k = checkIdx - swingLen; k <= checkIdx + swingLen; k++) {
        if (bars[k].low < midLow) { isLow = false; break; }
      }
      if (isLow) {
        lastSwingLow = midLow;
        lastSwingLowIndex = checkIdx;
      }
    }

    // 1. Bullish BOS (Close > Last Swing High)
    if (lastSwingHigh !== null && c0.close > lastSwingHigh && bars[i - 1].close <= lastSwingHigh) {
      const legLow = lastSwingLow !== null ? lastSwingLow : bars[Math.max(0, i - 10)].low;
      const legLowIdx = lastSwingLowIndex !== -1 ? lastSwingLowIndex : Math.max(0, i - 10);
      const eq = (lastSwingHigh + legLow) * 0.5;

      const extBase = bars[legLowIdx];
      orderBlocks.push({
        id: "ob-ext-dem-" + i,
        createdIndex: i,
        startTime: extBase.time,
        endTime: c0.time,
        top: Math.max(extBase.open, extBase.close),
        bottom: extBase.low,
        color: "#089981",
        fillColor: "rgba(8, 153, 129, 0.18)",
        label: "Extreme Demand",
        isDemand: true,
        isExtreme: true,
        isMitigated: false,
        isInvalidated: false
      });

      const decBase = bars[i - 1];
      if (decBase.low < eq) {
        orderBlocks.push({
          id: "ob-dec-dem-" + i,
          createdIndex: i,
          startTime: decBase.time,
          endTime: c0.time,
          top: Math.max(decBase.open, decBase.close),
          bottom: decBase.low,
          color: "#2962ff",
          fillColor: "rgba(41, 98, 255, 0.18)",
          label: "Decisional Demand",
          isDemand: true,
          isExtreme: false,
          isMitigated: false,
          isInvalidated: false
        });
      }
    }

    // 2. Bearish BOS (Close < Last Swing Low)
    if (lastSwingLow !== null && c0.close < lastSwingLow && bars[i - 1].close >= lastSwingLow) {
      const legHigh = lastSwingHigh !== null ? lastSwingHigh : bars[Math.max(0, i - 10)].high;
      const legHighIdx = lastSwingHighIndex !== -1 ? lastSwingHighIndex : Math.max(0, i - 10);
      const eq = (lastSwingLow + legHigh) * 0.5;

      const extBase = bars[legHighIdx];
      orderBlocks.push({
        id: "ob-ext-sup-" + i,
        createdIndex: i,
        startTime: extBase.time,
        endTime: c0.time,
        top: extBase.high,
        bottom: Math.min(extBase.open, extBase.close),
        color: "#f23645",
        fillColor: "rgba(242, 54, 69, 0.18)",
        label: "Extreme Supply",
        isDemand: false,
        isExtreme: true,
        isMitigated: false,
        isInvalidated: false
      });

      const decBase = bars[i - 1];
      if (decBase.high > eq) {
        orderBlocks.push({
          id: "ob-dec-sup-" + i,
          createdIndex: i,
          startTime: decBase.time,
          endTime: c0.time,
          top: decBase.high,
          bottom: Math.min(decBase.open, decBase.close),
          color: "#ff7043",
          fillColor: "rgba(255, 112, 67, 0.18)",
          label: "Decisional Supply",
          isDemand: false,
          isExtreme: false,
          isMitigated: false,
          isInvalidated: false
        });
      }
    }

    // Evaluate POI Retests & Forward-Simulate Trades
    for (let obIdx = 0; obIdx < orderBlocks.length; obIdx++) {
      const ob = orderBlocks[obIdx];
      if (!ob.isMitigated && !ob.isInvalidated && i > ob.createdIndex) {
        const candleRange = Math.max(c0.high - c0.low, 0.0001);
        const lowerWick = Math.min(c0.open, c0.close) - c0.low;
        const upperWick = c0.high - Math.max(c0.open, c0.close);

        if (ob.isDemand) {
          if (c0.close < ob.bottom) {
            ob.isInvalidated = true;
            ob.endTime = c0.time;
          } else if (c0.low <= ob.top && c0.high >= ob.bottom) {
            ob.isMitigated = true;
            ob.endTime = c0.time;
            ob.label = ob.isExtreme ? "Extreme Demand (Mitigated)" : "Decisional Demand (Mitigated)";

            const hasRej = (lowerWick / candleRange >= minRejectionWickPct) || (c0.close > c0.open);
            if (hasRej && c0.close >= ob.bottom && i > lastTradeExitIndex) {
              const entryPrice = c0.close;
              const sl = Math.min(c0.low * 0.999, ob.bottom * 0.998);
              const riskDist = Math.max(entryPrice - sl, 0.001);
              const tp1 = entryPrice + (riskDist * rrTP1);
              const tp2 = entryPrice + (riskDist * rrTP2);

              const maxSimIndex = Math.min(bars.length - 1, i + 40);
              let tp1Hit = false;
              let tp1EndTime = bars[maxSimIndex].time;
              let tp2EndTime = bars[maxSimIndex].time;
              let slEndTime = bars[maxSimIndex].time;
              let tradeExitIndex = maxSimIndex;

              for (let m = i + 1; m <= maxSimIndex; m++) {
                const b = bars[m];
                if (!tp1Hit && b.high >= tp1) {
                  tp1Hit = true;
                  tp1EndTime = b.time;
                }
                const currentSl = tp1Hit ? entryPrice : sl;
                if (b.low <= currentSl) {
                  if (!tp1Hit) tp1EndTime = b.time;
                  tp2EndTime = b.time;
                  slEndTime = b.time;
                  tradeExitIndex = m;
                  break;
                }
                if (b.high >= tp2) {
                  tp2EndTime = b.time;
                  slEndTime = b.time;
                  tradeExitIndex = m;
                  break;
                }
              }

              if (showPositionTool) {
                positionBoxes.push({
                  id: "pos-risk-" + i,
                  startTime: c0.time,
                  endTime: slEndTime,
                  top: entryPrice,
                  bottom: sl,
                  color: "#e53935",
                  fillColor: "rgba(229, 57, 53, " + posBoxOpacity + ")",
                  label: tp1Hit ? "SL: BE (" + entryPrice.toFixed(2) + ")" : "SL: " + sl.toFixed(2)
                });
                positionBoxes.push({
                  id: "pos-tp1-" + i,
                  startTime: c0.time,
                  endTime: tp1EndTime,
                  top: tp1,
                  bottom: entryPrice,
                  color: "#00c853",
                  fillColor: "rgba(0, 200, 83, " + posBoxOpacity + ")",
                  label: "TP1 (1:3): " + tp1.toFixed(2)
                });
                positionBoxes.push({
                  id: "pos-tp2-" + i,
                  startTime: c0.time,
                  endTime: tp2EndTime,
                  top: tp2,
                  bottom: tp1,
                  color: "#00c853",
                  fillColor: "rgba(0, 200, 83, " + (posBoxOpacity * 0.5) + ")",
                  label: "TP2 (1:5): " + tp2.toFixed(2)
                });
              }

              lastTradeExitIndex = tradeExitIndex;

              if (typeof alertcondition === "function" && i === bars.length - 1) {
                alertcondition(true, "Continuation Long Entry", "[Phantom MOD-05] Bullish POI tapped with rejection! Continuation Long entry.");
              }
            }
          }
        } else {
          if (c0.close > ob.top) {
            ob.isInvalidated = true;
            ob.endTime = c0.time;
          } else if (c0.high >= ob.bottom && c0.low <= ob.top) {
            ob.isMitigated = true;
            ob.endTime = c0.time;
            ob.label = ob.isExtreme ? "Extreme Supply (Mitigated)" : "Decisional Supply (Mitigated)";

            const hasRej = (upperWick / candleRange >= minRejectionWickPct) || (c0.close < c0.open);
            if (hasRej && c0.close <= ob.top && i > lastTradeExitIndex) {
              const entryPrice = c0.close;
              const sl = Math.max(c0.high * 1.001, ob.top * 1.002);
              const riskDist = Math.max(sl - entryPrice, 0.001);
              const tp1 = entryPrice - (riskDist * rrTP1);
              const tp2 = entryPrice - (riskDist * rrTP2);

              const maxSimIndex = Math.min(bars.length - 1, i + 40);
              let tp1Hit = false;
              let tp1EndTime = bars[maxSimIndex].time;
              let tp2EndTime = bars[maxSimIndex].time;
              let slEndTime = bars[maxSimIndex].time;
              let tradeExitIndex = maxSimIndex;

              for (let m = i + 1; m <= maxSimIndex; m++) {
                const b = bars[m];
                if (!tp1Hit && b.low <= tp1) {
                  tp1Hit = true;
                  tp1EndTime = b.time;
                }
                const currentSl = tp1Hit ? entryPrice : sl;
                if (b.high >= currentSl) {
                  if (!tp1Hit) tp1EndTime = b.time;
                  tp2EndTime = b.time;
                  slEndTime = b.time;
                  tradeExitIndex = m;
                  break;
                }
                if (b.low <= tp2) {
                  tp2EndTime = b.time;
                  slEndTime = b.time;
                  tradeExitIndex = m;
                  break;
                }
              }

              if (showPositionTool) {
                positionBoxes.push({
                  id: "pos-risk-" + i,
                  startTime: c0.time,
                  endTime: slEndTime,
                  top: sl,
                  bottom: entryPrice,
                  color: "#e53935",
                  fillColor: "rgba(229, 57, 53, " + posBoxOpacity + ")",
                  label: tp1Hit ? "SL: BE (" + entryPrice.toFixed(2) + ")" : "SL: " + sl.toFixed(2)
                });
                positionBoxes.push({
                  id: "pos-tp1-" + i,
                  startTime: c0.time,
                  endTime: tp1EndTime,
                  top: entryPrice,
                  bottom: tp1,
                  color: "#00c853",
                  fillColor: "rgba(0, 200, 83, " + posBoxOpacity + ")",
                  label: "TP1 (1:3): " + tp1.toFixed(2)
                });
                positionBoxes.push({
                  id: "pos-tp2-" + i,
                  startTime: c0.time,
                  endTime: tp2EndTime,
                  top: tp1,
                  bottom: tp2,
                  color: "#00c853",
                  fillColor: "rgba(0, 200, 83, " + (posBoxOpacity * 0.5) + ")",
                  label: "TP2 (1:5): " + tp2.toFixed(2)
                });
              }

              lastTradeExitIndex = tradeExitIndex;

              if (typeof alertcondition === "function" && i === bars.length - 1) {
                alertcondition(true, "Continuation Short Entry", "[Phantom MOD-05] Bearish POI tapped with rejection! Continuation Short entry.");
              }
            }
          }
        }
      }
    }
  }

  const latestTime = bars[bars.length - 1].time;
  const validObs = orderBlocks.filter(b => !b.isInvalidated);
  const unmitigatedDemands = validObs.filter(b => b.isDemand && !b.isMitigated);
  const unmitigatedSupplies = validObs.filter(b => !b.isDemand && !b.isMitigated);
  const recentDemands = unmitigatedDemands.slice(-3);
  const recentSupplies = unmitigatedSupplies.slice(-3);

  for (const ob of unmitigatedDemands) {
    ob.endTime = recentDemands.includes(ob)
      ? latestTime
      : bars[Math.min(bars.length - 1, ob.createdIndex + 25)].time;
  }
  for (const ob of unmitigatedSupplies) {
    ob.endTime = recentSupplies.includes(ob)
      ? latestTime
      : bars[Math.min(bars.length - 1, ob.createdIndex + 25)].time;
  }

  return {
    boxes: [...validObs, ...positionBoxes],
    data: []
  };
}`;

export const DEFAULT_PHANTOM_RISK_SCRIPT = `/**
 * Phantom SMC MOD-06: Aggressive Risk Entry (Mochex Web Terminal Engine) [v7]
 * Qualifies institutional Order Blocks via liquidity sweeps + Fair Value Gaps,
 * calculates 50% Mean Threshold limit prices, executes intrabar limit fills on retest touches,
 * caps filled POIs at the fill candle, and forward-simulates Long/Short Position Tool shapes.
 */
function calculate(bars, inputs, ta, strategy, alertcondition) {
  inputs = inputs || {};
  const minFvgPct = inputs.minFvgPct || 0.001;
  const meanThresholdRatio = inputs.meanThresholdRatio !== undefined ? inputs.meanThresholdRatio : 0.5;
  const rrTP1 = inputs.rrTP1 || 3.0;
  const rrTP2 = inputs.rrTP2 || 5.0;
  const showPositionTool = inputs.showPositionTool !== undefined ? inputs.showPositionTool : true;
  const posBoxOpacity = inputs.posBoxOpacity || 0.25;

  if (!bars || bars.length < 6) {
    return { boxes: [], data: [] };
  }

  const pois = [];
  const positionBoxes = [];
  let lastTradeExitIndex = -1;

  for (let i = 3; i < bars.length; i++) {
    const c0 = bars[i];
    const c1 = bars[i - 1];
    const c2 = bars[i - 2];
    const c3 = bars[i - 3];

    // 1. Detect Qualified Bullish Demand POI
    const sweptLow = c2.low < c3.low;
    const bullFVG = (c0.low - c2.high) > (c2.close * minFvgPct);

    if (sweptLow && bullFVG && c1.close > c1.open) {
      const top = Math.max(c2.open, c2.close);
      const bottom = c2.low;
      const mt = bottom + (top - bottom) * meanThresholdRatio;

      pois.push({
        id: "poi-risk-dem-" + i,
        createdIndex: i,
        startTime: c2.time,
        endTime: c0.time,
        top: top,
        bottom: bottom,
        entryLevel: mt,
        color: "#089981",
        fillColor: "rgba(8, 153, 129, 0.18)",
        label: "Demand MT 50% (" + mt.toFixed(2) + ")",
        isDemand: true,
        isFilled: false,
        isInvalidated: false
      });
    }

    // 2. Detect Qualified Bearish Supply POI
    const sweptHigh = c2.high > c3.high;
    const bearFVG = (c2.low - c0.high) > (c2.close * minFvgPct);

    if (sweptHigh && bearFVG && c1.close < c1.open) {
      const top = c2.high;
      const bottom = Math.min(c2.open, c2.close);
      const mt = top - (top - bottom) * meanThresholdRatio;

      pois.push({
        id: "poi-risk-sup-" + i,
        createdIndex: i,
        startTime: c2.time,
        endTime: c0.time,
        top: top,
        bottom: bottom,
        entryLevel: mt,
        color: "#f23645",
        fillColor: "rgba(242, 54, 69, 0.18)",
        label: "Supply MT 50% (" + mt.toFixed(2) + ")",
        isDemand: false,
        isFilled: false,
        isInvalidated: false
      });
    }

    // Evaluate Limit Orders at 50% Mean Threshold & Forward-Simulate Trades
    for (let pIdx = 0; pIdx < pois.length; pIdx++) {
      const poi = pois[pIdx];
      if (!poi.isFilled && !poi.isInvalidated && i > poi.createdIndex) {
        if (poi.isDemand) {
          if (c0.close < poi.bottom) {
            poi.isInvalidated = true;
            poi.endTime = c0.time;
          } else if (c0.low <= poi.entryLevel && c0.high >= poi.bottom) {
            poi.isFilled = true;
            poi.endTime = c0.time;
            poi.fillColor = "rgba(8, 153, 129, 0.10)";
            poi.label = "Demand MT 50% (Filled)";

            if (i > lastTradeExitIndex) {
              const entryPrice = poi.entryLevel;
              const sl = poi.bottom * 0.9985;
              const riskDist = Math.max(entryPrice - sl, 0.001);
              const tp1 = entryPrice + (riskDist * rrTP1);
              const tp2 = entryPrice + (riskDist * rrTP2);

              const maxSimIndex = Math.min(bars.length - 1, i + 40);
              let tp1Hit = false;
              let tp1EndTime = bars[maxSimIndex].time;
              let tp2EndTime = bars[maxSimIndex].time;
              let slEndTime = bars[maxSimIndex].time;
              let tradeExitIndex = maxSimIndex;

              for (let m = i + 1; m <= maxSimIndex; m++) {
                const b = bars[m];
                if (!tp1Hit && b.high >= tp1) {
                  tp1Hit = true;
                  tp1EndTime = b.time;
                }
                const currentSl = tp1Hit ? entryPrice : sl;
                if (b.low <= currentSl) {
                  if (!tp1Hit) tp1EndTime = b.time;
                  tp2EndTime = b.time;
                  slEndTime = b.time;
                  tradeExitIndex = m;
                  break;
                }
                if (b.high >= tp2) {
                  tp2EndTime = b.time;
                  slEndTime = b.time;
                  tradeExitIndex = m;
                  break;
                }
              }

              if (showPositionTool) {
                positionBoxes.push({
                  id: "pos-risk-" + i,
                  startTime: c0.time,
                  endTime: slEndTime,
                  top: entryPrice,
                  bottom: sl,
                  color: "#e53935",
                  fillColor: "rgba(229, 57, 53, " + posBoxOpacity + ")",
                  label: tp1Hit ? "SL: BE (" + entryPrice.toFixed(2) + ")" : "SL: " + sl.toFixed(2)
                });
                positionBoxes.push({
                  id: "pos-tp1-" + i,
                  startTime: c0.time,
                  endTime: tp1EndTime,
                  top: tp1,
                  bottom: entryPrice,
                  color: "#00c853",
                  fillColor: "rgba(0, 200, 83, " + posBoxOpacity + ")",
                  label: "TP1 (1:3): " + tp1.toFixed(2)
                });
                positionBoxes.push({
                  id: "pos-tp2-" + i,
                  startTime: c0.time,
                  endTime: tp2EndTime,
                  top: tp2,
                  bottom: tp1,
                  color: "#00c853",
                  fillColor: "rgba(0, 200, 83, " + (posBoxOpacity * 0.5) + ")",
                  label: "TP2 (1:5): " + tp2.toFixed(2)
                });
              }

              lastTradeExitIndex = tradeExitIndex;

              if (typeof alertcondition === "function" && i === bars.length - 1) {
                alertcondition(true, "Risk Entry Long Fill", "[Phantom MOD-06] Demand 50% Mean Threshold tapped! Limit Long filled.");
              }
            }
          }
        } else {
          if (c0.close > poi.top) {
            poi.isInvalidated = true;
            poi.endTime = c0.time;
          } else if (c0.high >= poi.entryLevel && c0.low <= poi.top) {
            poi.isFilled = true;
            poi.endTime = c0.time;
            poi.fillColor = "rgba(242, 54, 69, 0.10)";
            poi.label = "Supply MT 50% (Filled)";

            if (i > lastTradeExitIndex) {
              const entryPrice = poi.entryLevel;
              const sl = poi.top * 1.0015;
              const riskDist = Math.max(sl - entryPrice, 0.001);
              const tp1 = entryPrice - (riskDist * rrTP1);
              const tp2 = entryPrice - (riskDist * rrTP2);

              const maxSimIndex = Math.min(bars.length - 1, i + 40);
              let tp1Hit = false;
              let tp1EndTime = bars[maxSimIndex].time;
              let tp2EndTime = bars[maxSimIndex].time;
              let slEndTime = bars[maxSimIndex].time;
              let tradeExitIndex = maxSimIndex;

              for (let m = i + 1; m <= maxSimIndex; m++) {
                const b = bars[m];
                if (!tp1Hit && b.low <= tp1) {
                  tp1Hit = true;
                  tp1EndTime = b.time;
                }
                const currentSl = tp1Hit ? entryPrice : sl;
                if (b.high >= currentSl) {
                  if (!tp1Hit) tp1EndTime = b.time;
                  tp2EndTime = b.time;
                  slEndTime = b.time;
                  tradeExitIndex = m;
                  break;
                }
                if (b.low <= tp2) {
                  tp2EndTime = b.time;
                  slEndTime = b.time;
                  tradeExitIndex = m;
                  break;
                }
              }

              if (showPositionTool) {
                positionBoxes.push({
                  id: "pos-risk-" + i,
                  startTime: c0.time,
                  endTime: slEndTime,
                  top: sl,
                  bottom: entryPrice,
                  color: "#e53935",
                  fillColor: "rgba(229, 57, 53, " + posBoxOpacity + ")",
                  label: tp1Hit ? "SL: BE (" + entryPrice.toFixed(2) + ")" : "SL: " + sl.toFixed(2)
                });
                positionBoxes.push({
                  id: "pos-tp1-" + i,
                  startTime: c0.time,
                  endTime: tp1EndTime,
                  top: entryPrice,
                  bottom: tp1,
                  color: "#00c853",
                  fillColor: "rgba(0, 200, 83, " + posBoxOpacity + ")",
                  label: "TP1 (1:3): " + tp1.toFixed(2)
                });
                positionBoxes.push({
                  id: "pos-tp2-" + i,
                  startTime: c0.time,
                  endTime: tp2EndTime,
                  top: tp1,
                  bottom: tp2,
                  color: "#00c853",
                  fillColor: "rgba(0, 200, 83, " + (posBoxOpacity * 0.5) + ")",
                  label: "TP2 (1:5): " + tp2.toFixed(2)
                });
              }

              lastTradeExitIndex = tradeExitIndex;

              if (typeof alertcondition === "function" && i === bars.length - 1) {
                alertcondition(true, "Risk Entry Short Fill", "[Phantom MOD-06] Supply 50% Mean Threshold tapped! Limit Short filled.");
              }
            }
          }
        }
      }
    }
  }

  const latestTime = bars[bars.length - 1].time;
  const validPois = pois.filter(p => !p.isInvalidated);
  const unfilledDemands = validPois.filter(p => p.isDemand && !p.isFilled);
  const unfilledSupplies = validPois.filter(p => !p.isDemand && !p.isFilled);
  const recentDemands = unfilledDemands.slice(-3);
  const recentSupplies = unfilledSupplies.slice(-3);

  for (const poi of unfilledDemands) {
    poi.endTime = recentDemands.includes(poi)
      ? latestTime
      : bars[Math.min(bars.length - 1, poi.createdIndex + 25)].time;
  }
  for (const poi of unfilledSupplies) {
    poi.endTime = recentSupplies.includes(poi)
      ? latestTime
      : bars[Math.min(bars.length - 1, poi.createdIndex + 25)].time;
  }

  return {
    boxes: [...validPois, ...positionBoxes],
    data: []
  };
}`;

export const DEFAULT_PHANTOM_BREAKER_SCRIPT = `/**
 * Phantom SMC MOD-07: Breaker Block Reversal Engine (Mochex Web Terminal Engine) [v7]
 * Tracks structural Order Block failures, converts violated zones into Breaker Blocks,
 * detects retest mitigations with rejection wick triggers, caps mitigated Breakers at the tap bar,
 * and forward-simulates Long/Short Position Tool shapes.
 */
function calculate(bars, inputs, ta, strategy, alertcondition) {
  inputs = inputs || {};
  const minRejectionWickPct = inputs.minRejectionWickPct !== undefined ? inputs.minRejectionWickPct : 0.25;
  const rrTP1 = inputs.rrTP1 || 3.0;
  const rrTP2 = inputs.rrTP2 || 5.0;
  const showPositionTool = inputs.showPositionTool !== undefined ? inputs.showPositionTool : true;
  const posBoxOpacity = inputs.posBoxOpacity || 0.25;

  if (!bars || bars.length < 6) {
    return { boxes: [], data: [] };
  }

  const breakerZones = [];
  const positionBoxes = [];
  let lastTradeExitIndex = -1;

  for (let i = 2; i < bars.length; i++) {
    const c0 = bars[i];
    const c1 = bars[i - 1];

    // 1. Bullish Base (Demand candidate)
    if (c1.close < c1.open && c0.close > c0.open && c0.close > c1.high) {
      breakerZones.push({
        id: "zone-ob-" + i,
        createdIndex: i,
        convertedIndex: -1,
        startTime: c1.time,
        endTime: c0.time,
        top: Math.max(c1.open, c1.close),
        bottom: c1.low,
        color: "#64748b",
        fillColor: "rgba(100, 116, 139, 0.12)",
        label: "Demand OB",
        isBreakerDemand: false,
        isConverted: false,
        isMitigated: false,
        isInvalidated: false
      });
    }

    // 2. Bearish Base (Supply candidate)
    if (c1.close > c1.open && c0.close < c0.open && c0.close < c1.low) {
      breakerZones.push({
        id: "zone-ob-" + i,
        createdIndex: i,
        convertedIndex: -1,
        startTime: c1.time,
        endTime: c0.time,
        top: c1.high,
        bottom: Math.min(c1.open, c1.close),
        color: "#64748b",
        fillColor: "rgba(100, 116, 139, 0.12)",
        label: "Supply OB",
        isBreakerDemand: true,
        isConverted: false,
        isMitigated: false,
        isInvalidated: false
      });
    }

    // Evaluate Breaker Conversion (within 35 bars of base creation)
    for (let zIdx = 0; zIdx < breakerZones.length; zIdx++) {
      const bz = breakerZones[zIdx];
      if (!bz.isConverted && !bz.isInvalidated && i > bz.createdIndex) {
        if (i - bz.createdIndex > 35) {
          bz.isInvalidated = true;
          continue;
        }
        if (!bz.isBreakerDemand && c0.close < bz.bottom) {
          bz.isConverted = true;
          bz.convertedIndex = i;
          bz.endTime = c0.time;
          bz.color = "#ab47bc";
          bz.fillColor = "rgba(171, 71, 188, 0.20)";
          bz.label = "Breaker Supply (" + bz.bottom.toFixed(2) + " - " + bz.top.toFixed(2) + ")";
        } else if (bz.isBreakerDemand && c0.close > bz.top) {
          bz.isConverted = true;
          bz.convertedIndex = i;
          bz.endTime = c0.time;
          bz.color = "#00bcd4";
          bz.fillColor = "rgba(0, 188, 212, 0.20)";
          bz.label = "Breaker Demand (" + bz.bottom.toFixed(2) + " - " + bz.top.toFixed(2) + ")";
        }
      }
    }

    // Evaluate Breaker Retest & Forward-Simulate Trades
    for (let zIdx = 0; zIdx < breakerZones.length; zIdx++) {
      const bz = breakerZones[zIdx];
      if (bz.isConverted && !bz.isMitigated && !bz.isInvalidated && i > bz.convertedIndex) {
        const candleRange = Math.max(c0.high - c0.low, 0.0001);
        const lowerWick = Math.min(c0.open, c0.close) - c0.low;
        const upperWick = c0.high - Math.max(c0.open, c0.close);

        if (bz.isBreakerDemand) {
          if (c0.close < bz.bottom) {
            bz.isInvalidated = true;
            bz.endTime = c0.time;
          } else if (c0.low <= bz.top && c0.high >= bz.bottom) {
            bz.isMitigated = true;
            bz.endTime = c0.time;
            bz.fillColor = "rgba(0, 188, 212, 0.10)";
            bz.label = "Breaker Demand (Mitigated)";

            const hasRej = (lowerWick / candleRange >= minRejectionWickPct) || (c0.close > c0.open);
            if (hasRej && c0.close >= bz.bottom && i > lastTradeExitIndex) {
              const entryPrice = c0.close;
              const sl = Math.min(c0.low * 0.999, bz.bottom * 0.998);
              const riskDist = Math.max(entryPrice - sl, 0.001);
              const tp1 = entryPrice + (riskDist * rrTP1);
              const tp2 = entryPrice + (riskDist * rrTP2);

              const maxSimIndex = Math.min(bars.length - 1, i + 40);
              let tp1Hit = false;
              let tp1EndTime = bars[maxSimIndex].time;
              let tp2EndTime = bars[maxSimIndex].time;
              let slEndTime = bars[maxSimIndex].time;
              let tradeExitIndex = maxSimIndex;

              for (let m = i + 1; m <= maxSimIndex; m++) {
                const b = bars[m];
                if (!tp1Hit && b.high >= tp1) {
                  tp1Hit = true;
                  tp1EndTime = b.time;
                }
                const currentSl = tp1Hit ? entryPrice : sl;
                if (b.low <= currentSl) {
                  if (!tp1Hit) tp1EndTime = b.time;
                  tp2EndTime = b.time;
                  slEndTime = b.time;
                  tradeExitIndex = m;
                  break;
                }
                if (b.high >= tp2) {
                  tp2EndTime = b.time;
                  slEndTime = b.time;
                  tradeExitIndex = m;
                  break;
                }
              }

              if (showPositionTool) {
                positionBoxes.push({
                  id: "pos-risk-" + i,
                  startTime: c0.time,
                  endTime: slEndTime,
                  top: entryPrice,
                  bottom: sl,
                  color: "#e53935",
                  fillColor: "rgba(229, 57, 53, " + posBoxOpacity + ")",
                  label: tp1Hit ? "SL: BE (" + entryPrice.toFixed(2) + ")" : "SL: " + sl.toFixed(2)
                });
                positionBoxes.push({
                  id: "pos-tp1-" + i,
                  startTime: c0.time,
                  endTime: tp1EndTime,
                  top: tp1,
                  bottom: entryPrice,
                  color: "#00c853",
                  fillColor: "rgba(0, 200, 83, " + posBoxOpacity + ")",
                  label: "TP1 (1:3): " + tp1.toFixed(2)
                });
                positionBoxes.push({
                  id: "pos-tp2-" + i,
                  startTime: c0.time,
                  endTime: tp2EndTime,
                  top: tp2,
                  bottom: tp1,
                  color: "#00c853",
                  fillColor: "rgba(0, 200, 83, " + (posBoxOpacity * 0.5) + ")",
                  label: "TP2 (1:5): " + tp2.toFixed(2)
                });
              }

              lastTradeExitIndex = tradeExitIndex;

              if (typeof alertcondition === "function" && i === bars.length - 1) {
                alertcondition(true, "Breaker Long Entry", "[Phantom MOD-07] Breaker Demand retested! Reversal Long triggered.");
              }
            }
          }
        } else {
          if (c0.close > bz.top) {
            bz.isInvalidated = true;
            bz.endTime = c0.time;
          } else if (c0.high >= bz.bottom && c0.low <= bz.top) {
            bz.isMitigated = true;
            bz.endTime = c0.time;
            bz.fillColor = "rgba(171, 71, 188, 0.10)";
            bz.label = "Breaker Supply (Mitigated)";

            const hasRej = (upperWick / candleRange >= minRejectionWickPct) || (c0.close < c0.open);
            if (hasRej && c0.close <= bz.top && i > lastTradeExitIndex) {
              const entryPrice = c0.close;
              const sl = Math.max(c0.high * 1.001, bz.top * 1.002);
              const riskDist = Math.max(sl - entryPrice, 0.001);
              const tp1 = entryPrice - (riskDist * rrTP1);
              const tp2 = entryPrice - (riskDist * rrTP2);

              const maxSimIndex = Math.min(bars.length - 1, i + 40);
              let tp1Hit = false;
              let tp1EndTime = bars[maxSimIndex].time;
              let tp2EndTime = bars[maxSimIndex].time;
              let slEndTime = bars[maxSimIndex].time;
              let tradeExitIndex = maxSimIndex;

              for (let m = i + 1; m <= maxSimIndex; m++) {
                const b = bars[m];
                if (!tp1Hit && b.low <= tp1) {
                  tp1Hit = true;
                  tp1EndTime = b.time;
                }
                const currentSl = tp1Hit ? entryPrice : sl;
                if (b.high >= currentSl) {
                  if (!tp1Hit) tp1EndTime = b.time;
                  tp2EndTime = b.time;
                  slEndTime = b.time;
                  tradeExitIndex = m;
                  break;
                }
                if (b.low <= tp2) {
                  tp2EndTime = b.time;
                  slEndTime = b.time;
                  tradeExitIndex = m;
                  break;
                }
              }

              if (showPositionTool) {
                positionBoxes.push({
                  id: "pos-risk-" + i,
                  startTime: c0.time,
                  endTime: slEndTime,
                  top: sl,
                  bottom: entryPrice,
                  color: "#e53935",
                  fillColor: "rgba(229, 57, 53, " + posBoxOpacity + ")",
                  label: tp1Hit ? "SL: BE (" + entryPrice.toFixed(2) + ")" : "SL: " + sl.toFixed(2)
                });
                positionBoxes.push({
                  id: "pos-tp1-" + i,
                  startTime: c0.time,
                  endTime: tp1EndTime,
                  top: entryPrice,
                  bottom: tp1,
                  color: "#00c853",
                  fillColor: "rgba(0, 200, 83, " + posBoxOpacity + ")",
                  label: "TP1 (1:3): " + tp1.toFixed(2)
                });
                positionBoxes.push({
                  id: "pos-tp2-" + i,
                  startTime: c0.time,
                  endTime: tp2EndTime,
                  top: tp1,
                  bottom: tp2,
                  color: "#00c853",
                  fillColor: "rgba(0, 200, 83, " + (posBoxOpacity * 0.5) + ")",
                  label: "TP2 (1:5): " + tp2.toFixed(2)
                });
              }

              lastTradeExitIndex = tradeExitIndex;

              if (typeof alertcondition === "function" && i === bars.length - 1) {
                alertcondition(true, "Breaker Short Entry", "[Phantom MOD-07] Breaker Supply retested! Reversal Short triggered.");
              }
            }
          }
        }
      }
    }
  }

  const latestTime = bars[bars.length - 1].time;
  const validBreakers = breakerZones.filter(b => b.isConverted && !b.isInvalidated);
  const unmitigatedDemands = validBreakers.filter(b => b.isBreakerDemand && !b.isMitigated);
  const unmitigatedSupplies = validBreakers.filter(b => !b.isBreakerDemand && !b.isMitigated);
  const recentDemands = unmitigatedDemands.slice(-3);
  const recentSupplies = unmitigatedSupplies.slice(-3);

  for (const bz of unmitigatedDemands) {
    bz.endTime = recentDemands.includes(bz)
      ? latestTime
      : bars[Math.min(bars.length - 1, bz.convertedIndex + 25)].time;
  }
  for (const bz of unmitigatedSupplies) {
    bz.endTime = recentSupplies.includes(bz)
      ? latestTime
      : bars[Math.min(bars.length - 1, bz.convertedIndex + 25)].time;
  }

  return {
    boxes: [...validBreakers, ...positionBoxes],
    data: []
  };
}`;

export const DEFAULT_PHANTOM_MASTER_SCRIPT = `/**
 * Phantom SMC MOD-08: Master Engine (Mochex Web Terminal Engine) [v7]
 * Master orchestrator synthesizing all Phantom Smart Money Concepts into a unified architecture.
 * Combines Session Killzone Sweeps, Pro-Trend Structure, Flips, and Breakers with conflict resolution,
 * emits real-time alertcondition() events, and forward-simulates Long/Short Position Tool shapes.
 */
function calculate(bars, inputs, ta, strategy, alertcondition) {
  inputs = inputs || {};
  const minRejectionWickPct = inputs.minRejectionWickPct !== undefined ? inputs.minRejectionWickPct : 0.25;
  const rrTP1 = inputs.rrTP1 || 3.0;
  const rrTP2 = inputs.rrTP2 || 5.0;
  const showPositionTool = inputs.showPositionTool !== undefined ? inputs.showPositionTool : true;
  const posBoxOpacity = inputs.posBoxOpacity || 0.25;

  if (!bars || bars.length < 8) {
    return { boxes: [], data: [] };
  }

  const boxes = [];
  const positionBoxes = [];

  let asianHigh = null;
  let asianLow = null;
  let asianLowSwept = false;
  let asianHighSwept = false;
  let lastSwingHigh = null;
  let lastSwingLow = null;

  let lastTradeExitIndex = -1;

  for (let i = 5; i < bars.length; i++) {
    const c0 = bars[i];
    const date = new Date(c0.time * 1000);
    const utcHour = date.getUTCHours();
    const isAsian = utcHour >= 0 && utcHour < 6;
    const isKZ = (utcHour >= 7 && utcHour < 10) || (utcHour >= 12 && utcHour < 15);

    // Track Asian Session Range
    if (isAsian) {
      if (asianHigh === null || utcHour === 0) {
        asianHigh = c0.high;
        asianLow = c0.low;
        asianLowSwept = false;
        asianHighSwept = false;
      } else {
        asianHigh = Math.max(asianHigh, c0.high);
        asianLow = Math.min(asianLow, c0.low);
      }
    }

    // Track Swing Highs and Lows
    const midIdx = i - 3;
    if (midIdx >= 2) {
      const midH = bars[midIdx].high;
      if (midH > bars[midIdx - 1].high && midH > bars[midIdx - 2].high && midH > bars[midIdx + 1].high && midH > bars[midIdx + 2].high) {
        lastSwingHigh = midH;
      }
      const midL = bars[midIdx].low;
      if (midL < bars[midIdx - 1].low && midL < bars[midIdx - 2].low && midL < bars[midIdx + 1].low && midL < bars[midIdx + 2].low) {
        lastSwingLow = midL;
      }
    }

    if (i <= lastTradeExitIndex) continue;

    const candleRange = Math.max(c0.high - c0.low, 0.0001);
    const lowerWick = Math.min(c0.open, c0.close) - c0.low;
    const upperWick = c0.high - Math.max(c0.open, c0.close);

    let signalLong = false;
    let signalShort = false;
    let signalLabel = "";

    // 1. Check Session Killzone Sweep Trigger
    if (isKZ && asianHigh !== null && asianLow !== null) {
      if (!asianLowSwept && c0.low < asianLow && ((lowerWick / candleRange >= minRejectionWickPct) || c0.close > asianLow)) {
        asianLowSwept = true;
        signalLong = true;
        signalLabel = "Master: KZ Low Sweep";
      } else if (!asianHighSwept && c0.high > asianHigh && ((upperWick / candleRange >= minRejectionWickPct) || c0.close < asianHigh)) {
        asianHighSwept = true;
        signalShort = true;
        signalLabel = "Master: KZ High Sweep";
      }
    }

    // 2. Check Structural Liquidity Sweep Trigger
    if (!signalLong && !signalShort && lastSwingHigh !== null && lastSwingLow !== null) {
      if (c0.low <= lastSwingLow && c0.close > lastSwingLow && ((lowerWick / candleRange >= minRejectionWickPct) || c0.close > c0.open)) {
        signalLong = true;
        signalLabel = "Master: Structural Low Sweep";
        lastSwingLow = null;
      } else if (c0.high >= lastSwingHigh && c0.close < lastSwingHigh && ((upperWick / candleRange >= minRejectionWickPct) || c0.close < c0.open)) {
        signalShort = true;
        signalLabel = "Master: Structural High Sweep";
        lastSwingHigh = null;
      }
    }

    // Execute Signals & Forward-Simulate Trade Trajectory
    if (signalLong) {
      const entryPrice = c0.close;
      const sl = Math.min(c0.low * 0.999, (lastSwingLow || c0.low) * 0.998);
      const riskDist = Math.max(entryPrice - sl, 0.001);
      const tp1 = entryPrice + (riskDist * rrTP1);
      const tp2 = entryPrice + (riskDist * rrTP2);

      const maxSimIndex = Math.min(bars.length - 1, i + 40);
      let tp1Hit = false;
      let tp1EndTime = bars[maxSimIndex].time;
      let tp2EndTime = bars[maxSimIndex].time;
      let slEndTime = bars[maxSimIndex].time;
      let tradeExitIndex = maxSimIndex;

      for (let m = i + 1; m <= maxSimIndex; m++) {
        const b = bars[m];
        if (!tp1Hit && b.high >= tp1) {
          tp1Hit = true;
          tp1EndTime = b.time;
        }
        const currentSl = tp1Hit ? entryPrice : sl;
        if (b.low <= currentSl) {
          if (!tp1Hit) tp1EndTime = b.time;
          tp2EndTime = b.time;
          slEndTime = b.time;
          tradeExitIndex = m;
          break;
        }
        if (b.high >= tp2) {
          tp2EndTime = b.time;
          slEndTime = b.time;
          tradeExitIndex = m;
          break;
        }
      }

      if (showPositionTool) {
        positionBoxes.push({
          id: "pos-risk-" + i,
          startTime: c0.time,
          endTime: slEndTime,
          top: entryPrice,
          bottom: sl,
          color: "#e53935",
          fillColor: "rgba(229, 57, 53, " + posBoxOpacity + ")",
          label: tp1Hit ? "SL: BE (" + entryPrice.toFixed(2) + ")" : "SL: " + sl.toFixed(2)
        });
        positionBoxes.push({
          id: "pos-tp1-" + i,
          startTime: c0.time,
          endTime: tp1EndTime,
          top: tp1,
          bottom: entryPrice,
          color: "#00c853",
          fillColor: "rgba(0, 200, 83, " + posBoxOpacity + ")",
          label: "TP1 (1:3): " + tp1.toFixed(2)
        });
        positionBoxes.push({
          id: "pos-tp2-" + i,
          startTime: c0.time,
          endTime: tp2EndTime,
          top: tp2,
          bottom: tp1,
          color: "#00c853",
          fillColor: "rgba(0, 200, 83, " + (posBoxOpacity * 0.5) + ")",
          label: "TP2 (1:5): " + tp2.toFixed(2)
        });
      }

      lastTradeExitIndex = tradeExitIndex;

      if (typeof alertcondition === "function" && i === bars.length - 1) {
        alertcondition(true, "Phantom Master Long Signal", "[Phantom Master Engine] Institutional Long Signal generated! (" + signalLabel + ")");
      }
    } else if (signalShort) {
      const entryPrice = c0.close;
      const sl = Math.max(c0.high * 1.001, (lastSwingHigh || c0.high) * 1.002);
      const riskDist = Math.max(sl - entryPrice, 0.001);
      const tp1 = entryPrice - (riskDist * rrTP1);
      const tp2 = entryPrice - (riskDist * rrTP2);

      const maxSimIndex = Math.min(bars.length - 1, i + 40);
      let tp1Hit = false;
      let tp1EndTime = bars[maxSimIndex].time;
      let tp2EndTime = bars[maxSimIndex].time;
      let slEndTime = bars[maxSimIndex].time;
      let tradeExitIndex = maxSimIndex;

      for (let m = i + 1; m <= maxSimIndex; m++) {
        const b = bars[m];
        if (!tp1Hit && b.low <= tp1) {
          tp1Hit = true;
          tp1EndTime = b.time;
        }
        const currentSl = tp1Hit ? entryPrice : sl;
        if (b.high >= currentSl) {
          if (!tp1Hit) tp1EndTime = b.time;
          tp2EndTime = b.time;
          slEndTime = b.time;
          tradeExitIndex = m;
          break;
        }
        if (b.low <= tp2) {
          tp2EndTime = b.time;
          slEndTime = b.time;
          tradeExitIndex = m;
          break;
        }
      }

      if (showPositionTool) {
        positionBoxes.push({
          id: "pos-risk-" + i,
          startTime: c0.time,
          endTime: slEndTime,
          top: sl,
          bottom: entryPrice,
          color: "#e53935",
          fillColor: "rgba(229, 57, 53, " + posBoxOpacity + ")",
          label: tp1Hit ? "SL: BE (" + entryPrice.toFixed(2) + ")" : "SL: " + sl.toFixed(2)
        });
        positionBoxes.push({
          id: "pos-tp1-" + i,
          startTime: c0.time,
          endTime: tp1EndTime,
          top: entryPrice,
          bottom: tp1,
          color: "#00c853",
          fillColor: "rgba(0, 200, 83, " + posBoxOpacity + ")",
          label: "TP1 (1:3): " + tp1.toFixed(2)
        });
        positionBoxes.push({
          id: "pos-tp2-" + i,
          startTime: c0.time,
          endTime: tp2EndTime,
          top: tp1,
          bottom: tp2,
          color: "#00c853",
          fillColor: "rgba(0, 200, 83, " + (posBoxOpacity * 0.5) + ")",
          label: "TP2 (1:5): " + tp2.toFixed(2)
        });
      }

      lastTradeExitIndex = tradeExitIndex;

      if (typeof alertcondition === "function" && i === bars.length - 1) {
        alertcondition(true, "Phantom Master Short Signal", "[Phantom Master Engine] Institutional Short Signal generated! (" + signalLabel + ")");
      }
    }
  }

  return {
    boxes: [...boxes, ...positionBoxes],
    data: []
  };
}`;

export const DEFAULT_ADAM_EVE_SCRIPT = `/**
 * Mochex Custom Indicator: Adam & Eve Pattern Recognition Engine
 * Detects Bullish Adam (sharp V-spike bottom) & Eve (rounded U-bottom) double bottoms,
 * as well as Bearish Inverted Adam & Eve double tops. Identifies Neckline breakout levels,
 * projects measured-move targets (1:1 & 1.618 Fib), and emits real-time alertcondition() events.
 *
 * @param {Array} bars - Candlestick dataset [{ time, open, high, low, close, volume }]
 * @param {Object} inputs - User configurable parameters
 * @param {Object} ta - Technical analysis library
 * @param {Object} strategy - Pine-style strategy tester
 * @param {Function} alertcondition - Real-time alert emitter
 */
function calculate(bars, inputs, ta, strategy, alertcondition) {
  inputs = inputs || {};
  const lookback = inputs.lookback || 3;
  const maxPatternBars = inputs.maxPatternBars || 60;
  const minEveBars = inputs.minEveBars || 3;
  const priceTolerancePct = inputs.priceTolerancePct !== undefined ? inputs.priceTolerancePct : 4.0;
  const minBouncePct = inputs.minBouncePct || 0.6;
  const showPositionTool = inputs.showPositionTool !== undefined ? inputs.showPositionTool : true;
  const slMode = inputs.slMode || "extreme"; // "extreme" (Adam extreme spike) or "eve"
  const rrTP1 = inputs.rrTP1 !== undefined ? inputs.rrTP1 : 1.0;
  const rrTP2 = inputs.rrTP2 !== undefined ? inputs.rrTP2 : 3.0;
  const maxBreakoutBars = inputs.maxBreakoutBars || 35;

  if (!bars || bars.length < 6) {
    return { boxes: [], data: (bars || []).map(b => ({ time: b.time, value: b.close })) };
  }

  const boxes = [];
  const positionBoxes = [];

  function isSwingLow(idx, lb) {
    if (idx < lb || idx > bars.length - 1 - lb) return false;
    const l = bars[idx].low;
    for (let k = idx - lb; k <= idx + lb; k++) {
      if (k !== idx && bars[k].low <= l) return false;
    }
    return true;
  }

  function isSwingHigh(idx, lb) {
    if (idx < lb || idx > bars.length - 1 - lb) return false;
    const h = bars[idx].high;
    for (let k = idx - lb; k <= idx + lb; k++) {
      if (k !== idx && bars[k].high >= h) return false;
    }
    return true;
  }

  const swingLows = [];
  const swingHighs = [];
  for (let i = lookback; i < bars.length - lookback; i++) {
    if (isSwingLow(i, lookback)) swingLows.push({ index: i, price: bars[i].low, time: bars[i].time });
    if (isSwingHigh(i, lookback)) swingHighs.push({ index: i, price: bars[i].high, time: bars[i].time });
  }

  // Track last trade exit bar to enforce single non-overlapping entries
  let lastBullishTradeExit = -1;

  // 1. Bullish Adam & Eve (V-Bottom + U-Bottom)
  for (let a = 0; a < swingLows.length - 1; a++) {
    const adam = swingLows[a];
    if (adam.index <= lastBullishTradeExit) continue;

    for (let e = a + 1; e < swingLows.length; e++) {
      const eveCandidate = swingLows[e];
      if (eveCandidate.index <= lastBullishTradeExit) continue;

      const spanBars = eveCandidate.index - adam.index;
      if (spanBars > maxPatternBars || spanBars < 4) continue;

      let neckline = null;
      for (const sh of swingHighs) {
        if (sh.index > adam.index && sh.index < eveCandidate.index) {
          if (!neckline || sh.price > neckline.price) {
            neckline = sh;
          }
        }
      }
      if (!neckline) continue;

      const bouncePct = ((neckline.price - adam.price) / adam.price) * 100;
      if (bouncePct < minBouncePct) continue;

      const diffPct = (Math.abs(eveCandidate.price - adam.price) / adam.price) * 100;
      if (diffPct > priceTolerancePct) continue;

      const eveWidth = eveCandidate.index - neckline.index;
      if (eveWidth < minEveBars) continue;

      // Find first breakout bar within maxBreakoutBars and before pattern is invalidated
      const searchEnd = Math.min(bars.length, eveCandidate.index + maxBreakoutBars);
      let breakoutBar = null;
      let invalidated = false;

      for (let k = eveCandidate.index + 1; k < searchEnd; k++) {
        // Invalidation: candle closes below the pattern base
        if (bars[k].close < Math.min(adam.price, eveCandidate.price) * 0.995) {
          invalidated = true;
          break;
        }
        if (bars[k].close > neckline.price) {
          breakoutBar = { bar: bars[k], index: k };
          break;
        }
      }

      if (invalidated || !breakoutBar) continue;

      const height = neckline.price - Math.min(adam.price, eveCandidate.price);
      const sl = slMode === "eve" ? eveCandidate.price : Math.min(adam.price, eveCandidate.price);
      const riskDist = Math.max(breakoutBar.bar.close - sl, breakoutBar.bar.close * 0.002);
      const tp1 = breakoutBar.bar.close + (riskDist * rrTP1);
      const tp2 = breakoutBar.bar.close + (riskDist * rrTP2);

      boxes.push({
        id: "adam-v-" + adam.index,
        type: "ZONE",
        startTime: bars[Math.max(0, adam.index - 1)].time,
        endTime: bars[Math.min(bars.length - 1, adam.index + 1)].time,
        top: adam.price + height * 0.25,
        bottom: adam.price,
        mid: adam.price + height * 0.125,
        color: "#00d8ff",
        fillColor: "rgba(0, 216, 255, 0.22)",
        label: "Adam (V-Bottom)",
        showMidLine: false,
      });

      boxes.push({
        id: "eve-u-" + eveCandidate.index,
        type: "ZONE",
        startTime: bars[neckline.index].time,
        endTime: breakoutBar.bar.time,
        top: eveCandidate.price + height * 0.35,
        bottom: eveCandidate.price,
        mid: eveCandidate.price + height * 0.175,
        color: "#e040fb",
        fillColor: "rgba(224, 64, 251, 0.18)",
        label: "Eve (U-Bottom)",
        showMidLine: false,
      });

      let tp1EndTime = bars[bars.length - 1].time;
      let tp2EndTime = bars[bars.length - 1].time;
      let slEndTime = bars[bars.length - 1].time;
      let tradeEndIndex = bars.length - 1;
      let tp1Hit = false;

      for (let m = breakoutBar.index + 1; m < bars.length; m++) {
        const b = bars[m];
        if (b.low <= sl) {
          if (!tp1Hit) tp1EndTime = b.time;
          tp2EndTime = b.time;
          slEndTime = b.time;
          tradeEndIndex = m;
          break;
        }
        if (!tp1Hit && b.high >= tp1) {
          tp1Hit = true;
          tp1EndTime = b.time;
        }
        if (b.high >= tp2) {
          tp2EndTime = b.time;
          slEndTime = b.time;
          tradeEndIndex = m;
          break;
        }
      }

      boxes.push({
        id: "neckline-" + neckline.index,
        type: "BULLISH",
        startTime: neckline.time,
        endTime: slEndTime,
        top: neckline.price,
        bottom: neckline.price,
        color: "#00c087",
        fillColor: "rgba(0, 192, 135, 0.15)",
        label: "Neckline Breakout (" + neckline.price.toFixed(2) + ")",
        showMidLine: false,
      });

      if (showPositionTool) {
        positionBoxes.push({
          id: "pos-tp1-" + breakoutBar.index,
          type: "POSITION",
          startTime: breakoutBar.bar.time,
          endTime: tp1EndTime,
          top: tp1,
          bottom: breakoutBar.bar.close,
          color: "#00c853",
          fillColor: "rgba(0, 200, 83, 0.22)",
          label: "TP1 (" + rrTP1 + "R): " + tp1.toFixed(2),
          showMidLine: false,
        });

        positionBoxes.push({
          id: "pos-tp2-" + breakoutBar.index,
          type: "POSITION",
          startTime: breakoutBar.bar.time,
          endTime: tp2EndTime,
          top: tp2,
          bottom: breakoutBar.bar.close,
          color: "#00e676",
          fillColor: "rgba(0, 230, 118, 0.16)",
          label: "TP2 (" + rrTP2 + "R): " + tp2.toFixed(2),
          showMidLine: false,
        });

        positionBoxes.push({
          id: "pos-sl-" + breakoutBar.index,
          type: "POSITION",
          startTime: breakoutBar.bar.time,
          endTime: slEndTime,
          top: breakoutBar.bar.close,
          bottom: sl,
          color: "#e53935",
          fillColor: "rgba(229, 57, 53, 0.22)",
          label: "SL (Extreme Adam): " + sl.toFixed(2),
          showMidLine: false,
        });
      }

      if (typeof alertcondition === "function" && breakoutBar.index === bars.length - 1) {
        alertcondition(true, "Bullish Adam & Eve Breakout", "Adam & Eve neckline breakout confirmed at " + breakoutBar.bar.close.toFixed(2));
      }

      if (strategy && typeof strategy.entry === "function") {
        strategy.at(breakoutBar.index).entry("AdamEve-Long", "LONG", {
          takeProfit: tp1,
          stopLoss: sl,
        });
      }

      lastBullishTradeExit = tradeEndIndex;
      break; // Found 1 valid entry for this Adam bottom, do not create duplicate entries
    }
  }

  // Track last bearish trade exit bar to enforce single non-overlapping entries
  let lastBearishTradeExit = -1;

  // 2. Bearish Inverted Adam & Eve (V-Top + U-Top)
  for (let a = 0; a < swingHighs.length - 1; a++) {
    const adam = swingHighs[a];
    if (adam.index <= lastBearishTradeExit) continue;

    for (let e = a + 1; e < swingHighs.length; e++) {
      const eveCandidate = swingHighs[e];
      if (eveCandidate.index <= lastBearishTradeExit) continue;

      const spanBars = eveCandidate.index - adam.index;
      if (spanBars > maxPatternBars || spanBars < 4) continue;

      let neckline = null;
      for (const sl of swingLows) {
        if (sl.index > adam.index && sl.index < eveCandidate.index) {
          if (!neckline || sl.price < neckline.price) {
            neckline = sl;
          }
        }
      }
      if (!neckline) continue;

      const pullPct = ((adam.price - neckline.price) / adam.price) * 100;
      if (pullPct < minBouncePct) continue;

      const diffPct = (Math.abs(eveCandidate.price - adam.price) / adam.price) * 100;
      if (diffPct > priceTolerancePct) continue;

      const eveWidth = eveCandidate.index - neckline.index;
      if (eveWidth < minEveBars) continue;

      const searchEnd = Math.min(bars.length, eveCandidate.index + maxBreakoutBars);
      let breakdownBar = null;
      let invalidated = false;

      for (let k = eveCandidate.index + 1; k < searchEnd; k++) {
        // Invalidation: candle closes above the pattern top
        if (bars[k].close > Math.max(adam.price, eveCandidate.price) * 1.005) {
          invalidated = true;
          break;
        }
        if (bars[k].close < neckline.price) {
          breakdownBar = { bar: bars[k], index: k };
          break;
        }
      }

      if (invalidated || !breakdownBar) continue;

      const height = Math.max(adam.price, eveCandidate.price) - neckline.price;
      const sl = slMode === "eve" ? eveCandidate.price : Math.max(adam.price, eveCandidate.price);
      const riskDist = Math.max(sl - breakdownBar.bar.close, breakdownBar.bar.close * 0.002);
      const tp1 = breakdownBar.bar.close - (riskDist * rrTP1);
      const tp2 = breakdownBar.bar.close - (riskDist * rrTP2);

      boxes.push({
        id: "adam-v-top-" + adam.index,
        type: "ZONE",
        startTime: bars[Math.max(0, adam.index - 1)].time,
        endTime: bars[Math.min(bars.length - 1, adam.index + 1)].time,
        top: adam.price,
        bottom: adam.price - height * 0.25,
        color: "#ff3b30",
        fillColor: "rgba(255, 59, 48, 0.22)",
        label: "Adam (V-Top)",
        showMidLine: false,
      });

      boxes.push({
        id: "eve-u-top-" + eveCandidate.index,
        type: "ZONE",
        startTime: bars[neckline.index].time,
        endTime: breakdownBar.bar.time,
        top: eveCandidate.price,
        bottom: eveCandidate.price - height * 0.35,
        color: "#ff9800",
        fillColor: "rgba(255, 152, 0, 0.18)",
        label: "Eve (U-Top)",
        showMidLine: false,
      });

      let tp1EndTime = bars[bars.length - 1].time;
      let tp2EndTime = bars[bars.length - 1].time;
      let slEndTime = bars[bars.length - 1].time;
      let tradeEndIndex = bars.length - 1;
      let tp1Hit = false;

      for (let m = breakdownBar.index + 1; m < bars.length; m++) {
        const b = bars[m];
        if (b.high >= sl) {
          if (!tp1Hit) tp1EndTime = b.time;
          tp2EndTime = b.time;
          slEndTime = b.time;
          tradeEndIndex = m;
          break;
        }
        if (!tp1Hit && b.low <= tp1) {
          tp1Hit = true;
          tp1EndTime = b.time;
        }
        if (b.low <= tp2) {
          tp2EndTime = b.time;
          slEndTime = b.time;
          tradeEndIndex = m;
          break;
        }
      }

      boxes.push({
        id: "neckline-down-" + neckline.index,
        type: "BEARISH",
        startTime: neckline.time,
        endTime: slEndTime,
        top: neckline.price,
        bottom: neckline.price,
        color: "#f23645",
        fillColor: "rgba(242, 54, 69, 0.15)",
        label: "Neckline Breakdown (" + neckline.price.toFixed(2) + ")",
        showMidLine: false,
      });

      if (showPositionTool) {
        positionBoxes.push({
          id: "pos-tp1-short-" + breakdownBar.index,
          type: "POSITION",
          startTime: breakdownBar.bar.time,
          endTime: tp1EndTime,
          top: breakdownBar.bar.close,
          bottom: tp1,
          color: "#00c853",
          fillColor: "rgba(0, 200, 83, 0.22)",
          label: "TP1 (" + rrTP1 + "R): " + tp1.toFixed(2),
          showMidLine: false,
        });

        positionBoxes.push({
          id: "pos-tp2-short-" + breakdownBar.index,
          type: "POSITION",
          startTime: breakdownBar.bar.time,
          endTime: tp2EndTime,
          top: breakdownBar.bar.close,
          bottom: tp2,
          color: "#00e676",
          fillColor: "rgba(0, 230, 118, 0.16)",
          label: "TP2 (" + rrTP2 + "R): " + tp2.toFixed(2),
          showMidLine: false,
        });

        positionBoxes.push({
          id: "pos-sl-short-" + breakdownBar.index,
          type: "POSITION",
          startTime: breakdownBar.bar.time,
          endTime: slEndTime,
          top: sl,
          bottom: breakdownBar.bar.close,
          color: "#e53935",
          fillColor: "rgba(229, 57, 53, 0.22)",
          label: "SL (Extreme Adam): " + sl.toFixed(2),
          showMidLine: false,
        });
      }

      if (typeof alertcondition === "function" && breakdownBar.index === bars.length - 1) {
        alertcondition(true, "Bearish Adam & Eve Breakdown", "Adam & Eve neckline breakdown confirmed at " + breakdownBar.bar.close.toFixed(2));
      }

      if (strategy && typeof strategy.entry === "function") {
        strategy.at(breakdownBar.index).entry("AdamEve-Short", "SHORT", {
          takeProfit: tp1,
          stopLoss: sl,
        });
      }

      lastBearishTradeExit = tradeEndIndex;
      break; // Found 1 valid entry for this Adam top, do not create duplicate entries
    }
  }

  return {
    boxes: [...boxes, ...positionBoxes],
    data: bars.map(b => ({ time: b.time, value: b.close }))
  };
}
`;

export const DEFAULT_HEAD_SHOULDERS_SCRIPT = `/**
 * Mochex Custom Indicator: Head and Shoulders (H&S) Pattern Engine
 * Recognizes classic Bearish Head & Shoulders and Bullish Inverse Head & Shoulders reversals.
 * Validates Left Shoulder, Head dominance, Right Shoulder symmetry, draws dynamic Neckline rays,
 * projects measured-move targets (1:1 & 1.618 Fib), and emits real-time alertcondition() events.
 *
 * @param {Array} bars - Candlestick dataset [{ time, open, high, low, close, volume }]
 * @param {Object} inputs - User configurable parameters
 * @param {Object} ta - Technical analysis library
 * @param {Object} strategy - Pine-style strategy tester
 * @param {Function} alertcondition - Real-time alert emitter
 */
function calculate(bars, inputs, ta, strategy, alertcondition) {
  inputs = inputs || {};
  const lookback = inputs.lookback || 3;
  const shoulderTolerancePct = inputs.shoulderTolerancePct !== undefined ? inputs.shoulderTolerancePct : 6.0;
  const minHeadDominancePct = inputs.minHeadDominancePct !== undefined ? inputs.minHeadDominancePct : 0.6;
  const showPositionTool = inputs.showPositionTool !== undefined ? inputs.showPositionTool : true;
  const slMode = inputs.slMode || "head"; // "head" (extreme peak/trough) or "shoulder"
  const rrTP1 = inputs.rrTP1 !== undefined ? inputs.rrTP1 : 1.0;
  const rrTP2 = inputs.rrTP2 !== undefined ? inputs.rrTP2 : 3.0;
  const maxBreakoutBars = inputs.maxBreakoutBars || 35;

  if (!bars || bars.length < 6) {
    return { boxes: [], data: (bars || []).map(b => ({ time: b.time, value: b.close })) };
  }

  const boxes = [];
  const positionBoxes = [];

  function isSwingLow(idx, lb) {
    if (idx < lb || idx > bars.length - 1 - lb) return false;
    const l = bars[idx].low;
    for (let k = idx - lb; k <= idx + lb; k++) {
      if (k !== idx && bars[k].low <= l) return false;
    }
    return true;
  }

  function isSwingHigh(idx, lb) {
    if (idx < lb || idx > bars.length - 1 - lb) return false;
    const h = bars[idx].high;
    for (let k = idx - lb; k <= idx + lb; k++) {
      if (k !== idx && bars[k].high >= h) return false;
    }
    return true;
  }

  const swingLows = [];
  const swingHighs = [];
  for (let i = lookback; i < bars.length - lookback; i++) {
    if (isSwingLow(i, lookback)) swingLows.push({ index: i, price: bars[i].low, time: bars[i].time });
    if (isSwingHigh(i, lookback)) swingHighs.push({ index: i, price: bars[i].high, time: bars[i].time });
  }

  let lastBearishHsTradeExit = -1;

  // 1. Bearish Head & Shoulders
  for (let hIdx = 1; hIdx < swingHighs.length - 1; hIdx++) {
    const head = swingHighs[hIdx];
    const ls = swingHighs[hIdx - 1];
    const rs = swingHighs[hIdx + 1];

    if (ls.index <= lastBearishHsTradeExit) continue;

    const headDominanceLS = ((head.price - ls.price) / ls.price) * 100;
    const headDominanceRS = ((head.price - rs.price) / rs.price) * 100;
    if (headDominanceLS < minHeadDominancePct || headDominanceRS < minHeadDominancePct) continue;

    const shoulderDiff = (Math.abs(ls.price - rs.price) / ls.price) * 100;
    if (shoulderDiff > shoulderTolerancePct) continue;

    let t1 = null;
    let t2 = null;
    for (const sl of swingLows) {
      if (sl.index > ls.index && sl.index < head.index) {
        if (!t1 || sl.price < t1.price) t1 = sl;
      }
      if (sl.index > head.index && sl.index < rs.index) {
        if (!t2 || sl.price < t2.price) t2 = sl;
      }
    }

    if (!t1 || !t2) continue;

    const necklinePrice = (t1.price + t2.price) / 2;
    const patternHeight = head.price - necklinePrice;

    const searchEnd = Math.min(bars.length, rs.index + maxBreakoutBars);
    let breakdownBar = null;
    let invalidated = false;

    for (let k = rs.index + 1; k < searchEnd; k++) {
      // Invalidation: candle closes above Head
      if (bars[k].close > head.price) {
        invalidated = true;
        break;
      }
      if (bars[k].close < necklinePrice) {
        breakdownBar = { bar: bars[k], index: k };
        break;
      }
    }

    if (invalidated || !breakdownBar) continue;

    const sl = slMode === "shoulder" ? rs.price : head.price;
    const riskDist = Math.max(sl - breakdownBar.bar.close, breakdownBar.bar.close * 0.002);
    const tp1 = breakdownBar.bar.close - (riskDist * rrTP1);
    const tp2 = breakdownBar.bar.close - (riskDist * rrTP2);

    boxes.push({
      id: "hs-ls-" + ls.index,
      type: "ZONE",
      startTime: bars[Math.max(0, ls.index - 1)].time,
      endTime: bars[Math.min(bars.length - 1, ls.index + 1)].time,
      top: ls.price,
      bottom: ls.price - patternHeight * 0.2,
      color: "#f5ac37",
      fillColor: "rgba(245, 172, 55, 0.22)",
      label: "Left Shoulder (" + ls.price.toFixed(2) + ")",
      showMidLine: false,
    });

    boxes.push({
      id: "hs-head-" + head.index,
      type: "ZONE",
      startTime: bars[Math.max(0, head.index - 1)].time,
      endTime: bars[Math.min(bars.length - 1, head.index + 1)].time,
      top: head.price,
      bottom: head.price - patternHeight * 0.25,
      color: "#ff3b30",
      fillColor: "rgba(255, 59, 48, 0.25)",
      label: "Head (" + head.price.toFixed(2) + ")",
      showMidLine: false,
    });

    boxes.push({
      id: "hs-rs-" + rs.index,
      type: "ZONE",
      startTime: bars[Math.max(0, rs.index - 1)].time,
      endTime: bars[Math.min(bars.length - 1, rs.index + 1)].time,
      top: rs.price,
      bottom: rs.price - patternHeight * 0.2,
      color: "#f5ac37",
      fillColor: "rgba(245, 172, 55, 0.22)",
      label: "Right Shoulder (" + rs.price.toFixed(2) + ")",
      showMidLine: false,
    });

    let tp1EndTime = bars[bars.length - 1].time;
    let tp2EndTime = bars[bars.length - 1].time;
    let slEndTime = bars[bars.length - 1].time;
    let tradeEndIndex = bars.length - 1;
    let tp1Hit = false;

    for (let m = breakdownBar.index + 1; m < bars.length; m++) {
      const b = bars[m];
      if (b.high >= sl) {
        if (!tp1Hit) tp1EndTime = b.time;
        tp2EndTime = b.time;
        slEndTime = b.time;
        tradeEndIndex = m;
        break;
      }
      if (!tp1Hit && b.low <= tp1) {
        tp1Hit = true;
        tp1EndTime = b.time;
      }
      if (b.low <= tp2) {
        tp2EndTime = b.time;
        slEndTime = b.time;
        tradeEndIndex = m;
        break;
      }
    }

    boxes.push({
      id: "hs-neckline-" + t1.index,
      type: "BEARISH",
      startTime: t1.time,
      endTime: slEndTime,
      top: necklinePrice,
      bottom: necklinePrice,
      color: "#e53935",
      fillColor: "rgba(229, 57, 53, 0.15)",
      label: "Neckline (" + necklinePrice.toFixed(2) + ")",
      showMidLine: false,
    });

    if (showPositionTool) {
      positionBoxes.push({
        id: "pos-hs-tp1-" + breakdownBar.index,
        type: "POSITION",
        startTime: breakdownBar.bar.time,
        endTime: tp1EndTime,
        top: breakdownBar.bar.close,
        bottom: tp1,
        color: "#00c853",
        fillColor: "rgba(0, 200, 83, 0.22)",
        label: "TP1 (" + rrTP1 + "R): " + tp1.toFixed(2),
        showMidLine: false,
      });

      positionBoxes.push({
        id: "pos-hs-tp2-" + breakdownBar.index,
        type: "POSITION",
        startTime: breakdownBar.bar.time,
        endTime: tp2EndTime,
        top: breakdownBar.bar.close,
        bottom: tp2,
        color: "#00e676",
        fillColor: "rgba(0, 230, 118, 0.16)",
        label: "TP2 (" + rrTP2 + "R): " + tp2.toFixed(2),
        showMidLine: false,
      });

      positionBoxes.push({
        id: "pos-hs-sl-" + breakdownBar.index,
        type: "POSITION",
        startTime: breakdownBar.bar.time,
        endTime: slEndTime,
        top: sl,
        bottom: breakdownBar.bar.close,
        color: "#e53935",
        fillColor: "rgba(229, 57, 53, 0.22)",
        label: "SL (Extreme Head): " + sl.toFixed(2),
        showMidLine: false,
      });
    }

    if (typeof alertcondition === "function" && breakdownBar.index === bars.length - 1) {
      alertcondition(true, "Bearish Head & Shoulders Breakdown", "H&S breakdown confirmed below neckline at " + breakdownBar.bar.close.toFixed(2));
    }

    if (strategy && typeof strategy.entry === "function") {
      strategy.at(breakdownBar.index).entry("HeadShoulders-Short", "SHORT", {
        takeProfit: tp1,
        stopLoss: sl,
      });
    }

    lastBearishHsTradeExit = tradeEndIndex;
  }

  let lastBullishIhsTradeExit = -1;

  // 2. Bullish Inverse Head & Shoulders
  for (let hIdx = 1; hIdx < swingLows.length - 1; hIdx++) {
    const head = swingLows[hIdx];
    const ls = swingLows[hIdx - 1];
    const rs = swingLows[hIdx + 1];

    if (ls.index <= lastBullishIhsTradeExit) continue;

    const headDominanceLS = ((ls.price - head.price) / ls.price) * 100;
    const headDominanceRS = ((rs.price - head.price) / rs.price) * 100;
    if (headDominanceLS < minHeadDominancePct || headDominanceRS < minHeadDominancePct) continue;

    const shoulderDiff = (Math.abs(ls.price - rs.price) / ls.price) * 100;
    if (shoulderDiff > shoulderTolerancePct) continue;

    let p1 = null;
    let p2 = null;
    for (const sh of swingHighs) {
      if (sh.index > ls.index && sh.index < head.index) {
        if (!p1 || sh.price > p1.price) p1 = sh;
      }
      if (sh.index > head.index && sh.index < rs.index) {
        if (!p2 || sh.price > p2.price) p2 = sh;
      }
    }

    if (!p1 || !p2) continue;

    const necklinePrice = (p1.price + p2.price) / 2;
    const patternHeight = necklinePrice - head.price;

    const searchEnd = Math.min(bars.length, rs.index + maxBreakoutBars);
    let breakoutBar = null;
    let invalidated = false;

    for (let k = rs.index + 1; k < searchEnd; k++) {
      // Invalidation: candle closes below Head
      if (bars[k].close < head.price) {
        invalidated = true;
        break;
      }
      if (bars[k].close > necklinePrice) {
        breakoutBar = { bar: bars[k], index: k };
        break;
      }
    }

    if (invalidated || !breakoutBar) continue;

    const sl = slMode === "shoulder" ? rs.price : head.price;
    const riskDist = Math.max(breakoutBar.bar.close - sl, breakoutBar.bar.close * 0.002);
    const tp1 = breakoutBar.bar.close + (riskDist * rrTP1);
    const tp2 = breakoutBar.bar.close + (riskDist * rrTP2);

    boxes.push({
      id: "ihs-ls-" + ls.index,
      type: "ZONE",
      startTime: bars[Math.max(0, ls.index - 1)].time,
      endTime: bars[Math.min(bars.length - 1, ls.index + 1)].time,
      top: ls.price + patternHeight * 0.2,
      bottom: ls.price,
      color: "#00d8ff",
      fillColor: "rgba(0, 216, 255, 0.22)",
      label: "Inv Left Shoulder (" + ls.price.toFixed(2) + ")",
      showMidLine: false,
    });

    boxes.push({
      id: "ihs-head-" + head.index,
      type: "ZONE",
      startTime: bars[Math.max(0, head.index - 1)].time,
      endTime: bars[Math.min(bars.length - 1, head.index + 1)].time,
      top: head.price + patternHeight * 0.25,
      bottom: head.price,
      color: "#00e676",
      fillColor: "rgba(0, 230, 118, 0.25)",
      label: "Inv Head (" + head.price.toFixed(2) + ")",
      showMidLine: false,
    });

    boxes.push({
      id: "ihs-rs-" + rs.index,
      type: "ZONE",
      startTime: bars[Math.max(0, rs.index - 1)].time,
      endTime: bars[Math.min(bars.length - 1, rs.index + 1)].time,
      top: rs.price + patternHeight * 0.2,
      bottom: rs.price,
      color: "#00d8ff",
      fillColor: "rgba(0, 216, 255, 0.22)",
      label: "Inv Right Shoulder (" + rs.price.toFixed(2) + ")",
      showMidLine: false,
    });

    let tp1EndTime = bars[bars.length - 1].time;
    let tp2EndTime = bars[bars.length - 1].time;
    let slEndTime = bars[bars.length - 1].time;
    let tradeEndIndex = bars.length - 1;
    let tp1Hit = false;

    for (let m = breakoutBar.index + 1; m < bars.length; m++) {
      const b = bars[m];
      if (b.low <= sl) {
        if (!tp1Hit) tp1EndTime = b.time;
        tp2EndTime = b.time;
        slEndTime = b.time;
        tradeEndIndex = m;
        break;
      }
      if (!tp1Hit && b.high >= tp1) {
        tp1Hit = true;
        tp1EndTime = b.time;
      }
      if (b.high >= tp2) {
        tp2EndTime = b.time;
        slEndTime = b.time;
        tradeEndIndex = m;
        break;
      }
    }

    boxes.push({
      id: "ihs-neckline-" + p1.index,
      type: "BULLISH",
      startTime: p1.time,
      endTime: slEndTime,
      top: necklinePrice,
      bottom: necklinePrice,
      color: "#00c087",
      fillColor: "rgba(0, 192, 135, 0.15)",
      label: "Neckline (" + necklinePrice.toFixed(2) + ")",
      showMidLine: false,
    });

    if (showPositionTool) {
      positionBoxes.push({
        id: "pos-ihs-tp1-" + breakoutBar.index,
        type: "POSITION",
        startTime: breakoutBar.bar.time,
        endTime: tp1EndTime,
        top: tp1,
        bottom: breakoutBar.bar.close,
        color: "#00c853",
        fillColor: "rgba(0, 200, 83, 0.22)",
        label: "TP1 (" + rrTP1 + "R): " + tp1.toFixed(2),
        showMidLine: false,
      });

      positionBoxes.push({
        id: "pos-ihs-tp2-" + breakoutBar.index,
        type: "POSITION",
        startTime: breakoutBar.bar.time,
        endTime: tp2EndTime,
        top: tp2,
        bottom: breakoutBar.bar.close,
        color: "#00e676",
        fillColor: "rgba(0, 230, 118, 0.16)",
        label: "TP2 (" + rrTP2 + "R): " + tp2.toFixed(2),
        showMidLine: false,
      });

      positionBoxes.push({
        id: "pos-ihs-sl-" + breakoutBar.index,
        type: "POSITION",
        startTime: breakoutBar.bar.time,
        endTime: slEndTime,
        top: sl,
        bottom: breakoutBar.bar.close,
        color: "#e53935",
        fillColor: "rgba(229, 57, 53, 0.22)",
        label: "SL (Extreme Head): " + sl.toFixed(2),
        showMidLine: false,
      });
    }

    if (typeof alertcondition === "function" && breakoutBar.index === bars.length - 1) {
      alertcondition(true, "Bullish Inverse H&S Breakout", "Inverse H&S breakout confirmed above neckline at " + breakoutBar.bar.close.toFixed(2));
    }

    if (strategy && typeof strategy.entry === "function") {
      strategy.at(breakoutBar.index).entry("InverseHS-Long", "LONG", {
        takeProfit: tp1,
        stopLoss: sl,
      });
    }

    lastBullishIhsTradeExit = tradeEndIndex;
  }

  return {
    boxes: [...boxes, ...positionBoxes],
    data: bars.map(b => ({ time: b.time, value: b.close }))
  };
}
`;

export function getCustomScripts(): CustomScript[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const defaultSeeds: CustomScript[] = [
      {
        id: "script-fvg-unmitigated",
        name: "Unmitigated FVG (0% Hit)",
        description: "Strict 0% wick touch Fair Value Gap detector with 50% equilibrium level.",
        code: DEFAULT_FVG_SCRIPT,
        type: "indicator",
        color: "#00d8ff",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "script-order-blocks",
        name: "Institutional Order Blocks (OB)",
        description: "Identifies unmitigated baseline order block candles with 50% Mean Threshold.",
        code: DEFAULT_OB_SCRIPT,
        type: "indicator",
        color: "#089981",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "script-phantom-smc",
        name: "Phantom SMC Supply & Demand (v7)",
        description: "Phantom Smart Money Concepts: exact candle POIs, liquidity sweeps, CHoCH confirmation entries, and Long/Short position risk/reward boxes.",
        code: DEFAULT_PHANTOM_SMC_SCRIPT,
        type: "indicator",
        color: "#00e676",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "script-phantom-flip",
        name: "Phantom SMC S2D & D2S Flips (v7)",
        description: "Phantom Smart Money Concepts: S2D/D2S zone flips, origin base candle POIs, retest rejection entries, and Long/Short position risk/reward boxes.",
        code: DEFAULT_PHANTOM_FLIP_SCRIPT,
        type: "indicator",
        color: "#ff9800",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "script-phantom-idm",
        name: "Phantom SMC Inducement Sweeps (v7)",
        description: "Phantom Smart Money Concepts: Extreme POIs, Inducement (IDM) liquidity sweeps, rejection wick traps, and Long/Short position risk/reward boxes.",
        code: DEFAULT_PHANTOM_IDM_SCRIPT,
        type: "indicator",
        color: "#f5ac37",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "script-phantom-session",
        name: "Phantom SMC Session Killzone Sweeps (v7)",
        description: "Phantom Smart Money Concepts: Asian Range liquidity bounds, London/NY sweeps, and Long/Short position risk/reward boxes.",
        code: DEFAULT_PHANTOM_SESSION_SCRIPT,
        type: "indicator",
        color: "#00bcd4",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "script-phantom-continuation",
        name: "Phantom SMC Decisional vs Extreme Continuation (v7)",
        description: "Phantom Smart Money Concepts: BOS swing legs, 50% Equilibrium Discount/Premium POIs, and in-trend continuations.",
        code: DEFAULT_PHANTOM_CONTINUATION_SCRIPT,
        type: "indicator",
        color: "#2962ff",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "script-phantom-risk",
        name: "Phantom SMC Aggressive Risk Entry (v7)",
        description: "Phantom Smart Money Concepts: 50% Mean Threshold limit orders on swept POIs with confirmed Fair Value Gaps.",
        code: DEFAULT_PHANTOM_RISK_SCRIPT,
        type: "indicator",
        color: "#e91e63",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "script-phantom-breaker",
        name: "Phantom SMC Breaker Block Reversals (v7)",
        description: "Phantom Smart Money Concepts: Violated Order Block conversions into Breaker Demand and Breaker Supply.",
        code: DEFAULT_PHANTOM_BREAKER_SCRIPT,
        type: "indicator",
        color: "#ab47bc",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "script-adam-eve",
        name: "Adam and Eve Pattern Recognition",
        description: "Detects Bullish Adam (sharp V-spike bottom) and Eve (rounded U-bottom) and Bearish inverted patterns with Neckline breakout triggers, measured move targets, and risk/reward position tool brackets.",
        code: DEFAULT_ADAM_EVE_SCRIPT,
        type: "indicator",
        color: "#00d8ff",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "script-head-shoulders",
        name: "Head and Shoulders (H&S) Engine",
        description: "Identifies classic Bearish Head and Shoulders and Bullish Inverse Head and Shoulders patterns with Left/Right shoulder symmetry, dynamic neckline rays, and 1:1 measured move targets.",
        code: DEFAULT_HEAD_SHOULDERS_SCRIPT,
        type: "indicator",
        color: "#f5ac37",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
      {
        id: "script-phantom-master",
        name: "Phantom SMC Master Engine (v7)",
        description: "Phantom Smart Money Concepts: Unified multi-model orchestrator with conflict resolution and centralized risk engine.",
        code: DEFAULT_PHANTOM_MASTER_SCRIPT,
        type: "indicator",
        color: "#ffd700",
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ];

    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(defaultSeeds));
      return defaultSeeds;
    }

    const parsed: CustomScript[] = JSON.parse(raw);
    let updated = false;

    const v7Upgrades = new Set([
      "script-fvg-unmitigated",
      "script-order-blocks",
      "script-phantom-smc",
      "script-phantom-flip",
      "script-phantom-idm",
      "script-phantom-session",
      "script-phantom-continuation",
      "script-phantom-risk",
      "script-phantom-breaker",
      "script-phantom-master",
    ]);

    for (const seed of defaultSeeds) {
      const existing = parsed.find((s) => s.id === seed.id);
      if (!existing) {
        parsed.push(seed);
        updated = true;
      } else if (v7Upgrades.has(seed.id) && !existing.code.includes("[v7]")) {
        existing.name = seed.name;
        existing.code = seed.code;
        existing.updatedAt = Date.now();
        updated = true;
      }
    }

    if (updated) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
    }
    return parsed;
  } catch (err) {
    console.error("Failed to load custom scripts from localStorage", err);
    return [];
  }
}

/**
 * Saves or updates a custom script
 */
export function saveCustomScript(script: {
  id?: string;
  name: string;
  description?: string;
  code: string;
  type?: "indicator" | "strategy";
  color?: string;
  isPublished?: boolean;
}): CustomScript {
  const current = getCustomScripts();
  const id = script.id || `custom-script-${Date.now()}`;
  const now = Date.now();

  const isStrategy = script.code.includes("strategy.") || script.code.includes("strategy_");
  const scriptType = script.type || (isStrategy ? "strategy" : "indicator");

  const existingIndex = current.findIndex((s) => s.id === id);
  let savedItem: CustomScript;

  if (existingIndex >= 0) {
    savedItem = {
      ...current[existingIndex],
      name: script.name,
      description: script.description || current[existingIndex].description,
      code: script.code,
      type: scriptType,
      color: script.color || current[existingIndex].color || "#00d8ff",
      isPublished: script.isPublished !== undefined ? script.isPublished : current[existingIndex].isPublished,
      updatedAt: now,
    };
    current[existingIndex] = savedItem;
  } else {
    savedItem = {
      id,
      name: script.name || "Untitled Script",
      description: script.description || "Custom user script compiled via Web Worker sandbox.",
      code: script.code,
      type: scriptType,
      color: script.color || "#00d8ff",
      isPublished: script.isPublished || false,
      createdAt: now,
      updatedAt: now,
    };
    current.unshift(savedItem);
  }

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch (err) {
    console.error("Failed to persist custom script", err);
  }

  return savedItem;
}

/**
 * Deletes a custom script by ID
 */
export function deleteCustomScript(id: string): CustomScript[] {
  const current = getCustomScripts();
  const filtered = current.filter((s) => s.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.error("Failed to delete custom script", err);
  }
  return filtered;
}

/**
 * Saves the working draft in Script Studio
 */
export function saveStudioDraft(draft: { name: string; code: string; scriptId?: string }): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {}
}

/**
 * Retrieves the working draft
 */
export function getStudioDraft(): { name: string; code: string; scriptId?: string } | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export const DEFAULT_MTF_EMA_SCRIPT = `/**
 * MTF EMA — 20/50/100/200
 * Multi-Timeframe Exponential Moving Average Indicator
 * Supports EMA 20, 50, 100, and 200 across Current, 1m, 5m, 15m, 1h, 2h, 4h, 1d, 1w timeframes.
 * Features:
 * - Independent display checkboxes for all timeframes
 * - Current chart custom colors: EMA 20 (#ffffff), EMA 50 (#2962ff), EMA 100 (#f5ac37), EMA 200 (#ff7043)
 * - Single custom color per additional timeframe with progressive line thickness (1px -> 4px)
 * - Step-like Higher Timeframe alignment (zero lookahead bias)
 * - Optional provisional developing HTF mode
 * - Right-edge price labels with smart collision avoidance
 */
function calculate(bars, inputs, ta, strategy, alertcondition) {
  const closes = bars.map(b => b.close);
  const ema20 = ta.ema(closes, 20);
  const ema50 = ta.ema(closes, 50);
  const ema100 = ta.ema(closes, 100);
  const ema200 = ta.ema(closes, 200);

  return bars.map((bar, i) => ({
    time: bar.time,
    value: ema20[i] !== undefined ? ema20[i] : bar.close
  }));
}`;

export const DEFAULT_EMA_RIBBON_SCRIPT = `/**
 * 4 EMA Ribbon (20, 50, 100, 200)
 * Line Styling:
 * - 20 EMA: White (Thin, 1px)
 * - 50 EMA: Blue (Medium, 1.5px)
 * - 100 EMA: Yellow (Thick, 2px)
 * - 200 EMA: Orange (Thickest, 3px)
 */
function calculate(bars, inputs, ta, strategy, alertcondition) {
  const closes = bars.map(b => b.close);
  const ema20 = ta.ema(closes, 20);
  const ema50 = ta.ema(closes, 50);
  const ema100 = ta.ema(closes, 100);
  const ema200 = ta.ema(closes, 200);

  if (typeof alertcondition === "function" && bars.length >= 200) {
    const last = bars.length - 1;
    const isGoldenCross = ema50[last] > ema200[last] && ema50[last - 1] <= ema200[last - 1];
    alertcondition(isGoldenCross, "EMA Golden Cross", "50 EMA crossed above 200 EMA");
  }

  // Returns primary 20 EMA plot points
  return bars.map((bar, i) => ({
    time: bar.time,
    value: ema20[i] !== undefined ? ema20[i] : bar.close
  }));
}`;

export const DEFAULT_BOLLINGER_SCRIPT = `/**
 * Bollinger Bands (20, 2)
 */
function calculate(bars, inputs, ta, strategy, alertcondition) {
  const period = inputs.period || 20;
  const mult = inputs.mult || 2;
  const closes = bars.map(b => b.close);
  const bb = ta.bollinger(closes, period, mult);

  if (typeof alertcondition === "function" && bars.length > 0) {
    const last = bars.length - 1;
    const isSqueeze = (bb.upper[last] - bb.lower[last]) / bb.middle[last] < 0.025;
    alertcondition(isSqueeze, "BB Squeeze", "Bollinger Bandwidth is below 2.5%");
  }

  return bars.map((bar, i) => ({
    time: bar.time,
    value: bb.middle[i] !== undefined ? bb.middle[i] : bar.close
  }));
}`;

export const DEFAULT_RSI_SCRIPT = `/**
 * Relative Strength Index (RSI 14)
 */
function calculate(bars, inputs, ta, strategy, alertcondition) {
  const period = inputs.period || 14;
  const closes = bars.map(b => b.close);
  const rsi = ta.rsi(closes, period);

  if (typeof alertcondition === "function" && bars.length > 0) {
    const last = bars.length - 1;
    alertcondition(rsi[last] <= 30, "RSI Oversold", "RSI reached oversold zone (<= 30)");
    alertcondition(rsi[last] >= 70, "RSI Overbought", "RSI reached overbought zone (>= 70)");
  }

  return bars.map((bar, i) => ({
    time: bar.time,
    value: rsi[i] !== undefined ? rsi[i] : 50
  }));
}`;

export const DEFAULT_MACD_SCRIPT = `/**
 * Moving Average Convergence Divergence (MACD 12, 26, 9)
 */
function calculate(bars, inputs, ta, strategy, alertcondition) {
  const closes = bars.map(b => b.close);
  const macd = ta.macd(closes, 12, 26, 9);

  if (typeof alertcondition === "function" && bars.length > 1) {
    const last = bars.length - 1;
    const isCrossUp = macd.histogram[last] > 0 && macd.histogram[last - 1] <= 0;
    alertcondition(isCrossUp, "MACD Bullish Cross", "MACD Histogram crossed above zero");
  }

  return bars.map((bar, i) => ({
    time: bar.time,
    value: macd.histogram[i] !== undefined ? macd.histogram[i] : 0
  }));
}`;

/**
 * Resolves appropriate script code for any catalog indicator
 */
export function resolveCatalogScriptCode(id?: string, name?: string): string {
  const n = ((id || "") + " " + (name || "")).toLowerCase();
  if (
    n.includes("mtf-ema") ||
    n.includes("mtf ema") ||
    (n.includes("mtf") && n.includes("ema")) ||
    (n.includes("multi") && n.includes("timeframe")) ||
    n.includes("20/50/100/200")
  ) {
    return DEFAULT_MTF_EMA_SCRIPT;
  }
  if (n.includes("adam") || n.includes("eve")) {
    return DEFAULT_ADAM_EVE_SCRIPT;
  }
  if (n.includes("head") || n.includes("shoulder") || n.includes("h&s") || n.includes("hs")) {
    return DEFAULT_HEAD_SHOULDERS_SCRIPT;
  }
  if (n.includes("mod-08") || n.includes("md08") || n.includes("master") || n.includes("unified")) {
    return DEFAULT_PHANTOM_MASTER_SCRIPT;
  }
  if (n.includes("mod-07") || n.includes("md07") || n.includes("breaker")) {
    return DEFAULT_PHANTOM_BREAKER_SCRIPT;
  }
  if (n.includes("mod-06") || n.includes("md06") || n.includes("risk") || n.includes("mean threshold")) {
    return DEFAULT_PHANTOM_RISK_SCRIPT;
  }
  if (n.includes("mod-05") || n.includes("md05") || n.includes("continuation") || n.includes("decisional")) {
    return DEFAULT_PHANTOM_CONTINUATION_SCRIPT;
  }
  if (n.includes("mod-04") || n.includes("md04") || n.includes("session") || n.includes("killzone") || n.includes("asian")) {
    return DEFAULT_PHANTOM_SESSION_SCRIPT;
  }
  if (n.includes("mod-03") || n.includes("md03") || n.includes("idm") || n.includes("inducement")) {
    return DEFAULT_PHANTOM_IDM_SCRIPT;
  }
  if (n.includes("mod-02") || n.includes("md02") || n.includes("flip") || n.includes("s2d") || n.includes("d2s")) {
    return DEFAULT_PHANTOM_FLIP_SCRIPT;
  }
  if (
    n.includes("mod-01") ||
    n.includes("md01") ||
    n.includes("phantom-smc") ||
    n.includes("phantom smc") ||
    n.includes("supply & demand") ||
    n.includes("supply and demand") ||
    n.includes("smc")
  ) {
    return DEFAULT_PHANTOM_SMC_SCRIPT;
  }
  if (n.includes("order block") || n.includes("order-block") || n.includes("script-order-blocks")) {
    return DEFAULT_OB_SCRIPT;
  }
  if (n.includes("fvg") || n.includes("fair value")) {
    return DEFAULT_FVG_SCRIPT;
  }
  if (n.includes("candle") || n.includes("candlestick") || n.includes("mss")) {
    return DEFAULT_CANDLE_STRUCTURE_SCRIPT;
  }
  if (n.includes("structure") || n.includes("zigzag")) {
    return DEFAULT_MARKET_STRUCTURE_SCRIPT;
  }
  if (n.includes("ema") || n.includes("ribbon") || n.includes("moving average")) {
    return DEFAULT_EMA_RIBBON_SCRIPT;
  }
  if (n.includes("bollinger") || n.includes("squeeze") || n.includes("bb")) {
    return DEFAULT_BOLLINGER_SCRIPT;
  }
  if (n.includes("rsi") || n.includes("divergence")) {
    return DEFAULT_RSI_SCRIPT;
  }
  if (n.includes("macd")) {
    return DEFAULT_MACD_SCRIPT;
  }
  return DEFAULT_STARTER_SCRIPT;
}


