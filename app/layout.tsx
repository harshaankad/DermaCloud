import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DermaHMS - Dermatology Hospital Management System",
  description: "AI-powered dermatology diagnosis and clinic workflow management",
  keywords: ["dermatology", "AI diagnosis", "clinic management", "dermoscopy"],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
