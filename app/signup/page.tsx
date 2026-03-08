"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Logo from "@/components/Logo";

declare global {
  interface Window {
    Razorpay: any;
  }
}

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<"signup" | "verify" | "plan">("signup");
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    confirmPassword: "",
    name: "",
    phone: "",
    clinicName: "",
  });
  const [otp, setOtp] = useState("");
  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "yearly">("yearly");
  const [loading, setLoading] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Password strength
  const passwordStrength = (() => {
    const p = formData.password;
    if (p.length === 0) return 0;
    let s = 0;
    if (p.length >= 8) s++;
    if (p.length >= 12) s++;
    if (/[A-Z]/.test(p)) s++;
    if (/[0-9]/.test(p)) s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return s;
  })();
  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong", "Very strong"][passwordStrength];
  const strengthColor = ["", "bg-red-400", "bg-orange-400", "bg-yellow-400", "bg-teal-400", "bg-teal-500"][passwordStrength];
  const strengthTextColor = ["", "text-red-500", "text-orange-500", "text-yellow-600", "text-teal-600", "text-teal-600"][passwordStrength];

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      setLoading(false);
      return;
    }

    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          name: formData.name,
          tier: "tier2",
          phone: formData.phone || undefined,
          clinicName: formData.clinicName,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess("OTP sent to your email!");
        setStep("verify");
      } else {
        // Show first specific validation error if available
        const msg =
          data.errors?.[0]?.message || data.message || "Signup failed";
        setError(msg);
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/verify-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.email,
          otp: otp,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setSuccess("");
        setError("");
        setStep("plan");
      } else {
        setError(data.message || "OTP verification failed");
      }
    } catch (err) {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const loadRazorpay = (): Promise<void> =>
    new Promise((resolve, reject) => {
      if (window.Razorpay) { resolve(); return; }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load payment gateway"));
      document.head.appendChild(script);
    });

  const handlePayment = async () => {
    if (!formData.clinicName.trim()) {
      setError("Please enter your clinic name");
      return;
    }
    setPaymentLoading(true);
    setError("");

    try {
      // Ensure Razorpay script is loaded
      await loadRazorpay();

      // Create Razorpay order
      const orderRes = await fetch("/api/auth/create-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: selectedPlan,
          email: formData.email,
        }),
      });

      const orderData = await orderRes.json();

      if (!orderData.success) {
        setError(orderData.message || "Failed to create order");
        setPaymentLoading(false);
        return;
      }

      const { orderId, amount, currency, keyId } = orderData.data;

      // Open Razorpay checkout
      const options = {
        key: keyId,
        amount: amount,
        currency: currency,
        name: "DermaCloud",
        description: `DermaCloud Pro - ${selectedPlan === "monthly" ? "Monthly" : "Yearly"} Plan`,
        order_id: orderId,
        handler: async function (response: any) {
          // Verify payment and create user
          try {
            const verifyRes = await fetch("/api/auth/verify-payment", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
                plan: selectedPlan,
                userData: {
                  email: formData.email,
                  name: formData.name,
                  password: formData.password,
                  phone: formData.phone,
                  clinicName: formData.clinicName,
                },
              }),
            });

            const verifyData = await verifyRes.json();

            if (verifyData.success) {
              localStorage.setItem("token", verifyData.data.token);
              localStorage.setItem("user", JSON.stringify(verifyData.data.user));
              setSuccess("Payment successful! Redirecting to dashboard...");
              setTimeout(() => {
                router.push("/dashboard");
              }, 1500);
            } else {
              setError(verifyData.message || "Payment verification failed");
            }
          } catch (err) {
            setError("Payment verification failed. Please contact support.");
          }
          setPaymentLoading(false);
        },
        prefill: {
          name: formData.name,
          email: formData.email,
          contact: formData.phone,
        },
        theme: {
          color: "#0d9488",
        },
        modal: {
          ondismiss: function () {
            setPaymentLoading(false);
          },
        },
      };

      const rzp = new window.Razorpay(options);
      rzp.on("payment.failed", function (response: any) {
        setError("Payment failed. Please try again.");
        setPaymentLoading(false);
      });
      rzp.open();
    } catch (err) {
      setError("Failed to initiate payment. Please try again.");
      setPaymentLoading(false);
    }
  };

  const PasswordToggle = ({ show, onToggle }: { show: boolean; onToggle: () => void }) => (
    <button
      type="button"
      onClick={onToggle}
      className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-gray-400 hover:text-gray-600 transition-colors"
    >
      {show ? (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
        </svg>
      ) : (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      )}
    </button>
  );

  // Step indicator
  const StepIndicator = () => (
    <div className="flex items-center justify-center mb-6 gap-2">
      {[
        { key: "signup", label: "1" },
        { key: "verify", label: "2" },
        { key: "plan", label: "3" },
      ].map((s, i) => {
        const stepOrder = ["signup", "verify", "plan"];
        const currentIndex = stepOrder.indexOf(step);
        const stepIndex = stepOrder.indexOf(s.key);
        const isActive = stepIndex === currentIndex;
        const isCompleted = stepIndex < currentIndex;

        return (
          <div key={s.key} className="flex items-center gap-2">
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-all ${
                isCompleted
                  ? "bg-teal-500 text-white"
                  : isActive
                  ? "bg-gradient-to-r from-teal-500 to-cyan-600 text-white shadow-lg shadow-teal-500/30"
                  : "bg-gray-200 text-gray-500"
              }`}
            >
              {isCompleted ? (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                s.label
              )}
            </div>
            {i < 2 && (
              <div className={`w-8 h-0.5 ${stepIndex < currentIndex ? "bg-teal-500" : "bg-gray-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8 mt-6">
          <Link href="/" className="inline-flex items-center space-x-2.5 group">
            <Logo size="sm" />
          </Link>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl shadow-gray-200/50 border border-gray-100 border-l-4 border-l-teal-500 p-8">
          <StepIndicator />

          {step === "signup" ? (
            <>
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900">Create your account</h2>
                <p className="text-gray-500 mt-1">Start managing your practice with AI</p>
              </div>

              <form onSubmit={handleSignup} className="space-y-4">
                {/* Name & Phone Row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Full Name
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                      </div>
                      <input
                        type="text"
                        required
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all outline-none text-gray-900 bg-white text-sm"
                        placeholder="Dr. John Doe"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Phone
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                        <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                        </svg>
                      </div>
                      <input
                        type="tel"
                        required
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        className="w-full pl-10 pr-3 py-3 border border-gray-300 rounded-xl focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all outline-none text-gray-900 bg-white text-sm"
                        placeholder="9876543210"
                        pattern="[0-9]{10}"
                        title="Please enter a valid 10-digit phone number"
                      />
                    </div>
                  </div>
                </div>

                {/* Email */}
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
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all outline-none text-gray-900 bg-white"
                      placeholder="doctor@example.com"
                      autoComplete="email"
                    />
                  </div>
                </div>

                {/* Clinic Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Clinic Name
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                    </div>
                    <input
                      type="text"
                      required
                      value={formData.clinicName}
                      onChange={(e) => setFormData({ ...formData, clinicName: e.target.value })}
                      className="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-xl focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all outline-none text-gray-900 bg-white"
                      placeholder="Skin Care Clinic"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      </svg>
                    </div>
                    <input
                      type={showPassword ? "text" : "password"}
                      required
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full pl-11 pr-12 py-3 border border-gray-300 rounded-xl focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all outline-none text-gray-900 bg-white"
                      placeholder="Minimum 8 characters"
                      minLength={8}
                      autoComplete="new-password"
                    />
                    <PasswordToggle show={showPassword} onToggle={() => setShowPassword(!showPassword)} />
                  </div>
                  <div className="mt-2">
                    {formData.password.length > 0 && (
                      <>
                        <div className="flex gap-1 mb-1">
                          {[1, 2, 3, 4, 5].map((i) => (
                            <div key={i} className={`h-1 flex-1 rounded-full transition-all duration-300 ${i <= passwordStrength ? strengthColor : "bg-gray-100"}`} />
                          ))}
                        </div>
                        <p className={`text-xs font-medium ${strengthTextColor}`}>{strengthLabel}</p>
                      </>
                    )}
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                      {[
                        { label: "8+ chars", ok: formData.password.length >= 8 },
                        { label: "Uppercase", ok: /[A-Z]/.test(formData.password) },
                        { label: "Lowercase", ok: /[a-z]/.test(formData.password) },
                        { label: "Number", ok: /[0-9]/.test(formData.password) },
                        { label: "Special char", ok: /[^A-Za-z0-9]/.test(formData.password) },
                      ].map(({ label, ok }) => (
                        <span key={label} className={`text-xs flex items-center gap-0.5 ${ok ? "text-teal-600" : "text-gray-400"}`}>
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            {ok
                              ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />}
                          </svg>
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                      </svg>
                    </div>
                    <input
                      type={showConfirm ? "text" : "password"}
                      required
                      value={formData.confirmPassword}
                      onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                      className={`w-full pl-11 pr-12 py-3 border rounded-xl focus:ring-2 transition-all outline-none text-gray-900 bg-white ${
                        formData.confirmPassword.length > 0
                          ? formData.confirmPassword === formData.password
                            ? "border-teal-400 focus:border-teal-500 focus:ring-teal-500/20"
                            : "border-red-300 focus:border-red-400 focus:ring-red-400/20"
                          : "border-gray-300 focus:border-teal-500 focus:ring-teal-500/20"
                      }`}
                      placeholder="Re-enter password"
                      autoComplete="new-password"
                    />
                    <PasswordToggle show={showConfirm} onToggle={() => setShowConfirm(!showConfirm)} />
                  </div>
                  {formData.confirmPassword.length > 0 && (
                    formData.confirmPassword === formData.password ? (
                      <p className="mt-1.5 text-xs text-teal-600 flex items-center gap-1">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                        Passwords match
                      </p>
                    ) : (
                      <p className="mt-1.5 text-xs text-red-500">Passwords don&apos;t match</p>
                    )
                  )}
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
                    <span className="flex items-center justify-center">
                      <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Creating Account...
                    </span>
                  ) : (
                    "Create Account"
                  )}
                </button>

                {/* Login Link */}
                <div className="text-center">
                  <p className="text-sm text-gray-500">
                    Already have an account?{" "}
                    <Link href="/login" className="text-teal-600 hover:text-teal-700 font-semibold">
                      Sign in
                    </Link>
                  </p>
                </div>
              </form>
            </>
          ) : step === "verify" ? (
            <form onSubmit={handleVerifyOTP} className="space-y-5">
              <div className="text-center mb-2">
                <div className="w-16 h-16 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-500/20">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Verify Your Email</h2>
                <p className="text-gray-500 mt-2">
                  We sent a 6-digit code to<br />
                  <span className="font-semibold text-gray-900">{formData.email}</span>
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5 text-center">
                  Enter OTP
                </label>
                <input
                  type="text"
                  required
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="w-full px-4 py-4 border border-gray-300 rounded-xl focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 transition-all outline-none text-center text-2xl font-bold tracking-widest text-gray-900 bg-white"
                  placeholder="000000"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  autoFocus
                />
              </div>

              {error && (
                <div className="flex items-center justify-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {error}
                </div>
              )}
              {success && (
                <div className="flex items-center justify-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {success}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full py-3 bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold rounded-xl hover:from-teal-600 hover:to-cyan-700 transition-all shadow-lg shadow-teal-500/25 hover:shadow-teal-500/40 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {loading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Verifying...
                  </span>
                ) : (
                  "Verify & Continue"
                )}
              </button>

              <button
                type="button"
                onClick={() => { setStep("signup"); setError(""); setSuccess(""); }}
                className="w-full py-2 text-sm text-gray-500 hover:text-teal-600 font-medium transition-colors"
              >
                &larr; Back to Signup
              </button>
            </form>
          ) : (
            /* Plan Selection Step */
            <div className="space-y-5">
              <div className="text-center mb-2">
                <div className="w-16 h-16 bg-gradient-to-r from-teal-500 to-cyan-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-teal-500/20">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900">Choose Your Plan</h2>
                <p className="text-gray-500 mt-1">Select a billing cycle to get started</p>
              </div>

              {/* Plan Cards */}
              <div className="space-y-3">
                {/* Yearly Plan */}
                <button
                  type="button"
                  onClick={() => setSelectedPlan("yearly")}
                  className={`w-full p-4 rounded-xl border-2 text-left transition-all relative ${
                    selectedPlan === "yearly"
                      ? "border-teal-500 bg-teal-50/50 shadow-md shadow-teal-500/10"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  }`}
                >
                  {/* Best Value Badge */}
                  <div className="absolute -top-2.5 right-4">
                    <span className="px-2.5 py-0.5 text-xs font-bold bg-gradient-to-r from-teal-500 to-cyan-600 text-white rounded-full shadow-sm">
                      SAVE 17%
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          selectedPlan === "yearly" ? "border-teal-500" : "border-gray-300"
                        }`}>
                          {selectedPlan === "yearly" && (
                            <div className="w-2.5 h-2.5 rounded-full bg-teal-500" />
                          )}
                        </div>
                        <span className="font-bold text-gray-900 text-lg">Yearly</span>
                      </div>
                      <p className="text-gray-500 text-sm mt-1 ml-7">Billed annually</p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-gray-900">
                        <span className="text-base font-normal text-gray-500">&#8377;</span>25,000
                      </div>
                      <p className="text-xs text-gray-500">&#8377;2,083/month</p>
                    </div>
                  </div>
                </button>

                {/* Monthly Plan */}
                <button
                  type="button"
                  onClick={() => setSelectedPlan("monthly")}
                  className={`w-full p-4 rounded-xl border-2 text-left transition-all ${
                    selectedPlan === "monthly"
                      ? "border-teal-500 bg-teal-50/50 shadow-md shadow-teal-500/10"
                      : "border-gray-200 hover:border-gray-300 bg-white"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          selectedPlan === "monthly" ? "border-teal-500" : "border-gray-300"
                        }`}>
                          {selectedPlan === "monthly" && (
                            <div className="w-2.5 h-2.5 rounded-full bg-teal-500" />
                          )}
                        </div>
                        <span className="font-bold text-gray-900 text-lg">Monthly</span>
                      </div>
                      <p className="text-gray-500 text-sm mt-1 ml-7">Billed monthly</p>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-gray-900">
                        <span className="text-base font-normal text-gray-500">&#8377;</span>2,500
                      </div>
                      <p className="text-xs text-gray-500">/month</p>
                    </div>
                  </div>
                </button>
              </div>

              {/* Features */}
              <div className="bg-gray-50 rounded-xl p-4">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Everything included</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    "Unlimited patients",
                    "AI skin diagnosis",
                    "Appointment scheduling",
                    "Frontdesk management",
                    "Pharmacy & inventory",
                    "Custom templates",
                    "PDF prescriptions",
                    "Cloud backup",
                  ].map((feature) => (
                    <div key={feature} className="flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-xs text-gray-600">{feature}</span>
                    </div>
                  ))}
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
              {success && (
                <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl text-green-700 text-sm">
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {success}
                </div>
              )}

              <button
                type="button"
                onClick={handlePayment}
                disabled={paymentLoading}
                className="w-full py-3.5 bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold rounded-xl hover:from-teal-600 hover:to-cyan-700 transition-all shadow-lg shadow-teal-500/25 hover:shadow-teal-500/40 disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
              >
                {paymentLoading ? (
                  <span className="flex items-center justify-center">
                    <svg className="animate-spin h-5 w-5 mr-2" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Processing...
                  </span>
                ) : (
                  <>
                    Pay &#8377;{selectedPlan === "monthly" ? "2,500" : "25,000"} &rarr;
                  </>
                )}
              </button>

              <div className="flex items-center justify-center gap-4 text-xs text-gray-400">
                <div className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Secure payment
                </div>
                <div className="flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                  Powered by Razorpay
                </div>
              </div>

              <button
                type="button"
                onClick={() => { setStep("verify"); setError(""); setSuccess(""); }}
                className="w-full py-2 text-sm text-gray-500 hover:text-teal-600 font-medium transition-colors"
              >
                &larr; Back to Previous Step
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-gray-400 text-sm mt-6">
          By signing up, you agree to our{" "}
          <Link href="/terms" className="text-teal-500 hover:underline">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="text-teal-500 hover:underline">
            Privacy Policy
          </Link>
        </p>
      </div>
    </div>
  );
}
