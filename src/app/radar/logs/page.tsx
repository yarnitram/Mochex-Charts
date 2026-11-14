"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Bell,
  CheckCircle2,
  Clock,
  RefreshCw,
  ScrollText,
  Search,
  Send,
  Settings,
  ShieldAlert,
  Trash2,
  TrendingUp,
  UploadCloud,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import { AlertLogEntry, ChannelDeliveryResult, PriceAlert } from "@/lib/alerts/alerts-engine";
import { formatPoiPrice } from "@/lib/indicators/radar-poi-engine";
import { loadClientAlerts, syncAlerts } from "@/lib/alerts/alerts-sync";
import { loadClientWebhooks, syncWebhooks } from "@/lib/alerts/webhooks-sync";
import { AlertWebhookConfig } from "@/lib/alerts/webhook-dispatcher";
import { AlertChannelsModal } from "@/components/terminal/AlertChannelsModal";

interface DaemonStatusSnapshot {
  isRunning: boolean;
  wsConnected: boolean;
  trackedSymbolsCount: number;
  activeAlertsCount: number;
  lastWsMessageTime: number;
  lastRestPollAt?: number | null;
  lastRestPollSuccessAt?: number | null;
  lastRestError?: string | null;
  restPollCount?: number;
}

interface DiagnosticsSummary {
  userId: string;
  userTotalAlerts: number;
  userActiveAlerts: number;
  userDiscordAlerts: number;
  userTelegramAlerts: number;
  globalActiveAlerts: number;
  discordConfigured: boolean;
  discordEnabled: boolean;
  maskedDiscordUrl: string;
  telegramConfigured: boolean;
  telegramEnabled: boolean;
  logsCount: number;
  discordSuccessCount: number;
  discordFailureCount: number;
}

type LogStatusFilter = "all" | "sent" | "failed" | "skipped" | "test" | "trigger";

