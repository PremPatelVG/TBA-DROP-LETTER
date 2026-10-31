import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * The whole site is an installable home-screen app (no Play Store, App Store or APK): public/manifest.webmanifest
 * gives Android/Chrome the name, TBA icons, green theme and full-screen (standalone) opening; the apple-touch-icon and
 * Apple web-app tags do the same for iPhone "Add to Home Screen". src/components/install-app.tsx shows the in-app
 * "Install app" button (Android) and the Share, then Add to Home Screen guide (iPhone).
 */
export const metadata: Metadata = {
  title: "TBA Drop Letter",
  description: "Letter drop tracking for field advisors and operations",
  applicationName: "TBA Drop Letter",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Drop Letter", statusBarStyle: "default" },
  icons: { apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }] },
};
export const viewport: Viewport = { themeColor: "#15803d", viewportFit: "cover", width: "device-width", initialScale: 1 };

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
