"use client";

import React, { useState, useEffect } from "react";
import {
  X,
  Key,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Trash2,
  Zap,
  Eye,
  EyeOff,
  ExternalLink,
  Coins,
  Cpu,
} from "lucide-react";
import {
  SupportedBrokerExchange,
  MaskedBrokerCredentials,
  ExchangeBalanceSummary,
} from "@/lib/trading/multi-broker-client";

interface BrokerCredentialsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCredentialsUpdated?: () => void;
}

export function BrokerCredentialsModal({
  isOpen,
  onClose,
  onCredentialsUpdated,
}: BrokerCredentialsModalProps) {
  const [activeTab, setActiveTab] = useState<SupportedBrokerExchange>("mexc");
  const [savedCreds, setSavedCreds] = useState<
    Partial<Record<SupportedBrokerExchange, MaskedBrokerCredentials>>
  >({});
  const [loadingInitial, setLoadingInitial] = useState(false);

  // Form states per active exchange
  const [apiKey, setApiKey] = useState("");
  const [apiSecret, setApiSecret] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [isTestnet, setIsTestnet] = useState(false);
  const [label, setLabel] = useState("");

  // Testing & Save states
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    latencyMs?: number;
    balance?: ExchangeBalanceSummary;
    error?: string;
  } | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Fetch configured credentials on open
  useEffect(() => {
    if (!isOpen) return;
    setLoadingInitial(true);
    fetch("/api/broker/credentials")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.credentials) {
          setSavedCreds(data.credentials);
        }
      })
      .catch((err) => console.warn("Failed to fetch broker credentials:", err))
      .finally(() => setLoadingInitial(false));
  }, [isOpen]);

  // Reset form inputs when active tab changes
  useEffect(() => {
    setApiKey("");
    setApiSecret("");
    setShowSecret(false);
    setTestResult(null);
    setSaveSuccess(false);
    setSaveError(null);

    const currentSaved = savedCreds[activeTab];
    if (currentSaved) {
      setIsTestnet(Boolean(currentSaved.testnet));
      setLabel(currentSaved.label || "");
    } else {
      setIsTestnet(false);
      setLabel("");
    }
  }, [activeTab, savedCreds]);

  if (!isOpen) return null;

  const currentMasked = savedCreds[activeTab];

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    setSaveError(null);

    try {
      const payload: any = { exchange: activeTab };
      if (apiKey && apiSecret) {
        payload.apiKey = apiKey.trim();
        payload.apiSecret = apiSecret.trim();
        payload.testnet = isTestnet;
      }

      const res = await fetch("/api/broker/balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        setTestResult({
          ok: false,
          latencyMs: data.latencyMs,
          error: data.error || "Connection test failed",
        });
      } else {
        setTestResult({
          ok: true,
          latencyMs: data.latencyMs,
          balance: data.balance,
        });
      }
    } catch (err: any) {
      setTestResult({
        ok: false,
        error: err?.message || "Failed to contact broker endpoint",
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveCredentials = async () => {
    if (!apiKey.trim() || !apiSecret.trim()) {
      setSaveError("Please enter both API Key and API Secret.");
      return;
    }

    setIsSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const res = await fetch("/api/broker/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          exchange: activeTab,
          apiKey: apiKey.trim(),
          apiSecret: apiSecret.trim(),
          testnet: isTestnet,
          label: label.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setSaveError(data.error || "Failed to save API credentials.");
      } else {
        setSavedCreds(data.credentials || {});
        setSaveSuccess(true);
        setApiKey("");
        setApiSecret("");
        if (onCredentialsUpdated) onCredentialsUpdated();
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    } catch (err: any) {
      setSaveError(err?.message || "Network error while saving credentials.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCredentials = async () => {
    if (!confirm(`Are you sure you want to disconnect ${activeTab.toUpperCase()} API keys?`)) {
      return;
    }

    setIsSaving(true);
    setSaveError(null);

    try {
      const res = await fetch(`/api/broker/credentials?exchange=${activeTab}`, {
        method: "DELETE",
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setSaveError(data.error || "Failed to remove credentials.");
      } else {
        setSavedCreds(data.credentials || {});
        setTestResult(null);
        if (onCredentialsUpdated) onCredentialsUpdated();
      }
    } catch (err: any) {
      setSaveError(err?.message || "Network error while deleting credentials.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleLoadMockKeys = () => {
    setApiKey(`mock:${activeTab}-live-key-8492048`);
    setApiSecret(`mock:${activeTab}-live-secret-994827103847`);
    setLabel("Sandbox Simulator Account");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-100">
                  Multi-Broker Direct Execution
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950/80 text-cyan-400 border border-cyan-800/60">
                  DEC-156
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Native HMAC-SHA256 direct order execution for MEXC, Binance & Bybit
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Security Notice Banner */}
        <div className="px-6 py-2.5 bg-amber-950/30 border-b border-amber-800/30 flex items-center gap-2.5 text-xs text-amber-300">
          <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
          <span>
            <strong>Security Notice:</strong> Keys are signed with server-side HMAC-SHA256.{" "}
            <span className="text-amber-200 underline font-medium">
              Grant Read & Trade permissions only.
            </span>{" "}
            NEVER enable withdrawal permissions.
          </span>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Exchange Selector Tabs */}
          <div className="grid grid-cols-3 gap-2 p-1 bg-slate-950 rounded-xl border border-slate-800">
            {(["mexc", "binance", "bybit"] as SupportedBrokerExchange[]).map((ex) => {
              const isConfigured = Boolean(savedCreds[ex]?.apiKeyMasked);
              const isActive = activeTab === ex;
              return (
                <button
                  key={ex}
                  onClick={() => setActiveTab(ex)}
                  className={`flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? "bg-slate-800 text-cyan-300 border border-cyan-500/40 shadow-sm"
                      : "text-slate-400 hover:text-slate-200 hover:bg-slate-900"
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isConfigured ? "bg-emerald-400 animate-pulse" : "bg-slate-600"
                    }`}
                  />
                  <span className="capitalize font-semibold">{ex}</span>
                  {ex === "mexc" && <span className="text-[10px] text-slate-500">Spot</span>}
                  {ex === "binance" && <span className="text-[10px] text-slate-500">Futures/Spot</span>}
                  {ex === "bybit" && <span className="text-[10px] text-slate-500">V5 Unified</span>}
                </button>
              );
            })}
          </div>

          {/* Current Connection Status Box */}
          <div className="p-3.5 bg-slate-950/70 rounded-xl border border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                  currentMasked
                    ? "bg-emerald-950/50 text-emerald-400 border border-emerald-800/60"
                    : "bg-slate-900 text-slate-500 border border-slate-800"
                }`}
              >
                {currentMasked ? (
                  <ShieldCheck className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Key className="w-4 h-4 text-slate-500" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-200 capitalize">
                    {activeTab} Connection Status:
                  </span>
                  {currentMasked ? (
                    <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/50">
                      Active: {currentMasked.apiKeyMasked}
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-500">Not Connected</span>
                  )}
                  {currentMasked?.testnet && (
                    <span className="text-[10px] font-mono text-amber-400 bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-800/50">
                      Testnet
                    </span>
                  )}
                </div>
                {currentMasked?.label && (
                  <div className="text-[11px] text-slate-400">Account: {currentMasked.label}</div>
                )}
              </div>
            </div>

            {currentMasked && (
              <button
                onClick={handleDeleteCredentials}
                disabled={isSaving}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 rounded-lg border border-rose-900/40 transition-colors"
                title="Disconnect API Key"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Disconnect</span>
              </button>
            )}
          </div>

          {/* Form Inputs */}
          <div className="space-y-3.5">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-300">
                  API Key {currentMasked && "(Enter new key to update)"}
                </label>
                <button
                  type="button"
                  onClick={handleLoadMockKeys}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                >
                  <Cpu className="w-3 h-3" />
                  <span>Use Mock Simulator Key</span>
                </button>
              </div>
              <input
                type="text"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={
                  currentMasked
                    ? `Current: ${currentMasked.apiKeyMasked} (leave blank to keep unchanged)`
                    : `Enter your ${activeTab.toUpperCase()} API Key`
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">API Secret</label>
              <div className="relative">
                <input
                  type={showSecret ? "text" : "password"}
                  value={apiSecret}
                  onChange={(e) => setApiSecret(e.target.value)}
                  placeholder={
                    currentMasked?.hasSecret
                      ? "•••••••••••••••••••••••• (leave blank to keep unchanged)"
                      : `Enter your ${activeTab.toUpperCase()} API Secret`
                  }
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 pr-10 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-2.5 text-slate-500 hover:text-slate-300"
                >
                  {showSecret ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1.5">
                  Account Label (Optional)
                </label>
                <input
                  type="text"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="e.g. Scalping Account 1"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-2 p-2 bg-slate-950 border border-slate-800 rounded-lg cursor-pointer hover:border-slate-700 transition-colors">
                  <input
                    type="checkbox"
                    checked={isTestnet}
                    onChange={(e) => setIsTestnet(e.target.checked)}
                    className="rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-0"
                  />
                  <span className="text-xs text-slate-300 font-medium">Testnet / Sandbox Mode</span>
                </label>
              </div>
            </div>
          </div>

          {/* Test Connection / Save Feedback Box */}
          {testResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs ${
                testResult.ok
                  ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300"
                  : "bg-rose-950/40 border-rose-800/60 text-rose-300"
              }`}
            >
              <div className="flex items-center gap-2 font-medium mb-1">
                {testResult.ok ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>
                  {testResult.ok
                    ? `Connected successfully! Latency: ${testResult.latencyMs}ms`
                    : `Connection Error: ${testResult.error}`}
                </span>
              </div>

              {testResult.ok && testResult.balance && (
                <div className="mt-2 pt-2 border-t border-emerald-800/40 grid grid-cols-2 gap-2">
                  <div className="bg-slate-900/60 p-2 rounded border border-emerald-800/30">
                    <span className="text-[10px] text-slate-400 block">Total Equity</span>
                    <span className="text-xs font-mono font-bold text-slate-100">
                      ${testResult.balance.totalEquityUsdt.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      USDT
                    </span>
                  </div>
                  <div className="bg-slate-900/60 p-2 rounded border border-emerald-800/30">
                    <span className="text-[10px] text-slate-400 block">Available Free</span>
                    <span className="text-xs font-mono font-bold text-emerald-400">
                      ${testResult.balance.freeUsdt.toLocaleString(undefined, {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}{" "}
                      USDT
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {saveSuccess && (
            <div className="p-3 bg-emerald-950/50 border border-emerald-800/60 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Credentials securely saved and encrypted for {activeTab.toUpperCase()}.</span>
            </div>
          )}

          {saveError && (
            <div className="p-3 bg-rose-950/50 border border-rose-800/60 rounded-xl text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <button
            type="button"
            onClick={handleTestConnection}
            disabled={isTesting || (!apiKey && !currentMasked)}
            className="flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-lg transition-colors border border-slate-700"
          >
            {isTesting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin text-cyan-400" />
            ) : (
              <Zap className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span>Test Connection & Check Balance</span>
          </button>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSaveCredentials}
              disabled={isSaving || !apiKey.trim() || !apiSecret.trim()}
              className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-950 bg-cyan-400 hover:bg-cyan-300 disabled:opacity-50 rounded-lg transition-colors font-semibold shadow-lg shadow-cyan-950/50"
            >
              {isSaving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Key className="w-3.5 h-3.5" />
              )}
              <span>Save & Connect</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
