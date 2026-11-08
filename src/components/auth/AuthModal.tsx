"use client";

import React, { useState } from "react";
import {
  X,
  User,
  Lock,
  Mail,
  Shield,
  CheckCircle2,
  AlertCircle,
  LogOut,
  Database,
  Cloud,
} from "lucide-react";
import { AuthUser } from "@/lib/auth/use-auth";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: AuthUser | null;
  onLogin: (usernameOrEmail: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  onRegister: (username: string, email: string, pass: string) => Promise<{ success: boolean; error?: string }>;
  onLogout: () => Promise<void>;
}

export function AuthModal({
  isOpen,
  onClose,
  user,
  onLogin,
  onRegister,
  onLogout,
}: AuthModalProps) {
  const [activeTab, setActiveTab] = useState<"login" | "register">("login");

  // Form fields
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);

    const res = await onLogin(usernameOrEmail, password);
    setIsLoading(false);

    if (res.success) {
      setSuccessMsg("Successfully authenticated! Cloud sync active.");
      setTimeout(() => {
        onClose();
        setSuccessMsg(null);
      }, 1000);
    } else {
      setErrorMsg(res.error || "Failed to log in.");
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setIsLoading(true);

    const res = await onRegister(username, email, password);
    setIsLoading(false);

    if (res.success) {
      setSuccessMsg("Account created! Workspaces and watchlists synced.");
      setTimeout(() => {
        onClose();
        setSuccessMsg(null);
      }, 1000);
    } else {
      setErrorMsg(res.error || "Failed to create account.");
    }
  };

  const handleLogoutClick = async () => {
    setIsLoading(true);
    await onLogout();
    setIsLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs select-none p-4">
      <div className="bg-surface-container-lowest border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header Ribbon */}
        <div className="px-5 py-4 border-b border-border bg-surface flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-primary-container flex items-center justify-center text-white shadow-xs">
              <Cloud size={16} />
            </div>
            <div>
              <h3 className="font-sans font-bold text-sm text-on-surface">
                {user ? "Cloud Account Profile" : "Mochex Charts Cloud Terminal"}
              </h3>
              <p className="text-[11px] font-sans text-muted">
                {user ? "Active session connected" : "Sync layouts, watchlists & scripts across devices"}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded text-muted hover:text-on-surface hover:bg-surface-container transition-colors"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Body */}
        {user ? (
          /* Logged-In User Profile View */
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-container-low border border-border">
              <div className="w-11 h-11 rounded-full bg-gradient-to-tr from-primary-container to-blue-600 flex items-center justify-center text-white font-bold text-base shadow-sm">
                {typeof user?.username === "string" && user.username.length > 0
                  ? user.username.slice(0, 2).toUpperCase()
                  : "TR"}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold text-sm text-on-surface">{user?.username || "Trader"}</span>
                  <span
                    className={`text-[9px] font-mono font-bold px-1.5 py-0.2 rounded uppercase ${
                      user?.role === "ADMIN"
                        ? "bg-gold/15 text-gold border border-gold/30"
                        : "bg-secondary/15 text-secondary border border-secondary/30"
                    }`}
                  >
                    {user?.role || "TRADER"}
                  </span>
                </div>
                <div className="text-xs font-mono text-muted">{user?.email || ""}</div>
              </div>
            </div>

            {/* Cloud Status Info */}
            <div className="space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between p-2 rounded bg-surface-container-lowest border border-border/60">
                <span className="text-muted flex items-center gap-1.5">
                  <Database size={13} className="text-primary" />
                  <span>Cloud Database</span>
                </span>
                <span className="text-secondary font-semibold flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-secondary animate-pulse" />
                  Connected
                </span>
              </div>

              <div className="flex items-center justify-between p-2 rounded bg-surface-container-lowest border border-border/60">
                <span className="text-muted flex items-center gap-1.5">
                  <Shield size={13} className="text-cyan" />
                  <span>Session Type</span>
                </span>
                <span className="text-on-surface">HTTP-only JWT Secure Cookie</span>
              </div>
            </div>

            {/* Logout Button */}
            <button
              onClick={handleLogoutClick}
              disabled={isLoading}
              className="w-full py-2 px-3 rounded-lg bg-tertiary/15 hover:bg-tertiary/25 text-tertiary border border-tertiary/30 text-xs font-mono font-semibold transition-colors flex items-center justify-center gap-1.5"
            >
              <LogOut size={14} />
              <span>Sign Out of Account</span>
            </button>
          </div>
        ) : (
          /* Unauthenticated Login & Register View */
          <div className="p-5">
            {/* Tabs */}
            <div className="flex items-center bg-surface-container p-0.5 rounded-lg border border-border mb-4">
              <button
                onClick={() => {
                  setActiveTab("login");
                  setErrorMsg(null);
                }}
                className={`flex-1 py-1.5 rounded text-xs font-mono font-semibold transition-colors ${
                  activeTab === "login"
                    ? "bg-primary-container text-white shadow-xs"
                    : "text-muted hover:text-on-surface"
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => {
                  setActiveTab("register");
                  setErrorMsg(null);
                }}
                className={`flex-1 py-1.5 rounded text-xs font-mono font-semibold transition-colors ${
                  activeTab === "register"
                    ? "bg-primary-container text-white shadow-xs"
                    : "text-muted hover:text-on-surface"
                }`}
              >
                Create Account
              </button>
            </div>

            {/* Status alerts */}
            {errorMsg && (
              <div className="mb-3 p-2.5 rounded bg-tertiary/10 border border-tertiary/30 text-tertiary text-xs font-mono flex items-center gap-2">
                <AlertCircle size={14} className="shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}
            {successMsg && (
              <div className="mb-3 p-2.5 rounded bg-secondary/10 border border-secondary/30 text-secondary text-xs font-mono flex items-center gap-2">
                <CheckCircle2 size={14} className="shrink-0" />
                <span>{successMsg}</span>
              </div>
            )}

            {activeTab === "login" ? (
              /* Sign In Form */
              <form onSubmit={handleLoginSubmit} className="space-y-3 font-mono">
                <div>
                  <label className="text-[11px] text-muted block mb-1">Username or Email</label>
                  <div className="relative">
                    <User size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      type="text"
                      required
                      value={usernameOrEmail}
                      onChange={(e) => setUsernameOrEmail(e.target.value)}
                      placeholder="trader@mochex.io or admin"
                      className="w-full bg-surface-container-low text-on-surface placeholder-muted text-xs pl-8 pr-2.5 py-2 rounded border border-border focus:outline-hidden focus:border-primary-container transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-muted block mb-1">Password</label>
                  <div className="relative">
                    <Lock size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-surface-container-low text-on-surface placeholder-muted text-xs pl-8 pr-2.5 py-2 rounded border border-border focus:outline-hidden focus:border-primary-container transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full mt-2 py-2 px-3 rounded-lg bg-primary-container hover:bg-accent-hover text-white text-xs font-semibold transition-colors shadow-xs"
                >
                  {isLoading ? "Signing In..." : "Sign In & Sync Workspaces"}
                </button>
              </form>
            ) : (
              /* Create Account Form */
              <form onSubmit={handleRegisterSubmit} className="space-y-3 font-mono">
                <div>
                  <label className="text-[11px] text-muted block mb-1">Username</label>
                  <div className="relative">
                    <User size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      type="text"
                      required
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="ymatt"
                      className="w-full bg-surface-container-low text-on-surface placeholder-muted text-xs pl-8 pr-2.5 py-2 rounded border border-border focus:outline-hidden focus:border-primary-container transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-muted block mb-1">Email Address</label>
                  <div className="relative">
                    <Mail size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="ymatt@commandcenter.ph"
                      className="w-full bg-surface-container-low text-on-surface placeholder-muted text-xs pl-8 pr-2.5 py-2 rounded border border-border focus:outline-hidden focus:border-primary-container transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-muted block mb-1">Password</label>
                  <div className="relative">
                    <Lock size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted" />
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="w-full bg-surface-container-low text-on-surface placeholder-muted text-xs pl-8 pr-2.5 py-2 rounded border border-border focus:outline-hidden focus:border-primary-container transition-colors"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full mt-2 py-2 px-3 rounded-lg bg-primary-container hover:bg-accent-hover text-white text-xs font-semibold transition-colors shadow-xs"
                >
                  {isLoading ? "Creating Account..." : "Create Account & Connect Cloud"}
                </button>
              </form>
            )}

            <p className="text-[10px] text-muted font-sans mt-4 text-center">
              Guest mode is always active. An account unlocks cloud backup to your PocketBase database across all devices.
            </p>
            <div className="text-center mt-2 pt-2 border-t border-border/50">
              <a href="/login" className="text-[11px] text-primary hover:text-white transition-colors inline-flex items-center gap-1 font-medium">
                Open Fullscreen Login Page &rarr;
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
