import type { Metadata, Viewport } from "next";
import { RequireRole } from "@/components/ui";

// Installable advisor app: manifest is scoped to /advisor (see public/advisor.webmanifest).
export const metadata: Metadata = {
  title: "Drop Letter",
  manifest: "/advisor.webmanifest",
  appleWebApp: { capable: true, title: "Drop Letter", statusBarStyle: "default" },
  icons: { apple: "/icons/advisor-192.png" },
};
export const viewport: Viewport = { themeColor: "#4f46e5", viewportFit: "cover" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <RequireRole roles={["advisor"]} variant="advisor">{children}</RequireRole>;
}
