"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Send,
  CheckCircle2,
  AlertCircle,
  Loader2,
  ExternalLink,
  Zap,
  RotateCcw,
  Code,
  Cpu,
} from "lucide-react";
import {
  AlertWebhookConfig,
  TradingWebhookPlatform,
  TradingWebhookConfig,
  isValidDiscordWebhookUrl,
  isValidTelegramBotToken,
  isValidTelegramChatId,
  isValidTradingWebhookUrl,
  getDefaultTradingWebhookTemplate,
} from "@/lib/alerts/webhook-dispatcher";
import {
  loadClientWebhooks,
  saveClientWebhooks,
  syncWebhooks,
  mergeClientAndServerWebhooks,
} from "@/lib/alerts/webhooks-sync";

export function DiscordIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994.021-.041.001-.09-.041-.106a13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

export function TelegramIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
    </svg>
  );
}

interface AlertChannelsModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: AlertWebhookConfig;
  onSave: (config: AlertWebhookConfig) => void;
}

export function AlertChannelsModal({
  isOpen,
  onClose,
  config: initialConfig,
  onSave,
}: AlertChannelsModalProps) {
  // Use passed config if populated, otherwise synchronously fall back to localStorage
  const fallbackConfig = typeof window !== "undefined" ? loadClientWebhooks() : {};
  const effectiveInitial =
    initialConfig && (initialConfig.discordWebhookUrl || initialConfig.telegramBotToken)
      ? initialConfig
      : fallbackConfig;

  const [discordWebhookUrl, setDiscordWebhookUrl] = useState(effectiveInitial.discordWebhookUrl || "");
  const [discordEnabled, setDiscordEnabled] = useState(
    effectiveInitial.discordEnabled ?? Boolean(effectiveInitial.discordWebhookUrl)
  );
  const [discordTesting, setDiscordTesting] = useState(false);
  const [discordStatus, setDiscordStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const [telegramBotToken, setTelegramBotToken] = useState(effectiveInitial.telegramBotToken || "");
  const [telegramChatId, setTelegramChatId] = useState(effectiveInitial.telegramChatId || "");
  const [telegramEnabled, setTelegramEnabled] = useState(
    effectiveInitial.telegramEnabled ?? Boolean(effectiveInitial.telegramBotToken && effectiveInitial.telegramChatId)
  );
  const [telegramTesting, setTelegramTesting] = useState(false);
  const [telegramStatus, setTelegramStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  // DEC-148: Automated Trading Webhook Configuration (3Commas, Cornix, TradingView)
  const [tradingEnabled, setTradingEnabled] = useState(effectiveInitial.tradingWebhook?.enabled ?? false);
  const [tradingPlatform, setTradingPlatform] = useState<TradingWebhookPlatform>(
    effectiveInitial.tradingWebhook?.platform || "3commas"
  );
  const [tradingWebhookUrl, setTradingWebhookUrl] = useState(effectiveInitial.tradingWebhook?.webhookUrl || "");
  const [tradingSecretToken, setTradingSecretToken] = useState(effectiveInitial.tradingWebhook?.secretToken || "");
  const [tradingBotId, setTradingBotId] = useState(effectiveInitial.tradingWebhook?.botId || "");
  const [tradingCustomTemplate, setTradingCustomTemplate] = useState(
    effectiveInitial.tradingWebhook?.customTemplate ||
      getDefaultTradingWebhookTemplate(effectiveInitial.tradingWebhook?.platform || "3commas")
  );
  const [tradingTesting, setTradingTesting] = useState(false);
  const [tradingStatus, setTradingStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveFeedback, setSaveFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  // Synchronize internal state whenever initialConfig updates or modal opens
  useEffect(() => {
    if (!isOpen) return;

    // 1. Load from localStorage first to prevent blank flashes
    const local = loadClientWebhooks();
    const source =
      initialConfig && (initialConfig.discordWebhookUrl || initialConfig.telegramBotToken)
        ? mergeClientAndServerWebhooks(local, initialConfig)
        : local;

    if (source.discordWebhookUrl) setDiscordWebhookUrl(source.discordWebhookUrl);
    if (typeof source.discordEnabled === "boolean") {
      setDiscordEnabled(source.discordEnabled);
    } else if (source.discordWebhookUrl) {
      setDiscordEnabled(true);
    }

    if (source.telegramBotToken) setTelegramBotToken(source.telegramBotToken);
    if (source.telegramChatId) setTelegramChatId(source.telegramChatId);
    if (typeof source.telegramEnabled === "boolean") {
      setTelegramEnabled(source.telegramEnabled);
    } else if (source.telegramBotToken && source.telegramChatId) {
      setTelegramEnabled(true);
    }

    if (source.tradingWebhook) {
      setTradingEnabled(source.tradingWebhook.enabled ?? false);
      setTradingPlatform(source.tradingWebhook.platform || "3commas");
      setTradingWebhookUrl(source.tradingWebhook.webhookUrl || "");
      setTradingSecretToken(source.tradingWebhook.secretToken || "");
      setTradingBotId(source.tradingWebhook.botId || "");
      if (source.tradingWebhook.customTemplate) {
        setTradingCustomTemplate(source.tradingWebhook.customTemplate);
      }
    }

    // 2. Then perform non-destructive sync with server in background
    syncWebhooks()
      .then((synced) => {
        if (synced.discordWebhookUrl) setDiscordWebhookUrl(synced.discordWebhookUrl);
        if (typeof synced.discordEnabled === "boolean") setDiscordEnabled(synced.discordEnabled);
        if (synced.telegramBotToken) setTelegramBotToken(synced.telegramBotToken);
        if (synced.telegramChatId) setTelegramChatId(synced.telegramChatId);
        if (typeof synced.telegramEnabled === "boolean") setTelegramEnabled(synced.telegramEnabled);
        if (synced.tradingWebhook?.webhookUrl) {
          setTradingEnabled(synced.tradingWebhook.enabled ?? false);
          setTradingPlatform(synced.tradingWebhook.platform || "3commas");
          setTradingWebhookUrl(synced.tradingWebhook.webhookUrl || "");
          setTradingSecretToken(synced.tradingWebhook.secretToken || "");
          setTradingBotId(synced.tradingWebhook.botId || "");
        }
      })
      .catch(() => {});
  }, [initialConfig, isOpen]);

  if (!isOpen) return null;

  const handleSelectPlatform = (platform: TradingWebhookPlatform) => {
    setTradingPlatform(platform);
    setTradingStatus(null);
    setTradingCustomTemplate(getDefaultTradingWebhookTemplate(platform));
    if (!tradingWebhookUrl && platform === "3commas") {
      setTradingWebhookUrl("https://app.3commas.io/trade_signal/v2");
    } else if (!tradingWebhookUrl && platform === "cornix") {
      setTradingWebhookUrl("https://trading.cornix.io/api/v1/tradingview-webhook");
    }
  };

  const handleInsertToken = (token: string) => {
    setTradingCustomTemplate((prev) => `${prev} {{${token}}}`);
  };

  const handleResetTemplate = () => {
    setTradingCustomTemplate(getDefaultTradingWebhookTemplate(tradingPlatform));
  };

  const handleTestTradingWebhook = async () => {
    if (!isValidTradingWebhookUrl(tradingWebhookUrl)) {
      setTradingStatus({
        ok: false,
        msg: "Please enter a valid webhook URL (https://... or http://...)",
      });
      return;
    }

    setTradingTesting(true);
    setTradingStatus(null);

    try {
      const res = await fetch("/api/alerts/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          channel: "trading_webhook",
          config: {
            tradingWebhook: {
              enabled: true,
              platform: tradingPlatform,
              webhookUrl: tradingWebhookUrl.trim(),
              secretToken: tradingSecretToken.trim(),
              botId: tradingBotId.trim(),
              customTemplate: tradingCustomTemplate,
            },
          },
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTradingStatus({ ok: true, msg: data.message || "Test signal delivered to trading webhook!" });
      } else {
        setTradingStatus({
          ok: false,
          msg: data.error || `Trading webhook error (HTTP ${res.status})`,
        });
      }
    } catch (err: unknown) {
      setTradingStatus({
        ok: false,
        msg: err instanceof Error ? err.message : "Failed to reach server",
      });
    } finally {
      setTradingTesting(false);
    }
  };

  const handleTestDiscord = async () => {
    if (!isValidDiscordWebhookUrl(discordWebhookUrl)) {
      setDiscordStatus({
        ok: false,
        msg: "Please enter a valid Discord webhook URL (https://discord.com/api/webhooks/...)",
      });
      return;
    }

    setDiscordTesting(true);
    setDiscordStatus(null);

    try {
      const res = await fetch("/api/alerts/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          channel: "discord",
          config: {
            discordWebhookUrl: discordWebhookUrl.trim(),
            discordEnabled: true,
          },
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setDiscordStatus({ ok: true, msg: "Test notification delivered to Discord channel!" });
      } else {
        setDiscordStatus({ ok: false, msg: data.error || `Discord error (HTTP ${res.status})` });
      }
    } catch (err: unknown) {
      setDiscordStatus({
        ok: false,
        msg: err instanceof Error ? err.message : "Failed to reach server",
      });
    } finally {
      setDiscordTesting(false);
    }
  };

  const handleTestTelegram = async () => {
    if (!isValidTelegramBotToken(telegramBotToken)) {
      setTelegramStatus({
        ok: false,
        msg: "Invalid Bot Token format. Example: 123456789:ABCdefGHIjklMNOpqr...",
      });
      return;
    }
    if (!isValidTelegramChatId(telegramChatId)) {
      setTelegramStatus({
        ok: false,
        msg: "Invalid Chat ID. Example: 987654321 or @your_channel_name",
      });
      return;
    }

    setTelegramTesting(true);
    setTelegramStatus(null);

    try {
      const res = await fetch("/api/alerts/notify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "test",
          channel: "telegram",
          config: {
            telegramBotToken: telegramBotToken.trim(),
            telegramChatId: telegramChatId.trim(),
            telegramEnabled: true,
          },
        }),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setTelegramStatus({ ok: true, msg: "Test alert delivered to Telegram chat!" });
      } else {
        setTelegramStatus({ ok: false, msg: data.error || `Telegram error (HTTP ${res.status})` });
      }
    } catch (err: unknown) {
      setTelegramStatus({
        ok: false,
        msg: err instanceof Error ? err.message : "Failed to reach server",
      });
    } finally {
      setTelegramTesting(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    setSaveFeedback(null);

    const hasDiscord = Boolean(discordWebhookUrl.trim());
    const hasTelegram = Boolean(telegramBotToken.trim() && telegramChatId.trim());
    const isTrading = Boolean(tradingWebhookUrl.trim());

    const updated: AlertWebhookConfig = {
      discordWebhookUrl: discordWebhookUrl.trim(),
      discordEnabled: hasDiscord ? (discordEnabled ?? true) : false,
      telegramBotToken: telegramBotToken.trim(),
      telegramChatId: telegramChatId.trim(),
      telegramEnabled: hasTelegram ? (telegramEnabled ?? true) : false,
      tradingWebhook: {
        enabled: isTrading ? (tradingEnabled ?? true) : false,
        platform: tradingPlatform,
        webhookUrl: tradingWebhookUrl.trim(),
        secretToken: tradingSecretToken.trim(),
        botId: tradingBotId.trim(),
        customTemplate: tradingCustomTemplate,
      },
    };

    // 1. Immediately persist locally & emit update event
    saveClientWebhooks(updated);

    try {
      // 2. Synchronize with 24/7 Server Alert Daemon (DEC-135)
      const res = await fetch("/api/alerts/webhooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updated),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error || `Server responded with ${res.status}`);
      }

      setSaveFeedback({ ok: true, msg: "✓ Saved to account database successfully!" });
      onSave(updated);
      setTimeout(() => {
        onClose();
        setSaveFeedback(null);
      }, 700);
    } catch (err: any) {
      console.warn("[AlertChannelsModal] Server webhook save notice:", err);
      onSave(updated);
      setSaveFeedback({ ok: false, msg: `Saved locally (${err?.message || "server sync notice"})` });
      setTimeout(() => {
        onClose();
        setSaveFeedback(null);
      }, 1200);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs select-none">
      <div className="bg-surface-container-low border border-border w-[520px] max-w-[95vw] rounded-xl shadow-2xl flex flex-col overflow-hidden text-xs font-mono animate-in fade-in zoom-in-95 duration-150 max-h-[90vh]">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface-container-lowest shrink-0">
          <div className="flex items-center gap-2">
            <Send size={15} className="text-primary" />
            <span className="font-semibold text-on-surface text-sm uppercase tracking-wide">
              Alert Notification Channels (DEC-130)
            </span>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-on-surface p-1 rounded hover:bg-surface cursor-pointer"
          >
            <X size={15} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-4">
          <p className="text-[11px] text-muted leading-relaxed">
            Connect Discord webhooks and Telegram bots to receive real-time price crossings, drawings, order blocks, and strategy execution signals. Webhooks are monitored 24/7 on the server even when your browser is closed.
          </p>

          {/* 1. DISCORD INTEGRATION CARD */}
          <div className="bg-surface-container-lowest border border-border/70 rounded-lg p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#5865F2] font-semibold text-xs">
                <DiscordIcon size={16} />
                <span>Discord Webhook</span>
              </div>
              <label className="flex items-center gap-1.5 text-on-surface cursor-pointer text-[11px]">
                <input
                  type="checkbox"
                  checked={discordEnabled}
                  onChange={(e) => setDiscordEnabled(e.target.checked)}
                  className="accent-[#5865F2] rounded cursor-pointer"
                />
                <span className={discordEnabled ? "text-on-surface font-semibold" : "text-muted"}>
                  {discordEnabled ? "Active" : "Disabled"}
                </span>
              </label>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted">Discord Webhook URL:</label>
              <input
                type="text"
                value={discordWebhookUrl}
                onChange={(e) => {
                  const val = e.target.value;
                  setDiscordWebhookUrl(val);
                  setDiscordStatus(null);
                  if (val.trim().length > 0) {
                    setDiscordEnabled(true);
                  } else {
                    setDiscordEnabled(false);
                  }
                }}
                placeholder="https://discord.com/api/webhooks/..."
                className="w-full bg-surface px-2.5 py-1.5 rounded border border-border text-on-surface font-mono text-[11px] placeholder:text-muted/40 focus:border-[#5865F2] outline-none"
              />
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[9px] text-muted/70 flex items-center gap-1">
                Server Settings &gt; Integrations &gt; Webhooks
              </span>
              <button
                type="button"
                onClick={handleTestDiscord}
                disabled={discordTesting || !discordWebhookUrl.trim()}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#5865F2]/20 hover:bg-[#5865F2] text-[#5865F2] hover:text-white border border-[#5865F2]/40 transition-colors text-[10px] font-semibold cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
              >
                {discordTesting ? (
                  <>
                    <Loader2 size={11} className="animate-spin" />
                    <span>Sending Test...</span>
                  </>
                ) : (
                  <>
                    <Send size={11} />
                    <span>Send Test Notification</span>
                  </>
                )}
              </button>
            </div>

            {discordStatus && (
              <div
                className={`p-2 rounded text-[10px] flex items-center gap-1.5 border ${
                  discordStatus.ok
                    ? "bg-green-500/10 border-green-500/30 text-green-400"
                    : "bg-red-500/10 border-red-500/30 text-red-400"
                }`}
              >
                {discordStatus.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                <span>{discordStatus.msg}</span>
              </div>
            )}
          </div>

          {/* 2. TELEGRAM INTEGRATION CARD */}
          <div className="bg-surface-container-lowest border border-border/70 rounded-lg p-3 flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-[#229ED9] font-semibold text-xs">
                <TelegramIcon size={16} />
                <span>Telegram Bot</span>
              </div>
              <label className="flex items-center gap-1.5 text-on-surface cursor-pointer text-[11px]">
                <input
                  type="checkbox"
                  checked={telegramEnabled}
                  onChange={(e) => setTelegramEnabled(e.target.checked)}
                  className="accent-[#229ED9] rounded cursor-pointer"
                />
                <span className={telegramEnabled ? "text-on-surface font-semibold" : "text-muted"}>
                  {telegramEnabled ? "Active" : "Disabled"}
                </span>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted">Bot Token:</label>
                <input
                  type="text"
                  value={telegramBotToken}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTelegramBotToken(val);
                    setTelegramStatus(null);
                    if (val.trim().length > 0 && telegramChatId.trim().length > 0) {
                      setTelegramEnabled(true);
                    }
                  }}
                  placeholder="123456789:ABCdef..."
                  className="w-full bg-surface px-2.5 py-1.5 rounded border border-border text-on-surface font-mono text-[11px] placeholder:text-muted/40 focus:border-[#229ED9] outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted">Chat ID:</label>
                <input
                  type="text"
                  value={telegramChatId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTelegramChatId(val);
                    setTelegramStatus(null);
                    if (val.trim().length > 0 && telegramBotToken.trim().length > 0) {
                      setTelegramEnabled(true);
                    }
                  }}
                  placeholder="987654321 or @channel"
                  className="w-full bg-surface px-2.5 py-1.5 rounded border border-border text-on-surface font-mono text-[11px] placeholder:text-muted/40 focus:border-[#229ED9] outline-none"
                />
              </div>
            </div>

            <div className="text-[9px] text-muted/70 bg-surface/60 p-2 rounded border border-border/40 flex flex-col gap-1 leading-normal">
              <span>
                1. Message <strong>@BotFather</strong> on Telegram and create a bot with <code className="text-on-surface">/newbot</code>.
              </span>
              <span>
                2. Send any message to your new bot, then get your numeric Chat ID via <strong>@userinfobot</strong> or <strong>@getmyid_bot</strong>.
              </span>
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[9px] text-muted/70">Instant Telegram alert delivery</span>
              <button
                type="button"
                onClick={handleTestTelegram}
                disabled={telegramTesting || !telegramBotToken.trim() || !telegramChatId.trim()}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#229ED9]/20 hover:bg-[#229ED9] text-[#229ED9] hover:text-white border border-[#229ED9]/40 transition-colors text-[10px] font-semibold cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
              >
                {telegramTesting ? (
                  <>
                    <Loader2 size={11} className="animate-spin" />
                    <span>Sending Test...</span>
                  </>
                ) : (
                  <>
                    <Send size={11} />
                    <span>Send Test Alert</span>
                  </>
                )}
              </button>
            </div>

            {telegramStatus && (
              <div
                className={`p-2 rounded text-[10px] flex items-center gap-1.5 border ${
                  telegramStatus.ok
                    ? "bg-green-500/10 border-green-500/30 text-green-400"
                    : "bg-red-500/10 border-red-500/30 text-red-400"
                }`}
              >
                {telegramStatus.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                <span>{telegramStatus.msg}</span>
              </div>
            )}
          </div>

          {/* 3. AUTOMATED TRADING WEBHOOK (3COMMAS / CORNIX / TRADINGVIEW - DEC-148) */}
          <div className="p-3 rounded-lg border border-border bg-surface-container-low flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1 rounded bg-[#00c087]/15 text-[#00c087] border border-[#00c087]/30">
                  <Zap size={16} />
                </div>
                <div>
                  <div className="text-xs font-semibold text-on-surface flex items-center gap-2">
                    <span>Automated Trading Webhooks</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-[#00c087]/15 text-[#00c087] border border-[#00c087]/30">
                      BOT EXECUTION
                    </span>
                  </div>
                  <div className="text-[10px] text-muted">
                    Execute live trades on 3Commas, Cornix, or custom webhook bridges on POI touch
                  </div>
                </div>
              </div>

              {/* Toggle Switch */}
              <button
                type="button"
                onClick={() => setTradingEnabled(!tradingEnabled)}
                className={`w-9 h-5 flex items-center rounded-full p-1 cursor-pointer transition-colors ${
                  tradingEnabled ? "bg-[#00c087]" : "bg-border"
                }`}
              >
                <div
                  className={`bg-white w-3 h-3 rounded-full shadow-md transform transition-transform ${
                    tradingEnabled ? "translate-x-4" : "translate-x-0"
                  }`}
                />
              </button>
            </div>

            {/* Platform Selector Pills */}
            <div className="flex items-center gap-1.5 bg-surface p-1 rounded-lg border border-border text-[10px]">
              {(["3commas", "cornix", "custom"] as TradingWebhookPlatform[]).map((platform) => {
                const isSel = tradingPlatform === platform;
                const label =
                  platform === "3commas"
                    ? "3Commas Bot"
                    : platform === "cornix"
                    ? "Cornix Auto-Trader"
                    : "Custom / TradingView";
                return (
                  <button
                    key={platform}
                    type="button"
                    onClick={() => handleSelectPlatform(platform)}
                    className={`flex-1 py-1 rounded font-semibold transition-colors cursor-pointer text-center ${
                      isSel
                        ? "bg-[#00c087] text-white shadow-xs"
                        : "text-muted hover:text-on-surface hover:bg-surface-container"
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            {/* Webhook URL Input */}
            <div className="flex flex-col gap-1">
              <label className="text-[10px] text-muted flex items-center justify-between">
                <span>Webhook Destination URL:</span>
                <span className="text-[9px] text-muted/70">HTTPS required</span>
              </label>
              <input
                type="text"
                value={tradingWebhookUrl}
                onChange={(e) => {
                  setTradingWebhookUrl(e.target.value);
                  setTradingStatus(null);
                }}
                placeholder={
                  tradingPlatform === "3commas"
                    ? "https://app.3commas.io/trade_signal/v2"
                    : tradingPlatform === "cornix"
                    ? "https://trading.cornix.io/api/v1/tradingview-webhook"
                    : "https://your-trading-bridge.com/webhook"
                }
                className="w-full bg-surface px-2.5 py-1.5 rounded border border-border text-on-surface font-mono text-[11px] placeholder:text-muted/40 focus:border-[#00c087] outline-none"
              />
            </div>

            {/* Platform Specific Fields */}
            {tradingPlatform === "3commas" && (
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted">3Commas Bot ID:</label>
                  <input
                    type="text"
                    value={tradingBotId}
                    onChange={(e) => {
                      setTradingBotId(e.target.value);
                      setTradingStatus(null);
                    }}
                    placeholder="12345678"
                    className="w-full bg-surface px-2.5 py-1.5 rounded border border-border text-on-surface font-mono text-[11px] placeholder:text-muted/40 focus:border-[#00c087] outline-none"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] text-muted">Email Token / Secret:</label>
                  <input
                    type="password"
                    value={tradingSecretToken}
                    onChange={(e) => {
                      setTradingSecretToken(e.target.value);
                      setTradingStatus(null);
                    }}
                    placeholder="a1b2c3d4-e5f6-..."
                    className="w-full bg-surface px-2.5 py-1.5 rounded border border-border text-on-surface font-mono text-[11px] placeholder:text-muted/40 focus:border-[#00c087] outline-none"
                  />
                </div>
              </div>
            )}

            {tradingPlatform === "cornix" && (
              <div className="flex flex-col gap-1">
                <label className="text-[10px] text-muted">Cornix Secret Passphrase / Token:</label>
                <input
                  type="password"
                  value={tradingSecretToken}
                  onChange={(e) => {
                    setTradingSecretToken(e.target.value);
                    setTradingStatus(null);
                  }}
                  placeholder="your-cornix-tradingview-secret"
                  className="w-full bg-surface px-2.5 py-1.5 rounded border border-border text-on-surface font-mono text-[11px] placeholder:text-muted/40 focus:border-[#00c087] outline-none"
                />
              </div>
            )}

            {/* Payload Template Editor */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className="text-muted font-semibold flex items-center gap-1">
                  <Code size={11} className="text-[#00c087]" />
                  <span>Payload Template (JSON)</span>
                </span>
                <button
                  type="button"
                  onClick={handleResetTemplate}
                  className="text-[9px] text-[#00c087] hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <RotateCcw size={9} />
                  <span>Reset Default</span>
                </button>
              </div>
              <textarea
                rows={5}
                value={tradingCustomTemplate}
                onChange={(e) => {
                  setTradingCustomTemplate(e.target.value);
                  setTradingStatus(null);
                }}
                className="w-full bg-surface px-2.5 py-1.5 rounded border border-border text-on-surface font-mono text-[10px] leading-relaxed placeholder:text-muted/40 focus:border-[#00c087] outline-none resize-y"
              />
            </div>

            {/* Available Template Variables */}
            <div className="flex flex-col gap-1 bg-surface/50 p-2 rounded border border-border/40">
              <span className="text-[9px] text-muted font-bold">Dynamic Tokens (Click to Insert):</span>
              <div className="flex flex-wrap gap-1">
                {[
                  "symbol",
                  "pair_slash",
                  "pair_underscore",
                  "action",
                  "price",
                  "stop_loss",
                  "take_profit_2r",
                  "take_profit_3r",
                  "timeframe",
                  "poi_label",
                ].map((token) => (
                  <button
                    key={token}
                    type="button"
                    onClick={() => handleInsertToken(token)}
                    className="px-1.5 py-0.5 rounded bg-surface hover:bg-[#00c087]/20 border border-border hover:border-[#00c087]/40 text-muted hover:text-[#00c087] text-[9px] font-mono cursor-pointer transition-colors"
                  >
                    {`{{${token}}}`}
                  </button>
                ))}
              </div>
            </div>

            {/* Test & Actions */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-[9px] text-muted/70">Dispatched automatically on 24/7 cloud alert</span>
              <button
                type="button"
                onClick={handleTestTradingWebhook}
                disabled={tradingTesting || !tradingWebhookUrl.trim()}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#00c087]/20 hover:bg-[#00c087] text-[#00c087] hover:text-white border border-[#00c087]/40 transition-colors text-[10px] font-semibold cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
              >
                {tradingTesting ? (
                  <>
                    <Loader2 size={11} className="animate-spin" />
                    <span>Executing Test Signal...</span>
                  </>
                ) : (
                  <>
                    <Zap size={11} />
                    <span>Send Test Trade Signal</span>
                  </>
                )}
              </button>
            </div>

            {tradingStatus && (
              <div
                className={`p-2 rounded text-[10px] flex items-center gap-1.5 border ${
                  tradingStatus.ok
                    ? "bg-green-500/10 border-green-500/30 text-green-400"
                    : "bg-red-500/10 border-red-500/30 text-red-400"
                }`}
              >
                {tradingStatus.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
                <span>{tradingStatus.msg}</span>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border bg-surface-container-lowest shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-emerald-400/90 flex items-center gap-1.5 font-medium">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              24/7 Cloud Offline Sync
            </span>
            {saveFeedback && (
              <span
                className={`text-[10px] flex items-center gap-1 font-semibold ${
                  saveFeedback.ok ? "text-emerald-400" : "text-amber-400"
                }`}
              >
                {saveFeedback.ok ? <CheckCircle2 size={11} /> : <AlertCircle size={11} />}
                <span>{saveFeedback.msg}</span>
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={onClose}
              className="px-3 py-1.5 rounded border border-border text-muted hover:text-on-surface hover:bg-surface transition-colors cursor-pointer text-[11px]"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSave}
              className="px-4 py-1.5 rounded bg-primary-container hover:bg-primary text-white font-semibold transition-colors cursor-pointer text-[11px] flex items-center gap-1.5"
            >
              {isSaving && <Loader2 size={12} className="animate-spin" />}
              <span>{isSaving ? "Saving to Database..." : "Save Configuration"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