function formatTimestamp(ts?: number | null): string {
  if (!ts) return "Never";
  return new Date(ts).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function DeliveryStatusBadge({
  channelName,
  result,
}: {
  channelName: "Discord" | "Telegram";
  result?: ChannelDeliveryResult;
}) {
  if (!result) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#121824] border border-[#233144] text-[10px] text-[#848e9c]">
        {channelName}: Not Attempted
      </span>
    );
  }

  if (result.ok) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#00c087]/15 border border-[#00c087]/40 text-[10px] font-bold text-[#00c087]">
        <CheckCircle2 size={11} />
        <span>
          {channelName}: SENT{result.status ? ` (${result.status})` : ""}
        </span>
      </span>
    );
  }

  if (result.skipped) {
    return (
      <span
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/40 text-[10px] font-semibold text-amber-300"
        title={result.skippedReason}
      >
        <AlertTriangle size={11} />
        <span>{channelName}: SKIPPED</span>
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[#ff3b30]/15 border border-[#ff3b30]/40 text-[10px] font-bold text-[#ff3b30]"
      title={result.error}
    >
      <XCircle size={11} />
      <span>
        {channelName}: FAILED{result.status ? ` (${result.status})` : ""}
      </span>
    </span>
  );
}

export default function RadarLogsPage() {
  const [logs, setLogs] = useState<AlertLogEntry[]>([]);
  const [daemonStatus, setDaemonStatus] = useState<DaemonStatusSnapshot | null>(null);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsSummary | null>(null);
  const [localAlerts, setLocalAlerts] = useState<PriceAlert[]>([]);
  const [webhookConfig, setWebhookConfig] = useState<AlertWebhookConfig>(loadClientWebhooks);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [syncingToServer, setSyncingToServer] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isChannelsModalOpen, setIsChannelsModalOpen] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<LogStatusFilter>("all");
  const [toast, setToast] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const showToast = useCallback((kind: "ok" | "err", text: string) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 5000);
  }, []);

  const fetchLogsAndDiagnostics = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      setLocalAlerts(loadClientAlerts());
      setWebhookConfig(loadClientWebhooks());

      const res = await fetch("/api/alerts/logs", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setDaemonStatus(data.daemonStatus ?? null);
      setDiagnostics(data.diagnostics ?? null);
    } catch (err) {
      showToast(
        "err",
        `Failed to load server logs: ${err instanceof Error ? err.message : "Network error"}`
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [showToast]);

  useEffect(() => {
    fetchLogsAndDiagnostics();
  }, [fetchLogsAndDiagnostics]);

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(() => {
      fetchLogsAndDiagnostics(false);
    }, 10_000);
    return () => clearInterval(timer);
  }, [autoRefresh, fetchLogsAndDiagnostics]);

  const handleSendTestDiscord = async () => {
    setSendingTest(true);
    try {
      const res = await fetch("/api/alerts/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test_server_discord" }),
      });
      const data = await res.json();
      if (data.success) {
        showToast("ok", data.message || "Test Discord notification sent!");
      } else {
        showToast("err", data.error || "Discord test notification failed");
      }
      await fetchLogsAndDiagnostics(false);
    } catch (err) {
      showToast(
        "err",
        err instanceof Error ? err.message : "Failed sending Discord test notification"
      );
    } finally {
      setSendingTest(false);
    }
  };

  const handleSyncBrowserToServer = async () => {
    setSyncingToServer(true);
    try {
      const localAlertList = loadClientAlerts();
      const localWebhooks = loadClientWebhooks();

      await syncAlerts();

      if (
        localWebhooks.discordWebhookUrl ||
        localWebhooks.telegramBotToken ||
        localWebhooks.tradingWebhook?.webhookUrl
      ) {
        await fetch("/api/alerts/webhooks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(localWebhooks),
        });
      } else {
        await syncWebhooks();
      }

      await fetch("/api/alerts/logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh_daemon" }),
      });

      await fetchLogsAndDiagnostics(false);
      showToast(
        "ok",
        `Synced ${localAlertList.filter((a) => a.active).length} active local alert(s) and webhook settings to the 24/7 server daemon.`
      );
    } catch (err) {
      showToast(
        "err",
        err instanceof Error ? err.message : "Failed syncing local state to server"
      );
    } finally {
      setSyncingToServer(false);
    }
  };

  const handleClearLogs = async () => {
    try {
      const res = await fetch("/api/alerts/logs", { method: "DELETE" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setLogs([]);
      showToast("ok", "Notification logs cleared.");
      await fetchLogsAndDiagnostics(false);
    } catch (err) {
      showToast("err", err instanceof Error ? err.message : "Failed clearing logs");
    }
  };

  const filteredLogs = useMemo(() => {
    return logs.filter((entry) => {
      const q = searchQuery.trim().toLowerCase();
      if (q) {
        const hay = [
          entry.symbol,
          entry.label,
          entry.message,
          entry.deliveryResults?.discord?.error,
          entry.deliveryResults?.discord?.skippedReason,
          entry.deliveryResults?.telegram?.error,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      const d = entry.deliveryResults?.discord;
      if (statusFilter === "sent") return Boolean(d?.ok);
      if (statusFilter === "failed") return Boolean(d && !d.ok && !d.skipped);
      if (statusFilter === "skipped") return Boolean(d?.skipped);
      if (statusFilter === "test") return entry.logType === "test";
      if (statusFilter === "trigger") return entry.logType !== "test";
      return true;
    });
  }, [logs, searchQuery, statusFilter]);

  const localActiveCount = useMemo(
    () => localAlerts.filter((a) => a.active).length,
    [localAlerts]
  );

  const hasLocalOnlyAlerts =
    diagnostics !== null && localActiveCount > diagnostics.userActiveAlerts;
  const discordMissingOnServer = diagnostics !== null && !diagnostics.discordConfigured;
  const discordDisabledOnServer =
    diagnostics !== null && diagnostics.discordConfigured && !diagnostics.discordEnabled;
  const hasRestPollingError = Boolean(daemonStatus?.lastRestError);

  return (
    <div className="min-h-screen bg-[#080b10] text-slate-100 flex flex-col font-sans">
      {/* HEADER */}
      <header className="sticky top-0 z-30 bg-[#0a0e16]/95 backdrop-blur-md border-b border-[#172233] px-4 lg:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/radar"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#233144] bg-[#121824] hover:bg-[#1a2332] text-xs font-bold text-[#848e9c] hover:text-white transition-colors"
          >
            <ArrowLeft size={13} />
            <span>Radar</span>
          </Link>

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#5865F2]/20 border border-[#5865F2]/40 flex items-center justify-center">
              <ScrollText size={16} className="text-[#7289da]" />
            </div>
            <div>
              <h1 className="text-sm lg:text-base font-bold text-white leading-tight flex items-center gap-2">
                <span>Discord & Server Alert Logs</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                    daemonStatus?.isRunning
                      ? "bg-[#00c087]/15 text-[#00c087] border border-[#00c087]/30"
                      : "bg-red-500/15 text-red-400 border border-red-500/30"
                  }`}
                >
                  {daemonStatus?.isRunning ? "DAEMON ONLINE" : "DAEMON OFFLINE"}
                </span>
              </h1>
              <p className="text-[11px] text-[#848e9c]">
                Real-time webhook delivery ledger, HTTP error trace, & 24/7 cloud monitor health
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/radar/alerts"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-xs font-bold text-amber-300 transition-colors"
          >
            <Bell size={13} />
            <span>Radar Alarms</span>
          </Link>

          <Link
            href="/chart?tab=alerts"
            className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#233144] bg-[#121824] hover:bg-[#1a2332] text-xs font-bold text-[#848e9c] hover:text-white transition-colors"
          >
            <TrendingUp size={13} />
            <span>Charts</span>
          </Link>

          <button
            type="button"
            onClick={() => setIsChannelsModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#233144] bg-[#121824] hover:bg-[#1a2332] text-xs font-bold text-[#b6c4ff] hover:text-white transition-colors cursor-pointer"
          >
            <Settings size={13} className="text-[#5865F2]" />
            <span>Channels</span>
          </button>

          <button
            type="button"
            onClick={handleSyncBrowserToServer}
            disabled={syncingToServer}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-cyan-500/40 bg-cyan-500/15 hover:bg-cyan-500/25 text-xs font-bold text-cyan-300 transition-colors cursor-pointer disabled:opacity-50"
            title="Push browser alerts and webhook URLs to server disk storage"
          >
            <UploadCloud size={13} className={syncingToServer ? "animate-bounce" : ""} />
            <span>Sync to Server</span>
          </button>

          <button
            type="button"
            onClick={handleSendTestDiscord}
            disabled={sendingTest}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#5865F2] hover:bg-[#4752c4] text-white text-xs font-bold transition-colors cursor-pointer disabled:opacity-50 shadow-md shadow-[#5865F2]/20"
            title="Send a live Discord ping using server webhook config and record HTTP response"
          >
            <Send size={13} />
            <span>{sendingTest ? "Sending..." : "Test Discord Ping"}</span>
          </button>

          <button
            type="button"
            onClick={() => fetchLogsAndDiagnostics(true)}
            disabled={refreshing}
            className="p-1.5 rounded-lg border border-[#233144] bg-[#121824] hover:bg-[#1a2332] text-[#848e9c] hover:text-white transition-colors cursor-pointer"
            title="Refresh logs & daemon health"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin text-[#2962ff]" : ""} />
          </button>
        </div>
      </header>

      {/* TOAST BANNER */}
      {toast && (
        <div
          className={`mx-4 lg:mx-6 mt-4 px-4 py-2.5 rounded-lg border text-xs font-semibold flex items-center justify-between ${
            toast.kind === "ok"
              ? "bg-[#00c087]/15 border-[#00c087]/40 text-[#00c087]"
              : "bg-[#ff3b30]/15 border-[#ff3b30]/40 text-[#ff3b30]"
          }`}
        >
          <span>{toast.text}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            className="text-current opacity-70 hover:opacity-100 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      <main className="flex-1 px-4 lg:px-6 py-5 space-y-5 max-w-[1440px] w-full mx-auto">
        {/* DIAGNOSTIC ROOT CAUSE CALLOUTS */}
        {(discordMissingOnServer ||
          discordDisabledOnServer ||
          hasLocalOnlyAlerts ||
          (diagnostics && diagnostics.userActiveAlerts === 0) ||
          hasRestPollingError) && (
          <section className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-amber-300 text-xs font-bold uppercase tracking-wider">
              <ShieldAlert size={15} />
              <span>Discord Delivery Diagnostic Alerts Detected</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 text-xs text-amber-100/90">
              {discordMissingOnServer && (
                <div className="p-2.5 rounded-lg bg-[#0c1017]/80 border border-amber-500/30 flex items-center justify-between gap-3">
                  <span>
                    No Discord Webhook URL is stored on the server for account{" "}
                    <code className="text-amber-300">{diagnostics?.userId}</code>.
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsChannelsModalOpen(true)}
                    className="shrink-0 px-2.5 py-1 rounded bg-amber-500 text-slate-950 font-bold text-[11px] cursor-pointer"
                  >
                    Configure Discord
                  </button>
                </div>
              )}

              {discordDisabledOnServer && (
                <div className="p-2.5 rounded-lg bg-[#0c1017]/80 border border-amber-500/30 flex items-center justify-between gap-3">
                  <span>
                    Discord webhook URL exists on server, but its toggle is currently{" "}
                    <strong>DISABLED</strong>.
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsChannelsModalOpen(true)}
                    className="shrink-0 px-2.5 py-1 rounded bg-amber-500 text-slate-950 font-bold text-[11px] cursor-pointer"
                  >
                    Enable Channel
                  </button>
                </div>
              )}

              {hasLocalOnlyAlerts && (
                <div className="p-2.5 rounded-lg bg-[#0c1017]/80 border border-cyan-500/30 flex items-center justify-between gap-3">
                  <span>
                    Browser has <strong>{localActiveCount}</strong> active alert(s), while server
                    daemon only sees <strong>{diagnostics?.userActiveAlerts}</strong>.
                  </span>
                  <button
                    type="button"
                    onClick={handleSyncBrowserToServer}
                    disabled={syncingToServer}
                    className="shrink-0 px-2.5 py-1 rounded bg-cyan-500 text-slate-950 font-bold text-[11px] cursor-pointer"
                  >
                    Sync Now
                  </button>
                </div>
              )}

              {diagnostics && diagnostics.userActiveAlerts === 0 && !hasLocalOnlyAlerts && (
                <div className="p-2.5 rounded-lg bg-[#0c1017]/80 border border-amber-500/30 flex items-center justify-between gap-3">
                  <span>
                    Server currently has <strong>0 active alarms</strong> to evaluate 24/7.
                  </span>
                  <Link
                    href="/radar"
                    className="shrink-0 px-2.5 py-1 rounded bg-amber-500 text-slate-950 font-bold text-[11px]"
                  >
                    Arm Alerts on Radar
                  </Link>
                </div>
              )}

              {hasRestPollingError && (
                <div className="p-2.5 rounded-lg bg-[#0c1017]/80 border border-red-500/40 text-red-200">
                  <strong>Latest REST Price Poll Error:</strong> {daemonStatus?.lastRestError}
                </div>
              )}
            </div>
          </section>
        )}

        {/* HEALTH SUMMARY CARDS */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Card 1: 24/7 Daemon Status */}
          <div className="p-4 rounded-xl bg-[#0c1017] border border-[#172233] space-y-2">
            <div className="flex items-center justify-between text-[11px] text-[#848e9c] font-semibold">
              <span>24/7 Cloud Monitor</span>
              {daemonStatus?.wsConnected ? (
                <Wifi size={14} className="text-[#00c087]" />
              ) : (
                <WifiOff size={14} className="text-amber-400" />
              )}
            </div>
            <div className="text-lg font-bold text-white flex items-center gap-2">
              <span>{daemonStatus?.isRunning ? "Running" : "Stopped"}</span>
              <span className="text-[11px] font-mono font-normal text-[#848e9c]">
                ({daemonStatus?.wsConnected ? "WS Live" : "REST Poll"})
              </span>
            </div>
            <div className="text-[11px] text-[#848e9c] flex flex-col gap-0.5 font-mono">
              <span>Tracked Pairs: {daemonStatus?.trackedSymbolsCount ?? 0}</span>
              <span>
                Last REST Sync: {formatTimestamp(daemonStatus?.lastRestPollSuccessAt)}
              </span>
            </div>
          </div>

          {/* Card 2: Server Active Alerts */}
          <div className="p-4 rounded-xl bg-[#0c1017] border border-[#172233] space-y-2">
            <div className="flex items-center justify-between text-[11px] text-[#848e9c] font-semibold">
              <span>Monitored Server Alarms</span>
              <Bell size={14} className="text-amber-400" />
            </div>
            <div className="text-lg font-bold text-white flex items-baseline gap-2">
              <span>{diagnostics?.userActiveAlerts ?? 0}</span>
              <span className="text-[11px] font-normal text-[#848e9c]">
                active / {diagnostics?.userTotalAlerts ?? 0} total
              </span>
            </div>
            <div className="text-[11px] text-[#848e9c] flex flex-col gap-0.5 font-mono">
              <span>Discord-enabled alarms: {diagnostics?.userDiscordAlerts ?? 0}</span>
              <span>Browser localStorage active: {localActiveCount}</span>
            </div>
          </div>

          {/* Card 3: Discord Webhook Config */}
          <div className="p-4 rounded-xl bg-[#0c1017] border border-[#172233] space-y-2">
            <div className="flex items-center justify-between text-[11px] text-[#848e9c] font-semibold">
              <span>Server Discord Channel</span>
              <Activity size={14} className="text-[#5865F2]" />
            </div>
            <div className="text-lg font-bold flex items-center gap-2">
              {diagnostics?.discordEnabled ? (
                <span className="text-[#00c087]">Enabled</span>
              ) : diagnostics?.discordConfigured ? (
                <span className="text-amber-400">Disabled</span>
              ) : (
                <span className="text-[#ff3b30]">Not Configured</span>
              )}
            </div>
            <div className="text-[11px] text-[#848e9c] flex flex-col gap-0.5 font-mono truncate">
              <span className="truncate" title={diagnostics?.maskedDiscordUrl || "None"}>
                {diagnostics?.maskedDiscordUrl || "No server webhook saved"}
              </span>
              <span>
                Sent: {diagnostics?.discordSuccessCount ?? 0} • Failed:{" "}
                {diagnostics?.discordFailureCount ?? 0}
              </span>
            </div>
          </div>

          {/* Card 4: Delivery Audit Stats */}
          <div className="p-4 rounded-xl bg-[#0c1017] border border-[#172233] space-y-2">
            <div className="flex items-center justify-between text-[11px] text-[#848e9c] font-semibold">
              <span>Audit Ledger</span>
              <Clock size={14} className="text-[#2962ff]" />
            </div>
            <div className="text-lg font-bold text-white flex items-baseline gap-2">
              <span>{logs.length}</span>
              <span className="text-[11px] font-normal text-[#848e9c]">logged events</span>
            </div>
            <div className="text-[11px] text-[#848e9c] flex items-center justify-between pt-1">
              <label className="inline-flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="accent-[#2962ff]"
                />
                <span>Auto-refresh (10s)</span>
              </label>
              {logs.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearLogs}
                  className="inline-flex items-center gap-1 text-red-400 hover:text-red-300 cursor-pointer"
                >
                  <Trash2 size={11} />
                  <span>Clear</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* FILTER & SEARCH BAR */}
        <section className="flex flex-wrap items-center justify-between gap-3 bg-[#0c1017] border border-[#172233] rounded-xl p-3">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search
              size={14}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[#848e9c]"
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search coin, alert label, or Discord error..."
              className="w-full pl-9 pr-3 py-1.5 bg-[#080b10] border border-[#233144] rounded-lg text-xs text-white placeholder:text-[#848e9c] focus:outline-none focus:border-[#2962ff]"
            />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "all", label: "All Events" },
                { id: "sent", label: "Sent (OK)" },
                { id: "failed", label: "Failed" },
                { id: "skipped", label: "Skipped" },
                { id: "trigger", label: "Alert Triggers" },
                { id: "test", label: "Test Pings" },
              ] as const
            ).map((pill) => (
              <button
                key={pill.id}
                type="button"
                onClick={() => setStatusFilter(pill.id)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-colors cursor-pointer ${
                  statusFilter === pill.id
                    ? "bg-[#2962ff] text-white"
                    : "bg-[#121824] text-[#848e9c] hover:text-white border border-[#233144]"
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </section>

        {/* LOGS TABLE */}
        <section className="rounded-xl border border-[#172233] bg-[#0c1017] overflow-hidden">
          {loading ? (
            <div className="py-16 text-center text-xs text-[#848e9c]">
              Loading server alert & webhook logs...
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-16 px-4 text-center space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-[#121824] border border-[#233144] flex items-center justify-center text-[#848e9c]">
                <ScrollText size={20} />
              </div>
              <div className="text-sm font-bold text-white">
                {logs.length === 0
                  ? "No Alert Trigger or Discord Delivery Logs Recorded Yet"
                  : "No Logs Match Your Filter"}
              </div>
              <p className="text-xs text-[#848e9c] max-w-md mx-auto">
                {logs.length === 0
                  ? "Click 'Test Discord Ping' above to verify live Discord delivery and create your first log entry, or wait for one of your armed 24/7 alarms to cross price."
                  : "Try clearing the search query or switching to 'All Events'."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#172233] bg-[#0a0e16] text-[10px] font-bold uppercase tracking-wider text-[#848e9c]">
                    <th className="py-3 px-4">Time</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4">Symbol</th>
                    <th className="py-3 px-4">Event / Details</th>
                    <th className="py-3 px-4">Prices</th>
                    <th className="py-3 px-4">Channel Delivery</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#172233]/70 text-xs">
                  {filteredLogs.map((entry) => {
                    const discordRes = entry.deliveryResults?.discord;
                    const telegramRes = entry.deliveryResults?.telegram;
                    const errDetail =
                      discordRes?.error ||
                      discordRes?.skippedReason ||
                      telegramRes?.error;

                    return (
                      <tr
                        key={entry.id}
                        className="hover:bg-[#121824]/60 transition-colors align-top"
                      >
                        <td className="py-3 px-4 font-mono text-[11px] text-[#848e9c] whitespace-nowrap">
                          {formatTimestamp(entry.triggeredAt)}
                        </td>

                        <td className="py-3 px-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              entry.logType === "test"
                                ? "bg-[#5865F2]/20 text-[#9aa4ff] border border-[#5865F2]/40"
                                : "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                            }`}
                          >
                            {entry.logType === "test" ? "TEST" : "TRIGGER"}
                          </span>
                        </td>

                        <td className="py-3 px-4 font-bold text-white whitespace-nowrap">
                          {entry.symbol}
                        </td>

                        <td className="py-3 px-4 max-w-md space-y-1">
                          <div className="font-semibold text-white">{entry.label}</div>
                          {entry.message && (
                            <div className="text-[11px] text-[#848e9c] break-words">
                              {entry.message}
                            </div>
                          )}
                          {errDetail && !discordRes?.ok && (
                            <div className="text-[11px] text-amber-300/90 bg-[#080b10] border border-[#233144] rounded px-2 py-1 font-mono break-words">
                              {errDetail}
                            </div>
                          )}
                        </td>

                        <td className="py-3 px-4 font-mono text-[11px] whitespace-nowrap">
                          {entry.triggerPrice > 0 || entry.targetPrice > 0 ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="text-white">
                                Hit: ${formatPoiPrice(entry.triggerPrice)}
                              </span>
                              <span className="text-[#848e9c]">
                                Target: ${formatPoiPrice(entry.targetPrice)}
                              </span>
                            </div>
                          ) : (
                            <span className="text-[#848e9c]">—</span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <div className="flex flex-col items-start gap-1.5">
                            <DeliveryStatusBadge channelName="Discord" result={discordRes} />
                            {telegramRes && !telegramRes.skipped && (
                              <DeliveryStatusBadge
                                channelName="Telegram"
                                result={telegramRes}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>

      <AlertChannelsModal
        isOpen={isChannelsModalOpen}
        onClose={() => {
          setIsChannelsModalOpen(false);
          fetchLogsAndDiagnostics(false);
        }}
        config={webhookConfig}
        onSave={(saved) => {
          setWebhookConfig(saved);
          fetchLogsAndDiagnostics(false);
        }}
      />
    </div>
  );
}
