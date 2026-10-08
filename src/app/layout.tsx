import type { Metadata, Viewport } from "next";
import { Space_Grotesk, Inter } from "next/font/google";
import "./globals.css";

// Only the weights the design system uses. next/font self-hosts these, so
// there is no request to Google at runtime.
const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["600", "700"],
  variable: "--font-display",
  display: "swap",
});

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "LP9 YPC · Young Professionals Club",
  description:
    "The community platform for young professionals in RCCG Lagos Province 9. Register, join a career path, and apply to jobs in one tap.",
  keywords: ["LP9 YPC", "Lagos Province 9", "RCCG", "Young Professionals", "jobs", "career"],
};

// No maximumScale: members must be able to pinch-zoom.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#FFFDF7",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-NG" className={`${spaceGrotesk.variable} ${inter.variable}`}>
      <body>
        <a href="#main" className="skip-link">Skip to content</a>
        {children}
      </body>
    </html>
  );
}
