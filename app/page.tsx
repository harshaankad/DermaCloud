"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Logo from "@/components/Logo";

export default function Home() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isAnnual, setIsAnnual] = useState(true); // Default to annual
  const [contactForm, setContactForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [formStatus, setFormStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // Close mobile menu on route change or resize
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Scroll reveal with Intersection Observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("revealed");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
    );
    const elements = document.querySelectorAll(".reveal-on-scroll");
    elements.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Scroll to section smoothly
  const scrollToSection = (id: string) => {
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormStatus("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(contactForm),
      });
      if (!res.ok) throw new Error("Failed to send");
      setFormStatus("sent");
      setContactForm({ name: "", email: "", phone: "", message: "" });
      setTimeout(() => setFormStatus("idle"), 3000);
    } catch {
      setFormStatus("error");
      setTimeout(() => setFormStatus("idle"), 3000);
    }
  };

  const faqs = [
    {
      q: "How accurate is the AI diagnosis?",
      a: "Our AI model is trained on thousands of dermoscopic images and provides suggestions to assist your diagnosis. It's designed to be a helpful tool, not a replacement for clinical judgment. The AI highlights possible conditions with confidence scores to help you make informed decisions."
    },
    {
      q: "Can I access DermaCloud from my phone?",
      a: "Yes! DermaCloud is fully responsive and works on any device - desktop, tablet, or mobile. Access your clinic data from anywhere with an internet connection."
    },
    {
      q: "How do I get started?",
      a: "Simply sign up with your email, set up your clinic profile, and you're ready to go. Our team will help you with onboarding and answer any questions you have."
    },
    {
      q: "Do you provide training and support?",
      a: "Yes! We provide onboarding support to help you get started. Our team is available via email and chat to answer any questions. We also have video tutorials to guide you through every feature."
    },
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Fixed Navigation */}
      <nav className="fixed top-0 w-full bg-white/95 backdrop-blur-md border-b border-gray-200 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <div className="flex items-center space-x-2">
              <Logo size="lg" />
            </div>

            {/* Desktop Navigation */}
            <div className="hidden md:flex items-center space-x-8">
              <button onClick={() => scrollToSection("features")} className="text-gray-700 hover:text-teal-600 transition-colors outline-none focus:outline-none focus:ring-0">
                Features
              </button>
              <button onClick={() => scrollToSection("what-makes-us-different")} className="text-gray-700 hover:text-teal-600 transition-colors outline-none focus:outline-none focus:ring-0">
                Why DermaCloud
              </button>
              <button onClick={() => scrollToSection("pricing")} className="text-gray-700 hover:text-teal-600 transition-colors outline-none focus:outline-none focus:ring-0">
                Pricing
              </button>
              <button onClick={() => scrollToSection("contact")} className="text-gray-700 hover:text-teal-600 transition-colors outline-none focus:outline-none focus:ring-0">
                Contact
              </button>
              <Link href="/login" className="text-teal-600 hover:text-teal-700 font-medium transition-colors">
                Login
              </Link>
              <Link href="/signup" className="px-5 py-2 bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold rounded-lg hover:from-teal-600 hover:to-cyan-700 transition-all shadow-md hover:shadow-lg">
                Get Started
              </Link>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors outline-none focus:outline-none focus:ring-0"
              aria-label="Toggle menu"
            >
              {mobileMenuOpen ? (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden bg-white border-t border-gray-200 shadow-lg">
            <div className="px-4 py-4 space-y-3">
              <button onClick={() => scrollToSection("features")} className="block w-full text-left px-4 py-3 text-gray-700 hover:bg-teal-50 hover:text-teal-600 rounded-lg transition-colors outline-none focus:outline-none focus:ring-0">
                Features
              </button>
              <button onClick={() => scrollToSection("what-makes-us-different")} className="block w-full text-left px-4 py-3 text-gray-700 hover:bg-teal-50 hover:text-teal-600 rounded-lg transition-colors outline-none focus:outline-none focus:ring-0">
                Why DermaCloud
              </button>
              <button onClick={() => scrollToSection("pricing")} className="block w-full text-left px-4 py-3 text-gray-700 hover:bg-teal-50 hover:text-teal-600 rounded-lg transition-colors outline-none focus:outline-none focus:ring-0">
                Pricing
              </button>
              <button onClick={() => scrollToSection("contact")} className="block w-full text-left px-4 py-3 text-gray-700 hover:bg-teal-50 hover:text-teal-600 rounded-lg transition-colors outline-none focus:outline-none focus:ring-0">
                Contact
              </button>
              <hr className="my-2" />
              <Link href="/login" className="block px-4 py-3 text-teal-600 font-medium hover:bg-teal-50 rounded-lg transition-colors">
                Login
              </Link>
              <Link href="/signup" className="block px-4 py-3 text-center bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold rounded-lg hover:from-teal-600 hover:to-cyan-700 transition-all">
                Get Started
              </Link>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section */}
      <section
        className="relative overflow-hidden bg-white"
        style={{ height: 'calc(100vh - 64px)', marginTop: '64px' }}
      >

        <div className="max-w-7xl mx-auto px-6 lg:px-8 h-full flex flex-col lg:flex-row gap-8 lg:gap-12 -mt-8">

          {/* Left: text */}
          <div className="lg:w-[42%] flex flex-col justify-center space-y-7">
            <div className="animate-fade-in animation-delay-100">
              <span className="inline-flex items-center px-4 py-1.5 rounded-full bg-teal-600/10 text-teal-700 text-sm font-semibold border border-teal-200">
                <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                AI-Powered Dermatology Platform
              </span>
            </div>

            <h1 className="animate-fade-in-up animation-delay-200 text-5xl sm:text-6xl font-extrabold text-gray-900 leading-[1.12] tracking-tight">
              Transform Your
              <span className="block text-transparent bg-clip-text bg-gradient-to-r from-teal-600 to-cyan-500 pb-1">
                Dermatology Practice
              </span>
            </h1>

            <p className="animate-fade-in-up animation-delay-400 text-xl text-gray-500 max-w-md leading-relaxed">
              AI-powered diagnosis, comprehensive patient management, and seamless clinic workflows — all in one intelligent cloud platform.
            </p>

            <div className="animate-fade-in-up animation-delay-500 flex flex-row gap-4 pt-1">
              <button
                onClick={() => scrollToSection("what-makes-us-different")}
                className="inline-flex items-center justify-center px-7 py-3.5 text-base font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-md hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200"
              >
                Learn More
              </button>
              <button
                onClick={() => { setContactForm(prev => ({ ...prev, message: "Hi, I would like to request a demo of DermaCloud for my clinic." })); scrollToSection("contact"); }}
                className="inline-flex items-center justify-center px-7 py-3.5 text-base font-semibold text-teal-700 bg-white border-2 border-teal-200 hover:border-teal-400 hover:bg-teal-50 rounded-xl shadow-sm hover:-translate-y-0.5 transition-all duration-200"
              >
                Request a Demo
              </button>
            </div>
          </div>

          {/* Right: browser mockup */}
          <div className="flex-1 hidden lg:flex items-center mt-14 animate-hero-slide-right animation-delay-300">
            <div className="w-full rounded-2xl overflow-hidden shadow-2xl shadow-teal-900/20 border border-gray-200 bg-white">
              <div className="bg-gray-100 px-4 py-3 flex items-center gap-2 border-b border-gray-200">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <div className="flex-1 mx-4">
                  <div className="bg-white rounded-md px-3 py-1 text-xs text-gray-400 text-center border border-gray-200">
                    dermacloud.in
                  </div>
                </div>
              </div>
              <img src="/images/image.png" alt="DermaCloud Dashboard" className="w-full block" />
            </div>
          </div>

        </div>
      </section>

      {/* What Makes Us Different Section */}
      <section id="what-makes-us-different" className="py-24 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 scroll-mt-20 overflow-hidden">
        <div className="max-w-7xl mx-auto relative">
          {/* Background decorations */}
          <div className="absolute top-0 left-1/4 w-96 h-96 bg-teal-500/10 rounded-full blur-3xl"></div>
          <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl"></div>

          <div className="text-center mb-16 relative reveal-on-scroll">
            <span className="inline-block px-4 py-1.5 bg-teal-500/20 text-teal-400 text-sm font-semibold rounded-full mb-4">
              NOT JUST ANOTHER HMS
            </span>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-4">
              What Makes Us Different
            </h2>
            <p className="text-lg sm:text-xl text-gray-400 max-w-3xl mx-auto">
              Unlike generic hospital management systems, DermaCloud is <span className="text-teal-400 font-bold whitespace-nowrap">purpose-built for Dermatology</span> with AI at its core
            </p>
          </div>

          {/* Bento Grid Layout */}
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4 md:gap-5 relative">

            {/* Hero Card - AI Skin Diagnosis (spans 4 cols, large) */}
            <div className="md:col-span-4 reveal-on-scroll group">
              <div className="relative h-full rounded-3xl p-8 md:p-10 bg-gradient-to-br from-teal-600 via-teal-700 to-cyan-800 overflow-hidden transition-all duration-500 hover:shadow-2xl hover:shadow-teal-500/20 hover:scale-[1.01]">
                <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/3"></div>
                <div className="absolute bottom-0 left-0 w-48 h-48 bg-white/5 rounded-full translate-y-1/3 -translate-x-1/3"></div>
                <div className="relative z-10">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="w-12 h-12 bg-white/20 backdrop-blur-sm rounded-xl flex items-center justify-center">
                      <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                      </svg>
                    </div>
                    <span className="px-3 py-1 text-xs font-bold bg-white/20 backdrop-blur-sm text-white rounded-full tracking-wider">FLAGSHIP AI</span>
                  </div>
                  <h3 className="text-2xl md:text-3xl font-bold text-white mb-3">AI Skin Diagnosis</h3>
                  <p className="text-teal-100 text-lg leading-relaxed max-w-xl">
                    Upload clinical or dermoscopy images and get instant AI-powered diagnostic suggestions with confidence scores. No generic HMS offers this.
                  </p>
                  <div className="flex flex-wrap gap-3 mt-6">
                    <span className="px-3 py-1.5 bg-white/10 backdrop-blur-sm rounded-lg text-sm text-white/90">Clinical Images</span>
                    <span className="px-3 py-1.5 bg-white/10 backdrop-blur-sm rounded-lg text-sm text-white/90">Dermoscopy</span>
                    <span className="px-3 py-1.5 bg-white/10 backdrop-blur-sm rounded-lg text-sm text-white/90">Confidence Scores</span>
                    <span className="px-3 py-1.5 bg-white/10 backdrop-blur-sm rounded-lg text-sm text-white/90">Instant Results</span>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Patient Summary (spans 2 cols, tall) */}
            <div className="md:col-span-2 reveal-on-scroll reveal-delay-1 group">
              <div className="relative h-full rounded-3xl p-7 bg-gradient-to-b from-slate-800 to-slate-800/80 border border-slate-700/50 overflow-hidden transition-all duration-500 hover:border-teal-500/40 hover:shadow-xl hover:shadow-teal-500/10 hover:scale-[1.02]">
                <div className="absolute inset-0 bg-gradient-to-b from-teal-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="relative z-10">
                  <div className="w-11 h-11 bg-gradient-to-br from-teal-400 to-cyan-500 rounded-xl flex items-center justify-center mb-5 shadow-lg shadow-teal-500/20 group-hover:scale-110 transition-transform">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <span className="inline-block px-2 py-0.5 text-[10px] font-bold bg-teal-500/20 text-teal-400 rounded-full mb-3 tracking-wider">AI POWERED</span>
                  <h3 className="text-lg font-bold text-white mb-2">AI Patient Summary</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    Instant AI-generated summaries of a patient&apos;s entire visit history, conditions, treatments, and progress - all in one glance.
                  </p>
                </div>
              </div>
            </div>

            {/* AI Report for Patients (spans 2 cols) */}
            <div className="md:col-span-2 reveal-on-scroll group">
              <div className="relative h-full rounded-3xl p-7 bg-gradient-to-br from-cyan-900/60 to-slate-800 border border-cyan-700/30 overflow-hidden transition-all duration-500 hover:border-cyan-500/50 hover:shadow-xl hover:shadow-cyan-500/10 hover:scale-[1.02]">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="relative z-10">
                  <div className="w-11 h-11 bg-gradient-to-br from-cyan-400 to-teal-500 rounded-xl flex items-center justify-center mb-5 shadow-lg shadow-cyan-500/20 group-hover:scale-110 transition-transform">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                  <span className="inline-block px-2 py-0.5 text-[10px] font-bold bg-cyan-500/20 text-cyan-400 rounded-full mb-3 tracking-wider">AI POWERED</span>
                  <h3 className="text-lg font-bold text-white mb-2">AI Report for Patients</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    Generate easy-to-understand AI summaries of medical reports, helping patients understand their condition clearly.
                  </p>
                </div>
              </div>
            </div>

            {/* Language Translation (spans 2 cols) */}
            <div className="md:col-span-2 reveal-on-scroll reveal-delay-1 group">
              <div className="relative h-full rounded-3xl p-7 bg-gradient-to-br from-slate-800 to-slate-800/80 border border-slate-700/50 overflow-hidden transition-all duration-500 hover:border-cyan-500/40 hover:shadow-xl hover:shadow-cyan-500/10 hover:scale-[1.02]">
                <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="relative z-10">
                  <div className="w-11 h-11 bg-gradient-to-br from-violet-400 to-cyan-500 rounded-xl flex items-center justify-center mb-5 shadow-lg shadow-violet-500/20 group-hover:scale-110 transition-transform">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                    </svg>
                  </div>
                  <span className="inline-block px-2 py-0.5 text-[10px] font-bold bg-violet-500/20 text-violet-400 rounded-full mb-3 tracking-wider">AI POWERED</span>
                  <h3 className="text-lg font-bold text-white mb-2">Language Translation</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    Translate reports into regional languages instantly. Break the language barrier between doctor and patient.
                  </p>
                </div>
              </div>
            </div>

            {/* Before vs After (spans 2 cols) */}
            <div className="md:col-span-2 reveal-on-scroll reveal-delay-2 group">
              <div className="relative h-full rounded-3xl p-7 bg-gradient-to-br from-slate-800 to-slate-800/80 border border-slate-700/50 overflow-hidden transition-all duration-500 hover:border-teal-500/40 hover:shadow-xl hover:shadow-teal-500/10 hover:scale-[1.02]">
                <div className="absolute inset-0 bg-gradient-to-br from-teal-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
                <div className="relative z-10">
                  <div className="w-11 h-11 bg-gradient-to-br from-amber-400 to-teal-500 rounded-xl flex items-center justify-center mb-5 shadow-lg shadow-amber-500/20 group-hover:scale-110 transition-transform">
                    <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">Before vs After Analysis</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">
                    Track treatment progress with side-by-side image comparison. Visually document patient improvement over time.
                  </p>
                </div>
              </div>
            </div>

            {/* Built for Dermatology - Wide bottom card (spans full) */}
            <div className="md:col-span-6 reveal-on-scroll group">
              <div className="relative rounded-3xl p-8 md:p-10 bg-gradient-to-r from-slate-800 via-slate-800 to-slate-800 border border-slate-700/50 overflow-hidden transition-all duration-500 hover:border-teal-500/30 hover:shadow-xl hover:shadow-teal-500/10">
                <div className="absolute inset-0 bg-gradient-to-r from-teal-600/5 via-transparent to-cyan-600/5"></div>
                <div className="relative z-10 flex flex-col md:flex-row md:items-center gap-6">
                  <div className="flex-shrink-0">
                    <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-cyan-600 rounded-2xl flex items-center justify-center shadow-lg shadow-teal-500/30 group-hover:scale-110 transition-transform">
                      <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                      </svg>
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl md:text-2xl font-bold text-white mb-2">Built Exclusively for Dermatology</h3>
                    <p className="text-gray-400 leading-relaxed max-w-2xl">
                      Purpose-built templates, workflows, and consultation forms designed specifically for dermatology and cosmetology practices - not a one-size-fits-all HMS.
                    </p>
                  </div>
                  <div className="flex flex-wrap md:flex-col gap-2 flex-shrink-0">
                    <span className="px-3 py-1.5 bg-teal-500/10 border border-teal-500/20 rounded-lg text-sm text-teal-400">Dermatology Templates</span>
                    <span className="px-3 py-1.5 bg-cyan-500/10 border border-cyan-500/20 rounded-lg text-sm text-cyan-400">Cosmetology Forms</span>
                    <span className="px-3 py-1.5 bg-teal-500/10 border border-teal-500/20 rounded-lg text-sm text-teal-400">Custom Workflows</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 px-4 sm:px-6 lg:px-8 bg-white scroll-mt-20">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16 reveal-on-scroll">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Everything You Need
            </h2>
            <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto">
              Comprehensive features designed for modern dermatology practices
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {/* Feature 1 - Dashboard & Analytics */}
            <div className="group relative p-8 rounded-2xl bg-white shadow-lg border border-gray-100 hover:shadow-xl hover:border-teal-200 transition-all duration-300 hover:-translate-y-1 reveal-on-scroll">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 text-white flex items-center justify-center mb-6 shadow-md group-hover:scale-110 transition-transform">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-teal-600 transition-colors">Dashboard & Analytics</h3>
              <p className="text-gray-600 leading-relaxed">
                Real-time dashboard with patient stats, revenue tracking, appointment overview, and clinic performance insights.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="group relative p-8 rounded-2xl bg-white shadow-lg border border-gray-100 hover:shadow-xl hover:border-teal-200 transition-all duration-300 hover:-translate-y-1 reveal-on-scroll reveal-delay-1">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-600 text-white flex items-center justify-center mb-6 shadow-md group-hover:scale-110 transition-transform">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-teal-600 transition-colors">Patient Management</h3>
              <p className="text-gray-600 leading-relaxed">
                Comprehensive patient records, visit history, prescriptions, and treatment tracking in one place.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="group relative p-8 rounded-2xl bg-white shadow-lg border border-gray-100 hover:shadow-xl hover:border-teal-200 transition-all duration-300 hover:-translate-y-1 reveal-on-scroll reveal-delay-2">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 text-white flex items-center justify-center mb-6 shadow-md group-hover:scale-110 transition-transform">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-teal-600 transition-colors">Smart Reports</h3>
              <p className="text-gray-600 leading-relaxed">
                Auto-generate professional PDF reports with your clinic branding and digital signature.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="group relative p-8 rounded-2xl bg-white shadow-lg border border-gray-100 hover:shadow-xl hover:border-teal-200 transition-all duration-300 hover:-translate-y-1 reveal-on-scroll">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-600 text-white flex items-center justify-center mb-6 shadow-md group-hover:scale-110 transition-transform">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-teal-600 transition-colors">Appointment Booking</h3>
              <p className="text-gray-600 leading-relaxed">
                Easy scheduling with frontdesk management, reminders, and calendar integration.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="group relative p-8 rounded-2xl bg-white shadow-lg border border-gray-100 hover:shadow-xl hover:border-teal-200 transition-all duration-300 hover:-translate-y-1 reveal-on-scroll reveal-delay-1">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 text-white flex items-center justify-center mb-6 shadow-md group-hover:scale-110 transition-transform">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-teal-600 transition-colors">Pharmacy & Inventory</h3>
              <p className="text-gray-600 leading-relaxed">
                Track medicines, manage stock, and handle sales with integrated pharmacy module.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="group relative p-8 rounded-2xl bg-white shadow-lg border border-gray-100 hover:shadow-xl hover:border-teal-200 transition-all duration-300 hover:-translate-y-1 reveal-on-scroll reveal-delay-2">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-600 text-white flex items-center justify-center mb-6 shadow-md group-hover:scale-110 transition-transform">
                <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-teal-600 transition-colors">Secure & Cloud-Based</h3>
              <p className="text-gray-600 leading-relaxed">
                Your data is encrypted and stored securely in the cloud. Access from anywhere, anytime.
              </p>
            </div>
          </div>
        </div>
      </section>


      {/* Pricing Section */}
      <section id="pricing" className="py-20 px-4 sm:px-6 lg:px-8 bg-gradient-to-br from-teal-50 via-white to-cyan-50 scroll-mt-20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12 reveal-on-scroll">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Simple, Transparent Pricing
            </h2>
            <p className="text-lg sm:text-xl text-gray-600 max-w-2xl mx-auto mb-8">
              One plan with everything you need. No hidden fees.
            </p>

            {/* Pricing Toggle */}
            <div className="inline-flex items-center bg-white rounded-full p-1 shadow-md border border-gray-200">
              <button
                onClick={() => setIsAnnual(false)}
                className={`px-6 py-2 rounded-full text-sm font-semibold transition-all ${
                  !isAnnual ? "bg-gradient-to-r from-teal-500 to-cyan-600 text-white shadow-md" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Monthly
              </button>
              <button
                onClick={() => setIsAnnual(true)}
                className={`px-6 py-2 rounded-full text-sm font-semibold transition-all ${
                  isAnnual ? "bg-gradient-to-r from-teal-500 to-cyan-600 text-white shadow-md" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                Annual
                <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Save ₹5,000</span>
              </button>
            </div>
          </div>

          {/* Pricing Card */}
          <div className="max-w-lg mx-auto reveal-on-scroll reveal-delay-1">
            <div className="relative p-8 sm:p-10 rounded-3xl bg-white shadow-2xl border border-gray-100">
              <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                <span className="inline-flex items-center px-6 py-2 rounded-full bg-gradient-to-r from-teal-500 to-cyan-600 text-white text-sm font-bold shadow-lg">
                  COMPLETE PACKAGE
                </span>
              </div>

              <div className="text-center mb-8 pt-4">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">DermaCloud Pro</h3>
                <p className="text-gray-600 mb-6">Everything you need to run your clinic</p>
                <div className="flex items-baseline justify-center">
                  <span className="text-5xl sm:text-6xl font-bold text-gray-900">
                    ₹{isAnnual ? "25,000" : "2,500"}
                  </span>
                  <span className="text-gray-600 ml-2">/{isAnnual ? "year" : "month"}</span>
                </div>
                {isAnnual && (
                  <p className="text-sm text-green-600 mt-2 font-medium">
                    That&apos;s just ₹2,083/month - Save ₹5,000!
                  </p>
                )}
              </div>

              <ul className="space-y-4 mb-8">
                {[
                  "Unlimited patients",
                  "AI-powered skin diagnosis",
                  "Appointment scheduling",
                  "Frontdesk management",
                  "Pharmacy & inventory",
                  "Custom report templates",
                  "PDF & prescription generation",
                  "Multi-user access",
                  "Cloud backup & security",
                  "Email & chat support",
                ].map((feature, index) => (
                  <li key={index} className="flex items-start">
                    <svg className="w-6 h-6 text-teal-500 mr-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span className="text-gray-700">{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href="/signup"
                className="block w-full text-center py-4 px-6 rounded-xl bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold text-lg hover:from-teal-600 hover:to-cyan-700 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
              >
                Get Started
              </Link>
              <p className="text-center text-sm text-gray-500 mt-4">
                Cancel anytime
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section - Collapsible */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-16 reveal-on-scroll">
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 mb-4">
              Frequently Asked Questions
            </h2>
            <p className="text-lg sm:text-xl text-gray-600">
              Got questions? We&apos;ve got answers.
            </p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, index) => (
              <div
                key={index}
                className="rounded-2xl border border-gray-200 overflow-hidden transition-all duration-300 hover:border-teal-200 reveal-on-scroll"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === index ? null : index)}
                  className="w-full flex items-center justify-between p-6 text-left bg-white hover:bg-gray-50 transition-colors"
                >
                  <h3 className="text-lg font-semibold text-gray-900 pr-4">{faq.q}</h3>
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full bg-teal-100 flex items-center justify-center transition-transform duration-300 ${openFaq === index ? "rotate-180" : ""}`}>
                    <svg className="w-5 h-5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ${
                    openFaq === index ? "max-h-96 opacity-100" : "max-h-0 opacity-0"
                  }`}
                >
                  <p className="px-6 pb-6 text-gray-600 leading-relaxed">{faq.a}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer with Contact Form */}
      <footer id="contact" className="bg-slate-900 text-gray-300 scroll-mt-20">
        {/* Contact Form Section */}
        <div className="border-b border-slate-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
            <div className="grid lg:grid-cols-2 gap-12">
              {/* Contact Info */}
              <div>
                <h3 className="text-2xl sm:text-3xl font-bold text-white mb-6">Get in Touch</h3>
                <p className="text-gray-400 mb-8 text-lg">
                  Have questions about DermaCloud? Want a personalized demo? We&apos;d love to hear from you.
                </p>

                <div className="space-y-6">
                  <div className="flex items-start">
                    <div className="w-12 h-12 bg-teal-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                      <svg className="w-6 h-6 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <p className="text-white font-medium">Email</p>
                      <a href="mailto:harshaankad2003@gmail.com" className="text-teal-400 hover:text-teal-300 transition-colors">
                        harshaankad2003@gmail.com
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start">
                    <div className="w-12 h-12 bg-teal-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                      <svg className="w-6 h-6 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <p className="text-white font-medium">Phone</p>
                      <a href="tel:+917338110229" className="text-teal-400 hover:text-teal-300 transition-colors">
                        +91 73381 10229
                      </a>
                    </div>
                  </div>

                  <div className="flex items-start">
                    <div className="w-12 h-12 bg-teal-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                      <svg className="w-6 h-6 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                    </div>
                    <div className="ml-4">
                      <p className="text-white font-medium">Address</p>
                      <p className="text-gray-400">
                        Bangalore, Karnataka, India
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Contact Form */}
              <div className="bg-slate-800 rounded-2xl p-6 sm:p-8">
                <h4 className="text-xl font-semibold text-white mb-6">Send us a message</h4>
                <form onSubmit={handleContactSubmit} className="space-y-4">
                  <div>
                    <input
                      type="text"
                      placeholder="Your Name"
                      required
                      value={contactForm.name}
                      onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <input
                      type="email"
                      placeholder="Email Address"
                      required
                      value={contactForm.email}
                      onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <input
                      type="tel"
                      placeholder="Phone Number"
                      value={contactForm.phone}
                      onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <textarea
                      placeholder="Your Message"
                      required
                      rows={4}
                      value={contactForm.message}
                      onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                      className="w-full px-4 py-3 bg-slate-700 border border-slate-600 rounded-lg text-white placeholder-gray-400 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all resize-none"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={formStatus === "sending"}
                    className="w-full py-4 bg-gradient-to-r from-teal-500 to-cyan-600 text-white font-semibold rounded-lg hover:from-teal-600 hover:to-cyan-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50"
                  >
                    {formStatus === "sending" ? "Sending..." : formStatus === "sent" ? "Message Sent!" : formStatus === "error" ? "Failed to Send" : "Send Message"}
                  </button>
                  {formStatus === "sent" && (
                    <p className="text-green-400 text-sm text-center">Thank you! We&apos;ll get back to you soon.</p>
                  )}
                  {formStatus === "error" && (
                    <p className="text-red-400 text-sm text-center">Something went wrong. Please try again or email us directly.</p>
                  )}
                </form>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-6 mb-8">
            <div className="flex items-center gap-4">
              <Logo white size="md" />
              <span className="text-white font-bold text-xl tracking-tight" style={{ fontFamily: "var(--font-poppins), Poppins, sans-serif" }}>DermaCloud</span>
            </div>
            <div className="flex gap-6 text-sm">
              <button onClick={() => scrollToSection("features")} className="text-gray-400 hover:text-teal-400 transition-colors">Features</button>
              <button onClick={() => scrollToSection("pricing")} className="text-gray-400 hover:text-teal-400 transition-colors">Pricing</button>
              <button onClick={() => scrollToSection("what-makes-us-different")} className="text-gray-400 hover:text-teal-400 transition-colors">Why DermaCloud</button>
              <button onClick={() => scrollToSection("contact")} className="text-gray-400 hover:text-teal-400 transition-colors">Contact</button>
            </div>
          </div>

          <div className="border-t border-slate-800 pt-8 text-center text-gray-400 text-sm">
            <p>© {new Date().getFullYear()} DermaCloud. All rights reserved.</p>
          </div>
        </div>
      </footer>

      {/* Custom CSS for animations */}
      <style jsx global>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.6s ease-out forwards;
        }
        .animate-fade-in-up {
          animation: fade-in-up 0.6s ease-out forwards;
        }
        .delay-100 {
          animation-delay: 0.1s;
          opacity: 0;
        }
        .delay-200 {
          animation-delay: 0.2s;
          opacity: 0;
        }
        .delay-300 {
          animation-delay: 0.3s;
          opacity: 0;
        }
        html {
          scroll-behavior: smooth;
        }
        .reveal-on-scroll {
          opacity: 0;
          transform: translateY(32px);
          transition: opacity 0.7s ease-out, transform 0.7s ease-out;
        }
        .reveal-on-scroll.revealed {
          opacity: 1;
          transform: translateY(0);
        }
        .reveal-on-scroll.reveal-delay-1 { transition-delay: 0.1s; }
        .reveal-on-scroll.reveal-delay-2 { transition-delay: 0.2s; }
        .reveal-on-scroll.reveal-delay-3 { transition-delay: 0.3s; }
        .reveal-on-scroll.reveal-delay-4 { transition-delay: 0.4s; }
        .reveal-on-scroll.reveal-delay-5 { transition-delay: 0.5s; }
      `}</style>
    </div>
  );
}
