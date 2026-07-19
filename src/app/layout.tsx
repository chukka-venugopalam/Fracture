import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";

import { Cormorant_Garamond } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  weight: ["300", "400", "500", "600", "700"],
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  variable: "--font-serif",
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "Fracture — Cinematic Orbit Navigation",
  description: "A gorgeous 3D intro that shatters into an orbiting portal navigation system, built with React Three Fiber and Custom GLSL Shaders.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${outfit.variable} ${cormorant.variable}`}>
      <body>{children}</body>
    </html>
  );
}

