"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function GoogleCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get("token");
    const user = searchParams.get("user");
    const role = searchParams.get("role");

    if (token && user) {
      if (role === "frontdesk") {
        localStorage.setItem("frontdeskToken", token);
        localStorage.setItem("frontdeskStaff", user);
        router.replace("/frontdesk/dashboard");
      } else {
        localStorage.setItem("token", token);
        localStorage.setItem("user", user);
        router.replace("/dashboard");
      }
    } else {
      // No token, redirect back to login
      router.replace(role === "frontdesk" ? "/frontdesk/login" : "/login");
    }
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-gray-600 font-medium">Signing you in...</p>
      </div>
    </div>
  );
}
