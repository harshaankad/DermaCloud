"use client";

import { useEffect, useRef, useState } from "react";

export interface PickedPatient {
  _id: string;
  patientId: string;
  name: string;
  phone: string;
  age?: number;
  gender?: "male" | "female" | "other";
}

interface Props {
  value: PickedPatient | null;
  onChange: (patient: PickedPatient | null) => void;
  tokenKey: "token" | "frontdeskToken";
  required?: boolean;
  disabled?: boolean;
}

export default function PatientPicker({ value, onChange, tokenKey, required, disabled }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PickedPatient[]>([]);
  const [searching, setSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const patientsHref = tokenKey === "frontdeskToken" ? "/frontdesk/patients" : "/clinic/patients";

  useEffect(() => {
    if (!query.trim() || query.trim().length < 2 || value) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      const token = localStorage.getItem(tokenKey);
      if (!token) return;
      setSearching(true);
      try {
        const res = await fetch(`/api/tier2/patients/list?search=${encodeURIComponent(query.trim())}&limit=10`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success) setResults(data.data?.patients || []);
        else setResults([]);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(handle);
  }, [query, value, tokenKey]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowResults(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const handleSelect = (p: PickedPatient) => {
    onChange(p);
    setQuery("");
    setResults([]);
    setShowResults(false);
  };

  const handleClear = () => {
    onChange(null);
    setQuery("");
  };

  if (value) {
    return (
      <div className="rounded-xl border border-teal-200 bg-teal-50/60 px-3 py-2.5 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
          {value.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-gray-900 text-sm truncate">{value.name}</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-teal-600 text-white rounded">ID: {value.patientId}</span>
          </div>
          <p className="text-xs text-gray-600 mt-0.5">{value.phone}{value.age ? ` • ${value.age}y` : ""}{value.gender ? ` • ${value.gender}` : ""}</p>
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={handleClear}
            className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-white rounded-lg transition-colors shrink-0"
            title="Change patient"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <svg className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          value={query}
          disabled={disabled}
          onChange={(e) => { setQuery(e.target.value); setShowResults(true); }}
          onFocus={() => setShowResults(true)}
          placeholder="Search patient by phone or name..."
          required={required}
          className="w-full border border-gray-200 bg-gray-50 rounded-lg pl-9 pr-3 py-2 text-sm focus:ring-2 focus:ring-teal-500/20 focus:border-teal-400 focus:bg-white outline-none disabled:bg-gray-100 disabled:cursor-not-allowed"
        />
        {searching && (
          <div className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
        )}
      </div>

      {showResults && query.trim().length >= 2 && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-72 overflow-y-auto">
          {results.length > 0 ? (
            <>
              {results.map((p) => (
                <button
                  key={p._id}
                  type="button"
                  onClick={() => handleSelect(p)}
                  className="w-full text-left px-3 py-2.5 hover:bg-teal-50 border-b border-gray-100 last:border-b-0 flex items-center gap-3 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-teal-500 to-cyan-600 flex items-center justify-center text-white font-bold text-xs shrink-0">
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-sm text-gray-900 truncate">{p.name}</span>
                      <span className="text-[10px] text-gray-500 font-mono shrink-0">{p.patientId}</span>
                    </div>
                    <p className="text-xs text-gray-500">{p.phone}{p.age ? ` • ${p.age}y` : ""}</p>
                  </div>
                </button>
              ))}
            </>
          ) : !searching ? (
            <div className="p-4 text-center">
              <p className="text-sm text-gray-500 mb-3">No patient found for &ldquo;{query.trim()}&rdquo;</p>
              <a
                href={patientsHref}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 text-white rounded-lg text-xs font-semibold hover:bg-teal-700 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                </svg>
                Add patient in Patients page
              </a>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
