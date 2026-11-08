"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  CandlestickChart,
  Radar,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  Zap,
  Layers,
  Bell,
  Activity,
  BarChart3,
  Sliders,
  Play,
  Maximize2,
  Lock,
  Terminal,
  Cpu,
  ChevronRight,
  Check,
  Sparkles,
  Eye,
  Code2,
  Send,
  Radio,
  Database,
  ExternalLink,
  User,
} from "lucide-react";
import { useAuth } from "@/lib/auth/use-auth";

export default function LandingPage() {
  const { user, isLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<"smc" | "mtf" | "sandwich" | "frvp" | "alerts" | "replay">("smc");

  const terminalUrl = user ? "/chart" : "/login?callbackUrl=/chart";

  return (
    <div className="min-h-screen w-full bg-[#060b11] text-[#d9e3f3] selection:bg-[#2962ff] selection:text-white relative font-sans overflow-x-clip">
      {/* Background Gradients & Ambient Glows */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[1000px] h-[550px] bg-[radial-gradient(ellipse_at_center,rgba(41,98,255,0.18),transparent_70%)]" />
        <div className="absolute top-[600px] left-10 w-[500px] h-[500px] bg-[radial-gradient(ellipse_at_center,rgba(0,192,135,0.08),transparent_70%)]" />
        <div className="absolute top-[1200px] right-10 w-[600px] h-[600px] bg-[radial-gradient(ellipse_at_center,rgba(0,216,255,0.08),transparent_70%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#0d1520_1px,transparent_1px),linear-gradient(to_bottom,#0d1520_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_75%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-25" />
      </div>

      {/* 1. TOP NAVBAR */}
      <nav className="sticky top-0 z-50 backdrop-blur-md bg-[#060b11]/80 border-b border-[#141e2b]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          {/* Logo & Brand */}
          <Link href="/" className="flex items-center gap-2.5 group cursor-pointer">
            <div className="w-8 h-8 rounded-lg bg-[#2962ff] flex items-center justify-center text-white shadow-md shadow-[#2962ff]/30 group-hover:scale-105 transition-transform">
              <CandlestickChart size={18} />
            </div>
            <div className="flex flex-col">
              <div className="flex items-center gap-1.5">
                <span className="font-sans font-black text-base tracking-wider text-white">
                  MOCHEX <span className="text-[#00c087] font-bold">CHARTS</span>
                </span>
                <span className="text-[9px] font-mono font-semibold px-1.5 py-0.5 rounded bg-[#131d2a] text-[#b6c4ff] border border-[#233144]">
                  v2.4
                </span>
              </div>
              <span className="text-[9px] font-mono text-[#848e9c] -mt-1 tracking-wider uppercase">
                Institutional Workstation
              </span>
            </div>
          </Link>

          {/* Nav Center Links */}
          <div className="hidden md:flex items-center gap-6 text-xs font-mono text-[#848e9c]">
            <a href="#features" className="hover:text-white transition-colors">
              Features
            </a>
            <a href="#smc" className="hover:text-white transition-colors">
              SMC & ICT
            </a>
            <a href="#indicators" className="hover:text-white transition-colors">
              Indicators
            </a>
            <a href="#alerts" className="hover:text-white transition-colors">
              Alerts
            </a>
            <a href="#replay" className="hover:text-white transition-colors">
              Bar Replay
            </a>
            <a href="#architecture" className="hover:text-white transition-colors">
              Architecture
            </a>
          </div>

          {/* Right Action & Auth State */}
          <div className="flex items-center gap-3">
            {/* Live MEXC Feed Pill */}
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#0a1420] border border-[#182637] text-[10px] font-mono text-[#00c087]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00c087] animate-pulse" />
              <span>MEXC 60 FPS L2</span>
            </div>

            {isLoading ? (
              <div className="w-6 h-6 border-2 border-[#2962ff] border-t-transparent rounded-full animate-spin" />
            ) : user ? (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0e1824] border border-[#1f2d3f] text-xs font-mono">
                  <div className="w-5 h-5 rounded-full bg-gradient-to-br from-[#2962ff] to-[#1e50db] flex items-center justify-center text-[10px] font-bold text-white">
                    {user.username.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-white font-medium">{user.username}</span>
                </div>
                <Link
                  href="/radar"
                  className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#00c087]/15 hover:bg-[#00c087]/25 text-[#00c087] border border-[#00c087]/30 text-xs font-mono font-bold transition-all"
                >
                  <Radar size={13} className="animate-pulse" />
                  <span>POI Radar</span>
                </Link>
                <Link
                  href="/chart"
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#2962ff] hover:bg-[#1e50db] text-white text-xs font-mono font-bold transition-all shadow-md shadow-[#2962ff]/25"
                >
                  <span>Open Workstation</span>
                  <ArrowRight size={13} />
                </Link>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Link
                  href="/login"
                  className="px-3 py-1.5 rounded-lg text-xs font-mono text-[#848e9c] hover:text-white hover:bg-[#121c29] border border-transparent hover:border-[#1e2a3b] transition-all"
                >
                  Sign In
                </Link>
                <Link
                  href="/login?callbackUrl=/chart"
                  className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#2962ff] hover:bg-[#1e50db] text-white text-xs font-mono font-bold transition-all shadow-md shadow-[#2962ff]/25 group"
                >
                  <span>Launch Terminal</span>
                  <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
                </Link>
              </div>
            )}
          </div>
        </div>
      </nav>

      {/* 2. HERO SECTION */}
      <section className="relative z-10 pt-16 pb-12 sm:pt-24 sm:pb-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
        {/* Institutional Pill Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#0d1825] border border-[#23354c] text-xs font-mono text-[#b6c4ff] mb-6 shadow-sm">
          <Sparkles size={14} className="text-[#00d8ff]" />
          <span>Institutional Crypto Technical Analysis & Algorithmic Workstation</span>
        </div>

        {/* Hero Title */}
        <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-tight text-white max-w-4xl mx-auto leading-[1.1] font-sans">
          Precision Market Intelligence.{" "}
          <span className="bg-gradient-to-r from-[#b6c4ff] via-[#00d8ff] to-[#00c087] bg-clip-text text-transparent">
            Zero Compromise.
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mt-6 text-sm sm:text-base lg:text-lg text-[#848e9c] max-w-3xl mx-auto leading-relaxed font-sans">
          Stream 1,480+ MEXC pairs with sub-millisecond tick precision. Unleash native{" "}
          <strong className="text-white font-medium">Smart Money Concepts</strong>,{" "}
          <strong className="text-white font-medium">Multi-Timeframe EMA ribbons</strong>,{" "}
          <strong className="text-white font-medium">Sandwich Zones ++</strong> order flow,{" "}
          <strong className="text-white font-medium">Fixed Range Volume Profiles</strong>, and{" "}
          <strong className="text-white font-medium">Instant Discord & Telegram Webhooks</strong> — all with zero lookahead bias.
        </p>

        {/* CTAs */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
          <Link
            href={terminalUrl}
            className="w-full sm:w-auto flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-[#2962ff] hover:bg-[#1e50db] text-white text-sm font-mono font-bold transition-all shadow-lg shadow-[#2962ff]/30 hover:shadow-[#2962ff]/50 hover:scale-[1.02] cursor-pointer"
          >
            <Terminal size={17} />
            <span>Launch Trading Workstation</span>
            <ArrowRight size={16} />
          </Link>
          <a
            href="#features"
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[#0f1925] hover:bg-[#152335] border border-[#1f2f45] text-white text-sm font-mono font-semibold transition-all"
          >
            <span>Explore Indicators & Capabilities</span>
            <ChevronRight size={15} />
          </a>
        </div>

        {/* Micro-Metrics Bar */}
        <div className="mt-12 pt-8 border-t border-[#131d2b] grid grid-cols-2 sm:grid-cols-5 gap-4 max-w-4xl mx-auto text-left sm:text-center">
          <div>
            <div className="text-xl sm:text-2xl font-black font-mono text-white">1,480+</div>
            <div className="text-[11px] font-mono text-[#848e9c] uppercase">MEXC Spot Pairs</div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black font-mono text-[#00c087]">60 FPS</div>
            <div className="text-[11px] font-mono text-[#848e9c] uppercase">Canvas Frame Rate</div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black font-mono text-[#00d8ff]">&lt; 15ms</div>
            <div className="text-[11px] font-mono text-[#848e9c] uppercase">Alert Dispatch</div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl font-black font-mono text-[#f5ac37]">300+</div>
            <div className="text-[11px] font-mono text-[#848e9c] uppercase">FRVP Price Bins</div>
          </div>
          <div className="col-span-2 sm:col-span-1">
            <div className="text-xl sm:text-2xl font-black font-mono text-white">100%</div>
            <div className="text-[11px] font-mono text-[#848e9c] uppercase">Local-First Privacy</div>
          </div>
        </div>
      </section>

      {/* 3. INTERACTIVE TERMINAL SHOWCASE / MOCKUP */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20">
        <div className="relative rounded-2xl bg-[#08101a] border border-[#1c2a3d] shadow-2xl overflow-hidden">
          {/* Top Window Bar */}
          <div className="px-4 py-3 bg-[#0c1622] border-b border-[#1c2a3d] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-[#ff3b30]/80" />
              <div className="w-3 h-3 rounded-full bg-[#f5ac37]/80" />
              <div className="w-3 h-3 rounded-full bg-[#00c087]/80" />
              <div className="h-3 w-px bg-[#1c2a3d] mx-2" />
              <span className="text-xs font-mono font-bold text-white flex items-center gap-1.5">
                <span>BTC/USDT</span>
                <span className="text-[#848e9c] font-normal">15m</span>
                <span className="text-[10px] px-1.5 py-0.2 rounded bg-[#121f2f] text-[#00c087]">
                  MEXC L2
                </span>
              </span>
            </div>

            {/* Timeframe Badges in Mockup */}
            <div className="hidden sm:flex items-center gap-1 text-[11px] font-mono">
              <span className="px-2 py-0.5 rounded bg-[#162436] text-white font-bold">15m</span>
              <span className="px-2 py-0.5 rounded text-[#848e9c]">1H</span>
              <span className="px-2 py-0.5 rounded text-[#848e9c]">4H</span>
              <span className="px-2 py-0.5 rounded text-[#848e9c]">1D</span>
            </div>

            {/* Price Quote */}
            <div className="flex items-center gap-3 font-mono text-xs">
              <span className="text-[#00c087] font-bold">$68,420.50</span>
              <span className="text-[#00c087] bg-[#00c087]/10 px-1.5 py-0.5 rounded text-[10px]">
                +3.42%
              </span>
            </div>
          </div>

          {/* Main Visual Terminal Canvas Mockup */}
          <div className="relative h-[380px] sm:h-[460px] w-full bg-[#070d15] flex overflow-hidden">
            {/* Left Drawing Rail Mockup */}
            <div className="w-10 border-r border-[#152130] bg-[#09111b] flex flex-col items-center py-3 gap-3 text-[#848e9c] shrink-0">
              <div className="p-1.5 rounded bg-[#18283a] text-white">
                <BarChart3 size={15} />
              </div>
              <div className="p-1.5 rounded hover:text-white">
                <Activity size={15} />
              </div>
              <div className="p-1.5 rounded hover:text-white">
                <Sliders size={15} />
              </div>
              <div className="p-1.5 rounded hover:text-white">
                <Bell size={15} />
              </div>
            </div>

            {/* Center Simulated Chart Canvas */}
            <div className="flex-1 relative p-4 flex flex-col justify-between">
              {/* Indicator Overlay Tag Header */}
              <div className="flex flex-wrap items-center gap-2 z-10">
                <span className="px-2 py-0.5 rounded bg-[#0e1927] border border-[#1b2b3f] text-[10px] font-mono text-white flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  <span>EMA 20</span>
                </span>
                <span className="px-2 py-0.5 rounded bg-[#0e1927] border border-[#1b2b3f] text-[10px] font-mono text-white flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2962ff]" />
                  <span>EMA 50</span>
                </span>
                <span className="px-2 py-0.5 rounded bg-[#0e1927] border border-[#1b2b3f] text-[10px] font-mono text-white flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#f5ac37]" />
                  <span>EMA 100</span>
                </span>
                <span className="px-2 py-0.5 rounded bg-[#0e1927] border border-[#1b2b3f] text-[10px] font-mono text-white flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#ff9800]" />
                  <span>EMA 200</span>
                </span>
                <span className="px-2 py-0.5 rounded bg-[#00c087]/15 border border-[#00c087]/30 text-[10px] font-mono text-[#00c087]">
                  GRGG Sandwich Zone (15m)
                </span>
                <span className="px-2 py-0.5 rounded bg-[#ff3b30]/15 border border-[#ff3b30]/30 text-[10px] font-mono text-[#ff3b30]">
                  RGRR Sandwich Zone (1h)
                </span>
              </div>

              {/* Graphical Candlestick & Indicator Visualization SVG */}
              <div className="absolute inset-0 pt-12 pb-6 px-4">
                <svg className="w-full h-full" viewBox="0 0 800 350" preserveAspectRatio="none">
                  {/* Subtle Grid Lines */}
                  <line x1="0" y1="70" x2="800" y2="70" stroke="#121b27" strokeDasharray="3 3" />
                  <line x1="0" y1="140" x2="800" y2="140" stroke="#121b27" strokeDasharray="3 3" />
                  <line x1="0" y1="210" x2="800" y2="210" stroke="#121b27" strokeDasharray="3 3" />
                  <line x1="0" y1="280" x2="800" y2="280" stroke="#121b27" strokeDasharray="3 3" />

                  {/* Bullish GRGG Sandwich Zone (Green Box) */}
                  <rect
                    x="160"
                    y="180"
                    width="260"
                    height="45"
                    fill="#00c087"
                    fillOpacity="0.12"
                    stroke="#00c087"
                    strokeWidth="1.2"
                    strokeDasharray="4 2"
                  />
                  <text x="170" y="206" fill="#00c087" fontSize="10" fontFamily="monospace">
                    GRGG 15m Institutional Zone (Bullish FVG)
                  </text>

                  {/* Bearish RGRR Sandwich Zone (Red Box) */}
                  <rect
                    x="420"
                    y="95"
                    width="240"
                    height="40"
                    fill="#ff3b30"
                    fillOpacity="0.12"
                    stroke="#ff3b30"
                    strokeWidth="1.2"
                    strokeDasharray="4 2"
                  />
                  <text x="430" y="118" fill="#ff3b30" fontSize="10" fontFamily="monospace">
                    RGRR 1h Order Flow Zone
                  </text>

                  {/* Fair Value Gap (Cyan Dashed Box) */}
                  <rect
                    x="300"
                    y="150"
                    width="140"
                    height="28"
                    fill="#00d8ff"
                    fillOpacity="0.08"
                    stroke="#00d8ff"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                  />
                  <text x="310" y="167" fill="#00d8ff" fontSize="9" fontFamily="monospace">
                    FVG Mitigation Zone
                  </text>

                  {/* EMA 200 (Orange - 4px width) */}
                  <path
                    d="M 50 260 Q 200 240, 400 210 T 750 170"
                    fill="none"
                    stroke="#ff9800"
                    strokeWidth="4"
                    strokeOpacity="0.9"
                  />
                  {/* EMA 100 (Yellow - 3px width) */}
                  <path
                    d="M 50 240 Q 200 220, 400 180 T 750 145"
                    fill="none"
                    stroke="#f5ac37"
                    strokeWidth="3"
                    strokeOpacity="0.9"
                  />
                  {/* EMA 50 (Blue - 2px width) */}
                  <path
                    d="M 50 220 Q 200 190, 400 150 T 750 120"
                    fill="none"
                    stroke="#2962ff"
                    strokeWidth="2"
                    strokeOpacity="0.95"
                  />
                  {/* EMA 20 (White - 1px width) */}
                  <path
                    d="M 50 200 Q 200 160, 400 130 T 750 95"
                    fill="none"
                    stroke="#ffffff"
                    strokeWidth="1.5"
                    strokeOpacity="1"
                  />

                  {/* Candlestick Wicks & Bodies */}
                  {/* Candle 1 (Green) */}
                  <line x1="80" y1="180" x2="80" y2="230" stroke="#00c087" strokeWidth="1.5" />
                  <rect x="74" y="190" width="12" height="30" fill="#00c087" />
                  {/* Candle 2 (Green) */}
                  <line x1="120" y1="160" x2="120" y2="215" stroke="#00c087" strokeWidth="1.5" />
                  <rect x="114" y="170" width="12" height="35" fill="#00c087" />
                  {/* Candle 3 (Red) */}
                  <line x1="160" y1="175" x2="160" y2="228" stroke="#ff3b30" strokeWidth="1.5" />
                  <rect x="154" y="180" width="12" height="35" fill="#ff3b30" />
                  {/* Candle 4 (Green) */}
                  <line x1="200" y1="140" x2="200" y2="200" stroke="#00c087" strokeWidth="1.5" />
                  <rect x="194" y="150" width="12" height="38" fill="#00c087" />
                  {/* Candle 5 (Green - breakout) */}
                  <line x1="240" y1="120" x2="240" y2="185" stroke="#00c087" strokeWidth="1.5" />
                  <rect x="234" y="130" width="12" height="42" fill="#00c087" />
                  {/* Candle 6 (Red pull) */}
                  <line x1="280" y1="130" x2="280" y2="185" stroke="#ff3b30" strokeWidth="1.5" />
                  <rect x="274" y="140" width="12" height="30" fill="#ff3b30" />
                  {/* Candle 7 (Green) */}
                  <line x1="320" y1="110" x2="320" y2="170" stroke="#00c087" strokeWidth="1.5" />
                  <rect x="314" y="120" width="12" height="38" fill="#00c087" />
                  {/* Candle 8 (Red) */}
                  <line x1="360" y1="115" x2="360" y2="165" stroke="#ff3b30" strokeWidth="1.5" />
                  <rect x="354" y="125" width="12" height="28" fill="#ff3b30" />
                  {/* Candle 9 (Green) */}
                  <line x1="400" y1="85" x2="400" y2="150" stroke="#00c087" strokeWidth="1.5" />
                  <rect x="394" y="95" width="12" height="45" fill="#00c087" />
                  {/* Candle 10 (Red) */}
                  <line x1="440" y1="90" x2="440" y2="145" stroke="#ff3b30" strokeWidth="1.5" />
                  <rect x="434" y="98" width="12" height="32" fill="#ff3b30" />
                  {/* Candle 11 (Green) */}
                  <line x1="480" y1="75" x2="480" y2="135" stroke="#00c087" strokeWidth="1.5" />
                  <rect x="474" y="85" width="12" height="40" fill="#00c087" />
                  {/* Candle 12 (Green) */}
                  <line x1="520" y1="65" x2="520" y2="125" stroke="#00c087" strokeWidth="1.5" />
                  <rect x="514" y="72" width="12" height="42" fill="#00c087" />
                </svg>
              </div>

              {/* Bottom Volume Sub-Chart Mockup */}
              <div className="z-10 flex items-end gap-1.5 h-14 border-t border-[#121c27] pt-2">
                <div className="w-2.5 h-6 bg-[#00c087]/50 rounded-xs" />
                <div className="w-2.5 h-8 bg-[#00c087]/70 rounded-xs" />
                <div className="w-2.5 h-5 bg-[#ff3b30]/60 rounded-xs" />
                <div className="w-2.5 h-10 bg-[#00c087]/80 rounded-xs" />
                <div className="w-2.5 h-11 bg-[#00c087] rounded-xs" />
                <div className="w-2.5 h-7 bg-[#ff3b30]/70 rounded-xs" />
                <div className="w-2.5 h-9 bg-[#00c087]/80 rounded-xs" />
                <div className="w-2.5 h-4 bg-[#ff3b30]/50 rounded-xs" />
                <div className="w-2.5 h-12 bg-[#00c087] rounded-xs" />
                <div className="w-2.5 h-6 bg-[#ff3b30]/60 rounded-xs" />
                <div className="w-2.5 h-10 bg-[#00c087]/80 rounded-xs" />
                <div className="w-2.5 h-11 bg-[#00c087] rounded-xs" />
              </div>
            </div>

            {/* Right FRVP & DOM Sidebar Mockup */}
            <div className="w-48 sm:w-56 border-l border-[#152130] bg-[#070e17] flex flex-col justify-between p-3 font-mono text-[10px]">
              <div>
                <div className="flex items-center justify-between pb-2 border-b border-[#152130] text-[#848e9c]">
                  <span>FRVP PROFILE</span>
                  <span className="text-[#00c087]">VAH / VAL 70%</span>
                </div>

                {/* FRVP Horizontal Bars */}
                <div className="mt-3 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[#ff3b30]">68,750.0</span>
                    <div className="w-20 bg-[#162436] rounded-xs overflow-hidden h-2.5">
                      <div className="w-8 h-full bg-[#ff3b30]/80" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#f5ac37] font-bold">VAH 68,600</span>
                    <div className="w-20 bg-[#162436] rounded-xs overflow-hidden h-2.5">
                      <div className="w-14 h-full bg-[#f5ac37]" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#00d8ff] font-bold">POI 68,420</span>
                    <div className="w-20 bg-[#162436] rounded-xs overflow-hidden h-2.5">
                      <div className="w-18 h-full bg-[#00d8ff]" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#00c087] font-bold">VAL 67,850</span>
                    <div className="w-20 bg-[#162436] rounded-xs overflow-hidden h-2.5">
                      <div className="w-12 h-full bg-[#00c087]" />
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[#00c087]">67,600.0</span>
                    <div className="w-20 bg-[#162436] rounded-xs overflow-hidden h-2.5">
                      <div className="w-6 h-full bg-[#00c087]/80" />
                    </div>
                  </div>
                </div>
              </div>

              {/* Mini DOM Real-Time Pressure Tape */}
              <div className="pt-3 border-t border-[#152130]">
                <div className="flex items-center justify-between text-[#848e9c] mb-1">
                  <span>DOM L2</span>
                  <span className="text-white">SPREAD 0.50</span>
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-[#ff3b30]">
                    <span>68,421.00</span>
                    <span>12.45 BTC</span>
                  </div>
                  <div className="flex justify-between text-[#00c087]">
                    <span>68,420.50</span>
                    <span>18.90 BTC</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4. CORE FEATURES DEEP DIVE (6 INSTITUTIONAL PILLARS) */}
      <section id="features" className="py-20 bg-[#070e17] border-y border-[#141e2b] relative z-10 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <h2 className="text-xs font-mono font-bold tracking-widest uppercase text-[#2962ff] mb-2">
              Engineered For Edge
            </h2>
            <p className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Institutional Technical Analysis Architecture
            </p>
            <p className="mt-3 text-sm text-[#848e9c]">
              Designed from the ground up to eliminate lag, lookahead bias, and fragmented indicator suites.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Feature 1: Smart Money Concepts */}
            <div id="smc" className="p-6 rounded-2xl bg-[#09121d] border border-[#1b2839] hover:border-[#2962ff]/50 transition-all flex flex-col justify-between group scroll-mt-24">
              <div>
                <div className="w-10 h-10 rounded-xl bg-[#2962ff]/10 border border-[#2962ff]/20 text-[#2962ff] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Layers size={20} />
                </div>
                <h3 className="text-lg font-bold text-white mb-2 font-sans">
                  Smart Money Concepts (ICT/SMC)
                </h3>
                <p className="text-xs text-[#848e9c] leading-relaxed mb-4">
                  Native detection of institutional Order Blocks, Fair Value Gaps (FVG), Liquidity Sweeps, CHoCH, and BOS structure breaks with strict mitigation lifecycle tracking.
                </p>
              </div>
              <ul className="space-y-1.5 text-[11px] font-mono text-[#b6c4ff] pt-4 border-t border-[#141e2b]">
                <li className="flex items-center gap-1.5">
                  <Check size={13} className="text-[#00c087]" />
                  <span>Zero repainting calculation</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Check size={13} className="text-[#00c087]" />
                  <span>Unmitigated FVG highlights</span>
                </li>
              </ul>
            </div>

            {/* Feature 2: Multi-Timeframe EMA Ribbon */}
            <div id="indicators" className="p-6 rounded-2xl bg-[#09121d] border border-[#1b2839] hover:border-[#00c087]/50 transition-all flex flex-col justify-between group scroll-mt-24">
              <div>
                <div className="w-10 h-10 rounded-xl bg-[#00c087]/10 border border-[#00c087]/20 text-[#00c087] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <TrendingUp size={20} />
                </div>
                <h3 className="text-lg font-bold text-white mb-2 font-sans">
                  MTF EMA 20 / 50 / 100 / 200
                </h3>
                <p className="text-xs text-[#848e9c] leading-relaxed mb-4">
                  Computes moving averages using actual higher-timeframe candle closes (1m, 5m, 15m, 1h, 4h, 1D). Rendered with progressive pixel line widths and independent visibility switches.
                </p>
              </div>
              <ul className="space-y-1.5 text-[11px] font-mono text-[#00c087] pt-4 border-t border-[#141e2b]">
                <li className="flex items-center gap-1.5">
                  <Check size={13} className="text-[#00c087]" />
                  <span>True MTF chronological math</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Check size={13} className="text-[#00c087]" />
                  <span>Progressive 1px - 4px line widths</span>
                </li>
              </ul>
            </div>

            {/* Feature 3: Sandwich Zones ++ */}
            <div className="p-6 rounded-2xl bg-[#09121d] border border-[#1b2839] hover:border-[#f5ac37]/50 transition-all flex flex-col justify-between group">
              <div>
                <div className="w-10 h-10 rounded-xl bg-[#f5ac37]/10 border border-[#f5ac37]/20 text-[#f5ac37] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Activity size={20} />
                </div>
                <h3 className="text-lg font-bold text-white mb-2 font-sans">
                  Sandwich Zones ++ Order Flow
                </h3>
                <p className="text-xs text-[#848e9c] leading-relaxed mb-4">
                  Quantitative 4-candle sequence detection: RGRR Bearish and GRGG Bullish patterns with Fair Value Gap filtering and horizontal rightward projected pivot zones.
                </p>
              </div>
              <ul className="space-y-1.5 text-[11px] font-mono text-[#f5ac37] pt-4 border-t border-[#141e2b]">
                <li className="flex items-center gap-1.5">
                  <Check size={13} className="text-[#00c087]" />
                  <span>Starts at 2nd candle pivot</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Check size={13} className="text-[#00c087]" />
                  <span>Multi-timeframe simultaneous scan</span>
                </li>
              </ul>
            </div>

            {/* Feature 4: Fixed Range Volume Profile */}
            <div className="p-6 rounded-2xl bg-[#09121d] border border-[#1b2839] hover:border-[#00d8ff]/50 transition-all flex flex-col justify-between group">
              <div>
                <div className="w-10 h-10 rounded-xl bg-[#00d8ff]/10 border border-[#00d8ff]/20 text-[#00d8ff] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <BarChart3 size={20} />
                </div>
                <h3 className="text-lg font-bold text-white mb-2 font-sans">
                  Fixed Range Volume Profile (FRVP)
                </h3>
                <p className="text-xs text-[#848e9c] leading-relaxed mb-4">
                  Unrestricted resolution profiling up to 300+ horizontal bins. Instantly computes Point of Interest (POI), Value Area High (VAH), and Value Area Low (VAL 70%) with custom styling.
                </p>
              </div>
              <ul className="space-y-1.5 text-[11px] font-mono text-[#00d8ff] pt-4 border-t border-[#141e2b]">
                <li className="flex items-center gap-1.5">
                  <Check size={13} className="text-[#00c087]" />
                  <span>High-resolution 300+ price rows</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Check size={13} className="text-[#00c087]" />
                  <span>VAH/POI/VAL customizable colors</span>
                </li>
              </ul>
            </div>

            {/* Feature 5: Discord & Telegram Webhooks */}
            <div id="alerts" className="p-6 rounded-2xl bg-[#09121d] border border-[#1b2839] hover:border-[#b6c4ff]/50 transition-all flex flex-col justify-between group scroll-mt-24">
              <div>
                <div className="w-10 h-10 rounded-xl bg-[#b6c4ff]/10 border border-[#b6c4ff]/20 text-[#b6c4ff] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Bell size={20} />
                </div>
                <h3 className="text-lg font-bold text-white mb-2 font-sans">
                  Discord & Telegram Instant Alerts
                </h3>
                <p className="text-xs text-[#848e9c] leading-relaxed mb-4">
                  Direct webhook dispatching for price triggers, indicator crosses, and pattern breakouts. Formats rich embeds for Discord and structured Markdown for Telegram bot channels.
                </p>
              </div>
              <ul className="space-y-1.5 text-[11px] font-mono text-[#b6c4ff] pt-4 border-t border-[#141e2b]">
                <li className="flex items-center gap-1.5">
                  <Check size={13} className="text-[#00c087]" />
                  <span>Low-latency serverless dispatcher</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Check size={13} className="text-[#00c087]" />
                  <span>Instant channel test delivery</span>
                </li>
              </ul>
            </div>

            {/* Feature 6: Bar Replay Engine & Strategy Simulator */}
            <div id="replay" className="p-6 rounded-2xl bg-[#09121d] border border-[#1b2839] hover:border-[#ff3b30]/50 transition-all flex flex-col justify-between group scroll-mt-24">
              <div>
                <div className="w-10 h-10 rounded-xl bg-[#ff3b30]/10 border border-[#ff3b30]/20 text-[#ff3b30] flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <Play size={20} />
                </div>
                <h3 className="text-lg font-bold text-white mb-2 font-sans">
                  Zero-Lookahead Bar Replay
                </h3>
                <p className="text-xs text-[#848e9c] leading-relaxed mb-4">
                  Step backward into history and step forward candle-by-candle at 1x to 10x speeds. Backtest TypeScript algorithms in-browser with live equity curve generation.
                </p>
              </div>
              <ul className="space-y-1.5 text-[11px] font-mono text-[#ff3b30] pt-4 border-t border-[#141e2b]">
                <li className="flex items-center gap-1.5">
                  <Check size={13} className="text-[#00c087]" />
                  <span>Guaranteed zero lookahead bias</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Check size={13} className="text-[#00c087]" />
                  <span>Browser-based TypeScript sandbox</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* 5. MULTI-CHART SPLIT & WORKSPACE PRODUCTIVITY */}
      <section className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#111c2a] border border-[#1d2d42] text-xs font-mono text-[#00d8ff] mb-4">
              <Maximize2 size={13} />
              <span>Multi-Chart Grid Architecture</span>
            </div>
            <h2 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Split Screen Multi-Timeframe Confluence
            </h2>
            <p className="mt-4 text-sm text-[#848e9c] leading-relaxed">
              Analyze higher timeframe market structure simultaneously with lower timeframe entry triggers. Toggle between 1x1, 1x2, 2x1, and 2x2 multi-chart grids with crosshair synchronization and resizable divider handles.
            </p>

            <div className="mt-6 space-y-3 font-mono text-xs">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-[#09121e] border border-[#1a2738]">
                <div className="w-8 h-8 rounded-lg bg-[#2962ff]/10 text-[#2962ff] flex items-center justify-center shrink-0">
                  <Zap size={16} />
                </div>
                <div>
                  <div className="text-white font-bold">Synchronized Crosshair & Time Cursor</div>
                  <div className="text-[11px] text-[#848e9c]">Pan one chart to navigate all connected timeframe panes simultaneously.</div>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 rounded-xl bg-[#09121e] border border-[#1a2738]">
                <div className="w-8 h-8 rounded-lg bg-[#00c087]/10 text-[#00c087] flex items-center justify-center shrink-0">
                  <Database size={16} />
                </div>
                <div>
                  <div className="text-white font-bold">Layout Cloud Synchronization</div>
                  <div className="text-[11px] text-[#848e9c]">Save multi-pane layouts to PocketBase cloud and resume seamlessly across devices.</div>
                </div>
              </div>
            </div>
          </div>

          {/* Interactive Split Grid Visual */}
          <div className="p-4 rounded-2xl bg-[#08111c] border border-[#1a2738] shadow-2xl">
            <div className="grid grid-cols-2 gap-2 h-72 sm:h-80">
              <div className="rounded-xl bg-[#0b1725] border border-[#1e2f45] p-3 flex flex-col justify-between">
                <div className="flex justify-between items-center text-[10px] font-mono">
                  <span className="text-white font-bold">BTCUSDT • 1D</span>
                  <span className="text-[#00c087]">Macro Trend</span>
                </div>
                <div className="h-28 flex items-center justify-center text-[#848e9c] text-xs font-mono">
                  [EMA 200 Support]
                </div>
                <div className="text-[9px] font-mono text-[#848e9c]">Pane 1: High Timeframe</div>
              </div>

              <div className="rounded-xl bg-[#0b1725] border border-[#1e2f45] p-3 flex flex-col justify-between">
                <div className="flex justify-between items-center text-[10px] font-mono">
                  <span className="text-white font-bold">BTCUSDT • 4H</span>
                  <span className="text-[#00d8ff]">Structure BOS</span>
                </div>
                <div className="h-28 flex items-center justify-center text-[#848e9c] text-xs font-mono">
                  [CHoCH Pivot Zone]
                </div>
                <div className="text-[9px] font-mono text-[#848e9c]">Pane 2: Intermediate Trend</div>
              </div>

              <div className="rounded-xl bg-[#0b1725] border border-[#1e2f45] p-3 flex flex-col justify-between">
                <div className="flex justify-between items-center text-[10px] font-mono">
                  <span className="text-white font-bold">BTCUSDT • 15m</span>
                  <span className="text-[#f5ac37]">Sandwich GRGG</span>
                </div>
                <div className="h-28 flex items-center justify-center text-[#848e9c] text-xs font-mono">
                  [FVG Order Flow Box]
                </div>
                <div className="text-[9px] font-mono text-[#848e9c]">Pane 3: Execution Setup</div>
              </div>

              <div className="rounded-xl bg-[#0b1725] border border-[#1e2f45] p-3 flex flex-col justify-between">
                <div className="flex justify-between items-center text-[10px] font-mono">
                  <span className="text-white font-bold">BTCUSDT • 1m</span>
                  <span className="text-[#ff3b30]">Micro Scalp</span>
                </div>
                <div className="h-28 flex items-center justify-center text-[#848e9c] text-xs font-mono">
                  [DOM Tape Inflow]
                </div>
                <div className="text-[9px] font-mono text-[#848e9c]">Pane 4: Micro Tick Flow</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 6. ARCHITECTURE & SECURITY MATRIX */}
      <section id="architecture" className="py-20 bg-[#070e17] border-t border-[#141e2b] relative z-10 scroll-mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-16">
            <h2 className="text-xs font-mono font-bold tracking-widest uppercase text-[#00c087] mb-2">
              Enterprise Grade
            </h2>
            <p className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
              Privacy-First & Cloud-Synced Architecture
            </p>
            <p className="mt-3 text-sm text-[#848e9c]">
              We respect trader confidentiality. Your drawings, indicator configurations, and personal notes stay strictly under your control.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-[#09121d] border border-[#1b2839]">
              <div className="w-10 h-10 rounded-xl bg-[#2962ff]/10 text-[#2962ff] flex items-center justify-center mb-4">
                <Lock size={20} />
              </div>
              <h3 className="text-base font-bold text-white mb-2 font-sans">
                Zero Cloud Dependency Fallback
              </h3>
              <p className="text-xs text-[#848e9c] leading-relaxed">
                If the network or backend is unreachable, Mochex seamlessly falls back to browser localStorage. Your active session and drawings are never interrupted.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#09121d] border border-[#1b2839]">
              <div className="w-10 h-10 rounded-xl bg-[#00c087]/10 text-[#00c087] flex items-center justify-center mb-4">
                <Database size={20} />
              </div>
              <h3 className="text-base font-bold text-white mb-2 font-sans">
                PocketBase Cloud Synchronized
              </h3>
              <p className="text-xs text-[#848e9c] leading-relaxed">
                Save multi-chart configurations, indicator parameters, and watchlists to encrypted PocketBase collections with JWT authentication and role-based access.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#09121d] border border-[#1b2839]">
              <div className="w-10 h-10 rounded-xl bg-[#00d8ff]/10 text-[#00d8ff] flex items-center justify-center mb-4">
                <Radio size={20} />
              </div>
              <h3 className="text-base font-bold text-white mb-2 font-sans">
                Direct MEXC L2 WebSockets
              </h3>
              <p className="text-xs text-[#848e9c] leading-relaxed">
                Receive live order book changes and tape prints directly from MEXC official endpoints with automatic reconnection, heartbeat keepalive, and zero polling.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 7. HIGH-CONVERTING BOTTOM CALL TO ACTION */}
      <section className="py-20 relative z-10 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto text-center">
        <div className="relative p-8 sm:p-14 rounded-3xl bg-gradient-to-b from-[#0e1927] to-[#070e17] border border-[#23354c] shadow-2xl overflow-hidden">
          {/* Subtle Ambient Glow */}
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-96 h-96 bg-[#2962ff]/20 rounded-full blur-3xl pointer-events-none" />

          <h2 className="text-3xl sm:text-5xl font-black text-white tracking-tight relative z-10 font-sans">
            Ready to Experience Institutional Charting?
          </h2>
          <p className="mt-4 text-sm sm:text-base text-[#848e9c] max-w-2xl mx-auto relative z-10">
            Sign in to unlock full terminal access, real-time 60 FPS order flow, custom volume profiles, and multi-channel alerts.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 relative z-10">
            <Link
              href={terminalUrl}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[#2962ff] hover:bg-[#1e50db] text-white text-sm font-mono font-bold transition-all shadow-xl shadow-[#2962ff]/30 hover:scale-[1.02]"
            >
              <span>{user ? "Open Workstation Now" : "Sign In & Launch Workstation"}</span>
              <ArrowRight size={16} />
            </Link>
            {!user && (
              <Link
                href="/login"
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-[#121c29] hover:bg-[#1a2738] border border-[#23354c] text-white text-sm font-mono font-semibold transition-all"
              >
                <span>Register Trader Account</span>
              </Link>
            )}
          </div>
        </div>
      </section>

      {/* 8. FOOTER */}
      <footer className="py-12 border-t border-[#141e2b] bg-[#05090f] relative z-10 font-mono text-xs text-[#848e9c]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded bg-[#2962ff] flex items-center justify-center text-white font-bold text-xs">
              M
            </div>
            <span className="font-sans font-bold text-sm text-white">
              MOCHEX <span className="text-[#00c087]">CHARTS</span>
            </span>
            <span className="text-[10px] text-[#848e9c]">Institutional Edition</span>
          </div>

          <div className="flex flex-wrap justify-center gap-6 text-[11px]">
            <Link href={terminalUrl} className="hover:text-white transition-colors">
              Workstation
            </Link>
            <Link href="/login" className="hover:text-white transition-colors">
              Sign In / Register
            </Link>
            <a href="#smc" className="hover:text-white transition-colors">
              SMC Concepts
            </a>
            <a href="#indicators" className="hover:text-white transition-colors">
              MTF Indicators
            </a>
            <a href="#alerts" className="hover:text-white transition-colors">
              Alert Channels
            </a>
          </div>

          <div className="text-[11px] text-[#848e9c]/60">
            &copy; {new Date().getFullYear()} Mochex Charts. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
