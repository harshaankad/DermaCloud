"use client";

import { useState } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";

type Step = "form" | "sent" | "google";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<Step>("form");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.isGoogleAccount) {
        setStep("google");
      } else if (data.success) {
        setStep("sent");
      } else {
        setError(data.message || "Something went wrong.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8 mt-6">
          <Link href="/" className="inline-flex items-center space-x-2.5 group">
            <Logo size="sm" />
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 border-l-4 border-l-teal-500 p-8">
          {step === "google" ? (
            /* ── Google account state ── */
            <div className="text-center py-2">
              <div className="flex justify-center mb-5">
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                </div>
              </div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">Google account detected</h2>
              <p className="text-gray-500 text-sm leading-relaxed mb-1">
                <span className="font-semibold text-gray-700">{email}</span> is linked to a Google account.
              </p>
              <p className="text-gray-400 text-sm leading-relaxed mb-8">
                Password reset isn't available for Google accounts. Please use the <strong className="text-gray-500">Continue with Google</strong> button on the login page to sign in.
              </p>
              <Link
                href="/login"
                className="inline-flex items-center justify-center gap-2 w-full py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold rounded-xl hover:from-teal-600 hover:to-cyan-700 transition-all shadow-lg shadow-teal-500/25 active:scale-[0.98]"
              >
                Go to Login
              </Link>
            </div>
          ) : step === "form" ? (
            <>
              {/* Icon */}
              <div className="flex justify-center mb-6">
                <div className="w-14 h-14 bg-teal-50 rounded-2xl flex items-center justify-center">
                  <svg className="w-7 h-7 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </div>
              </div>

              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Forgot password?</h2>
                <p className="text-gray-500 mt-1.5 text-sm leading-relaxed">
                  No worries. Enter your email and we'll send you a link to reset it.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all outline-none text-gray-900 bg-white"
                      placeholder="doctor@example.com"
                      autoComplete="email"
                      autoFocus
                    />
                  </div>
                </div>

                {error && (
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                    <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold rounded-xl hover:from-teal-600 hover:to-cyan-700 transition-all shadow-lg shadow-teal-500/25 hover:shadow-teal-500/40 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Sending link...
                    </span>
                  ) : (
                    "Send Reset Link"
                  )}
                </button>
              </form>
            </>
          ) : step === "sent" ? (
            /* ── Success state ── */
            <div className="text-center py-2">
              <div className="flex justify-center mb-5">
                <div className="w-16 h-16 bg-teal-50 rounded-full flex items-center justify-center">
                  <svg className="w-8 h-8 text-teal-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Check your inbox</h2>
              <p className="text-gray-500 text-sm leading-relaxed mb-1">
                We've sent a password reset link to
              </p>
              <p className="font-semibold text-teal-600 text-sm mb-6">{email}</p>
              <p className="text-xs text-gray-400 leading-relaxed mb-8">
                The link expires in <strong className="text-gray-500">1 hour</strong>. If you don't see it, check your spam folder.
              </p>

              <button
                onClick={() => { setStep("form"); setError(""); }}
                className="text-sm text-teal-600 hover:text-teal-700 font-medium underline underline-offset-2"
              >
                Didn't receive it? Try again
              </button>
            </div>
          ) : null}

          <div className="mt-6 text-center">
            <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-teal-600 transition-colors font-medium">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
