import type { Metadata } from "next";
import { Poppins } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["800"],
  variable: "--font-poppins",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://dermacloud.in"),
  title: "DermaCloud - AI-Powered Dermatology Clinic Management",
  description: "Transform your dermatology practice with AI-powered skin diagnosis, comprehensive patient management, appointment scheduling, and pharmacy integration. Cloud-based HMS for modern dermatologists in India.",
  keywords: ["dermatology software", "AI skin diagnosis", "clinic management", "dermatology HMS", "patient management", "dermoscopy AI", "skin disease diagnosis", "dermatology practice management", "India"],
  authors: [{ name: "DermaCloud" }],
  creator: "DermaCloud",
  publisher: "DermaCloud",
  robots: "index, follow",
  openGraph: {
    type: "website",
    locale: "en_IN",
    url: "https://dermacloud.in",
    siteName: "DermaCloud",
    title: "DermaCloud - AI-Powered Dermatology Clinic Management",
    description: "Transform your dermatology practice with AI-powered diagnosis, patient management, and clinic workflows. Cloud-based HMS for modern dermatologists.",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "DermaCloud - AI-Powered Dermatology Clinic Management",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "DermaCloud - AI-Powered Dermatology Clinic Management",
    description: "Transform your dermatology practice with AI-powered diagnosis, patient management, and clinic workflows.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={poppins.variable}>
      <body className="antialiased">
        {/* Load Razorpay globally so it's ready before the user reaches the payment step */}
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
        {children}
      </body>
    </html>
  );
}
