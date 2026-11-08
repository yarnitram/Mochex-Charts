"use client";

import React, { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CandlestickChart,
  Lock,
  Mail,
  User,
  Eye,
  EyeOff,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Cloud,
  Zap,
  Activity,
  Layers,
  ChevronLeft,
} from "lucide-react";
import { useAuth } from "@/lib/auth/use-auth";

function LoginFormContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/chart";
  const { user, isLoading, login, register } = useAuth();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [usernameOrEmail, setUsernameOrEmail] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // If already authenticated, redirect straight to workstation or callbackUrl
  useEffect(() => {
    if (!isLoading && user) {
      router.push(callbackUrl);
    }
  }, [isLoading, user, router, callbackUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (mode === "register") {
      if (!username.trim() || !email.trim() || !password) {
        setErrorMessage("All fields are required.");
        return;
      }
      if (password.length < 6) {
        setErrorMessage("Password must be at least 6 characters.");
        return;
      }
      if (password !== confirmPassword) {
        setErrorMessage("Passwords do not match.");
        return;
      }

      setIsSubmitting(true);
      const res = await register(username.trim(), email.trim(), password);
      setIsSubmitting(false);

      if (!res.success) {
        setErrorMessage(res.error || "Failed to create account.");
      } else {
        setSuccessMessage("Account created! Redirecting to workstation...");
        setTimeout(() => {
          router.push(callbackUrl);
          router.refresh();
        }, 800);
      }
    } else {
      if (!usernameOrEmail.trim() || !password) {
        setErrorMessage("Please enter your username/email and password.");
        return;
      }

      setIsSubmitting(true);
      const res = await login(usernameOrEmail.trim(), password);
      setIsSubmitting(false);

      if (!res.success) {
        setErrorMessage(res.error || "Invalid username, email, or password.");
      } else {
        setSuccessMessage("Authentication successful! Loading charts...");
        setTimeout(() => {
          router.push(callbackUrl);
          router.refresh();
        }, 800);
      }
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#070d14] text-[#d9e3f3] flex flex-col justify-between selection:bg-primary-container selection:text-white relative overflow-y-auto overflow-x-hidden">
      {/* Background Ambience */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(41,98,255,0.18),rgba(255,255,255,0))] pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#131c27_1px,transparent_1px),linear-gradient(to_bottom,#131c27_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30 pointer-events-none" />

      {/* Top Header */}
      <header className="w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between relative z-10">
        <a href="/" className="flex items-center gap-2.5 group">
          <div className="w-8 h-8 rounded-lg bg-primary-container flex items-center justify-center text-white shadow-md shadow-primary-container/30 group-hover:scale-105 transition-transform">
            <CandlestickChart size={18} />
          </div>
          <div className="flex flex-col">
            <span className="font-sans font-black text-base tracking-wider text-white">
              MOCHEX <span className="text-secondary font-bold">CHARTS</span>
            </span>
            <span className="text-[10px] font-mono text-muted -mt-1 tracking-widest uppercase">
              Trading Workstation
            </span>
          </div>
        </a>

        <a
          href="/"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-surface-container-low hover:bg-surface-container border border-border text-xs font-mono font-medium text-muted hover:text-white transition-colors"
        >
          <ChevronLeft size={13} />
          <span>Platform Overview</span>
        </a>
      </header>

      {/* Main Authentication Box */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 relative z-10">
        <div className="w-full max-w-md">
          {/* Card Container */}
          <div className="bg-[#0b131d]/90 backdrop-blur-md border border-[#1f2937] rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
            {/* Top Glow Accent Bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-container via-cyan to-secondary" />

            {/* Title / Switcher Tabs */}
            <div className="flex items-center justify-between mb-6">
              <div>
                <h1 className="text-xl font-bold font-sans text-white tracking-tight">
                  {mode === "login" ? "Institutional Access" : "Create Trader Account"}
                </h1>
                <p className="text-xs text-muted mt-1 font-sans">
                  {mode === "login"
                    ? "Enter your credentials to unlock terminal charts"
                    : "Register to sync layouts, indicators, and alerts"}
                </p>
              </div>

              <div className="p-1 bg-[#111923] rounded-xl border border-[#1f2937] flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setMode("login");
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className={`px-3 py-1 text-xs font-mono font-medium rounded-lg transition-all ${
                    mode === "login"
                      ? "bg-primary-container text-white shadow-xs"
                      : "text-muted hover:text-white"
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("register");
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className={`px-3 py-1 text-xs font-mono font-medium rounded-lg transition-all ${
                    mode === "register"
                      ? "bg-primary-container text-white shadow-xs"
                      : "text-muted hover:text-white"
                  }`}
                >
                  Register
                </button>
              </div>
            </div>

            {/* Error / Success Feedback */}
            {errorMessage && (
              <div className="mb-4 p-3 rounded-xl bg-error/10 border border-error/20 flex items-center gap-2.5 text-xs text-error font-mono animate-in fade-in duration-150">
                <AlertCircle size={15} className="shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
            {successMessage && (
              <div className="mb-4 p-3 rounded-xl bg-secondary/10 border border-secondary/20 flex items-center gap-2.5 text-xs text-secondary font-mono animate-in fade-in duration-150">
                <CheckCircle2 size={15} className="shrink-0" />
                <span>{successMessage}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "register" ? (
                <>
                  {/* Username */}
                  <div>
                    <label className="block text-xs font-mono text-muted uppercase tracking-wider mb-1.5">
                      Username
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
                        <User size={15} />
                      </div>
                      <input
                        type="text"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="trader_quant"
                        autoComplete="username"
                        className="w-full pl-9 pr-3 py-2.5 bg-[#070e17] border border-[#1f2937] focus:border-primary-container rounded-xl text-xs font-mono text-white placeholder:text-muted/50 focus:outline-hidden transition-all shadow-inner"
                      />
                    </div>
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-xs font-mono text-muted uppercase tracking-wider mb-1.5">
                      Email Address
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
                        <Mail size={15} />
                      </div>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="trader@mochex.io"
                        autoComplete="email"
                        className="w-full pl-9 pr-3 py-2.5 bg-[#070e17] border border-[#1f2937] focus:border-primary-container rounded-xl text-xs font-mono text-white placeholder:text-muted/50 focus:outline-hidden transition-all shadow-inner"
                      />
                    </div>
                  </div>
                </>
              ) : (
                /* Login Username or Email */
                <div>
                  <label className="block text-xs font-mono text-muted uppercase tracking-wider mb-1.5">
                    Username or Email
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
                      <User size={15} />
                    </div>
                    <input
                      type="text"
                      value={usernameOrEmail}
                      onChange={(e) => setUsernameOrEmail(e.target.value)}
                      placeholder="trader_quant or trader@mochex.io"
                      autoComplete="username"
                      className="w-full pl-9 pr-3 py-2.5 bg-[#070e17] border border-[#1f2937] focus:border-primary-container rounded-xl text-xs font-mono text-white placeholder:text-muted/50 focus:outline-hidden transition-all shadow-inner"
                    />
                  </div>
                </div>
              )}

              {/* Password */}
              <div>
                <label className="block text-xs font-mono text-muted uppercase tracking-wider mb-1.5">
                  Password
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
                    <Lock size={15} />
                  </div>
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    autoComplete={mode === "register" ? "new-password" : "current-password"}
                    className="w-full pl-9 pr-10 py-2.5 bg-[#070e17] border border-[#1f2937] focus:border-primary-container rounded-xl text-xs font-mono text-white placeholder:text-muted/50 focus:outline-hidden transition-all shadow-inner"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-muted hover:text-white transition-colors"
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {/* Confirm Password (Register mode only) */}
              {mode === "register" && (
                <div>
                  <label className="block text-xs font-mono text-muted uppercase tracking-wider mb-1.5">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-muted">
                      <Lock size={15} />
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••••••"
                      autoComplete="new-password"
                      className="w-full pl-9 pr-3 py-2.5 bg-[#070e17] border border-[#1f2937] focus:border-primary-container rounded-xl text-xs font-mono text-white placeholder:text-muted/50 focus:outline-hidden transition-all shadow-inner"
                    />
                  </div>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-primary-container hover:bg-accent-hover text-white text-xs font-mono font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-primary-container/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                {isSubmitting ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <>
                    <span>
                      {mode === "login" ? "Unlock Terminal" : "Register & Open Workstation"}
                    </span>
                    <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </button>
            </form>

            {/* Direct Landing Link */}
            <div className="mt-6 pt-5 border-t border-[#1a2332] text-center">
              <p className="text-[11px] text-muted mb-2 font-sans">
                Looking for features, indicator docs, or live market metrics?
              </p>
              <a
                href="/"
                className="inline-flex items-center gap-1.5 text-xs font-mono text-primary hover:text-white transition-colors"
              >
                <span>Return to Mochex Platform Overview</span>
                <ArrowRight size={12} />
              </a>
            </div>
          </div>

          {/* Feature Highlights Bar */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-center">
            <div className="p-2.5 rounded-xl bg-[#091019]/70 border border-[#1a2332] flex items-center justify-center gap-2">
              <Cloud size={14} className="text-cyan shrink-0" />
              <span className="text-[10px] text-muted font-medium">PocketBase Cloud Sync</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#091019]/70 border border-[#1a2332] flex items-center justify-center gap-2">
              <Activity size={14} className="text-secondary shrink-0" />
              <span className="text-[10px] text-muted font-medium">60 FPS MEXC WebSockets</span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#091019]/70 border border-[#1a2332] flex items-center justify-center gap-2 col-span-2 sm:col-span-1">
              <ShieldCheck size={14} className="text-primary shrink-0" />
              <span className="text-[10px] text-muted font-medium">Local-First Privacy</span>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full text-center py-4 text-[11px] text-muted/60 relative z-10">
        Mochex Charts &bull; Institutional MEXC Technical Analysis &bull; PocketBase Cloud Active
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen w-full bg-[#070d14] flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-[#2962ff] border-t-transparent rounded-full animate-spin" />
        </div>
      }
    >
      <LoginFormContent />
    </Suspense>
  );
}
