# Mochex Charts

> MEXC Technical Analysis & Charting Platform

Mochex Charts is a responsive, web-based technical analysis workstation built exclusively for MEXC Spot markets. It focuses strictly on responsive charting, indicator development, and visual backtesting.

## Tech Stack

- **Framework:** Next.js 15 (App Router) + TypeScript
- **Styling:** Tailwind CSS + Lucide Icons + dark workstation theme
- **Market Data:** MEXC Spot V3 REST & WebSockets (hybrid direct fetch + fallback proxy)
- **Charting:** TradingView JS API compliant `IBasicDataFeed` (`MexcDatafeed`)
- **Script Sandbox:** Web Worker runtime with `technicalindicators` (50+ indicators) & 1,000ms timeout guard
- **Backtesting:** In-memory Bar Replay Engine state machine (`IDLE`, `SELECTING`, `PAUSED`, `PLAYING`, `STEP`)
- **Database & Auth:** PocketBase with HTTP-only cookie JWT session proxy and RBAC (`TRADER` vs `ADMIN`)
- **Testing:** Automated Vitest regression test suite (27/27 passing, 183 tests)

## Getting Started

1. Install dependencies:
   ```bash
   pnpm install
   ```

2. Configure environment:
   ```bash
   cp .env.example .env
   ```

3. Initialize PocketBase collections (optional if running via Docker):
   ```bash
   node scripts/init-pocketbase.mjs
   ```

4. Run the development server (default port 3018):
   ```bash
   pnpm dev
   ```
   Open [http://localhost:3018](http://localhost:3018) in your browser.

5. Run test suite:
   ```bash
   pnpm test
   ```
