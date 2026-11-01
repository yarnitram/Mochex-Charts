"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
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
} from "lucide-react";
import { useAuth } from "@/lib/auth/use-auth";

export default function LoginPage() {
  const router = useRouter();
  const { login, register } = useAuth();

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
          router.push("/");
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
          router.push("/");
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
          <span>Open Chart</span>
          <ArrowRight size={13} />
        </a>
      </header>

      {/* Main Authentication Box */}
      <main className="flex-1 flex items-center justify-center px-4 py-8 relative z-10">
        <div className="w-full max-w-md">
          {/* Card Container */}
          <div className="bg-[#0b131d]/90 backdrop-blur-md border border-[#1f2937] rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
            {/* Top Glow Accent Bar */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-primary-container via-cyan to-secondary" />

            {/* Title & Subtitle */}
            <div className="text-center mb-6">
              <h1 className="text-xl sm:text-2xl font-bold font-sans tracking-tight text-white">
                {mode === "login" ? "Welcome Back to Mochex Charts" : "Create Trader Account"}
              </h1>
              <p className="text-xs text-muted mt-1.5 font-sans">
                {mode === "login"
                  ? "Access your synced cloud layouts, indicators, and watchlists"
                  : "Start syncing layouts and custom indicators across all your devices"}
              </p>
            </div>

            {/* Mode Switcher Tabs */}
            <div className="flex p-1 rounded-xl bg-[#060c14] border border-[#1c2635] mb-6">
              <button
                type="button"
                onClick={() => {
                  setMode("login");
                  setErrorMessage(null);
                  setSuccessMessage(null);
                }}
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                  mode === "login"
                    ? "bg-primary-container text-white shadow-md shadow-primary-container/20"
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
                className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${
                  mode === "register"
                    ? "bg-primary-container text-white shadow-md shadow-primary-container/20"
                    : "text-muted hover:text-white"
                }`}
              >
                Create Account
              </button>
            </div>

            {/* Error & Success Feedback Alerts */}
            {errorMessage && (
              <div className="mb-5 p-3 rounded-xl bg-tertiary/15 border border-tertiary/30 flex items-start gap-2.5 text-xs text-rose-300 animate-in fade-in duration-150">
                <AlertCircle size={15} className="text-tertiary shrink-0 mt-0.5" />
                <span className="leading-tight">{errorMessage}</span>
              </div>
            )}

            {successMessage && (
              <div className="mb-5 p-3 rounded-xl bg-secondary/15 border border-secondary/30 flex items-start gap-2.5 text-xs text-emerald-300 animate-in fade-in duration-150">
                <CheckCircle2 size={15} className="text-secondary shrink-0 mt-0.5" />
                <span className="leading-tight">{successMessage}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === "login" ? (
                /* Login Fields */
                <>
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1.5">
                      Username or Email
                    </label>
                    <div className="relative">
                      <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                      <input
                        type="text"
                        autoComplete="username"
                        required
                        value={usernameOrEmail}
                        onChange={(e) => setUsernameOrEmail(e.target.value)}
                        placeholder="trader@mochex.io or ymatt"
                        className="w-full bg-[#070e17] text-white placeholder:text-muted/60 text-xs pl-10 pr-3.5 py-2.5 rounded-xl border border-[#1f2937] focus:border-primary-container focus:ring-1 focus:ring-primary-container focus:outline-hidden transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-muted">Password</label>
                    </div>
                    <div className="relative">
                      <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                      <input
                        type={showPassword ? "text" : "password"}
                        autoComplete="current-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full bg-[#070e17] text-white placeholder:text-muted/60 text-xs pl-10 pr-10 py-2.5 rounded-xl border border-[#1f2937] focus:border-primary-container focus:ring-1 focus:ring-primary-container focus:outline-hidden transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-white transition-colors"
                      >
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                /* Register Fields */
                <>
                  <div>
                    <label className="block text-xs font-medium text-muted mb-1.5">
                      Trader Username
                    </label>
                    <div className="relative">
                      <User size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                      <input
                        type="text"
                        autoComplete="username"
                        required
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="crypto_trader"
                        className="w-full bg-[#070e17] text-white placeholder:text-muted/60 text-xs pl-10 pr-3.5 py-2.5 rounded-xl border border-[#1f2937] focus:border-primary-container focus:ring-1 focus:ring-primary-container focus:outline-hidden transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted mb-1.5">
                      Email Address
                    </label>
                    <div className="relative">
                      <Mail size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                      <input
                        type="email"
                        autoComplete="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="trader@mochex.io"
                        className="w-full bg-[#070e17] text-white placeholder:text-muted/60 text-xs pl-10 pr-3.5 py-2.5 rounded-xl border border-[#1f2937] focus:border-primary-container focus:ring-1 focus:ring-primary-container focus:outline-hidden transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted mb-1.5">
                      Password (min. 6 characters)
                    </label>
                    <div className="relative">
                      <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                      <input
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full bg-[#070e17] text-white placeholder:text-muted/60 text-xs pl-10 pr-10 py-2.5 rounded-xl border border-[#1f2937] focus:border-primary-container focus:ring-1 focus:ring-primary-container focus:outline-hidden transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-muted hover:text-white transition-colors"
                      >
                        {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-muted mb-1.5">
                      Confirm Password
                    </label>
                    <div className="relative">
                      <Lock size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
                      <input
                        type={showPassword ? "text" : "password"}
                        autoComplete="new-password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="••••••••••••"
                        className="w-full bg-[#070e17] text-white placeholder:text-muted/60 text-xs pl-10 pr-3.5 py-2.5 rounded-xl border border-[#1f2937] focus:border-primary-container focus:ring-1 focus:ring-primary-container focus:outline-hidden transition-all"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full mt-2 py-3 px-4 rounded-xl bg-primary-container hover:bg-blue-600 active:scale-[0.99] text-white text-xs font-bold tracking-wide transition-all shadow-lg shadow-primary-container/25 flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? (
                  <span className="inline-block animate-pulse">Authenticating with PocketBase...</span>
                ) : mode === "login" ? (
                  <>
                    <span>Sign In to Workstation</span>
                    <ArrowRight size={14} />
                  </>
                ) : (
                  <>
                    <span>Create Account & Sync Workstation</span>
                    <ArrowRight size={14} />
                  </>
                )}
              </button>
            </form>

            {/* Guest Access Alternative */}
            <div className="mt-6 pt-5 border-t border-[#1a2332] text-center">
              <p className="text-[11px] text-muted mb-3 font-sans">
                Prefer not to sign in right now?
              </p>
              <a
                href="/"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[#111923] hover:bg-[#162130] border border-[#212c3b] text-xs font-mono text-[#d9e3f3] hover:text-white transition-all shadow-xs"
              >
                <Zap size={13} className="text-amber-400" />
                <span>Continue as Guest Trader</span>
                <span className="text-[10px] text-muted">(Full Charting Available)</span>
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
