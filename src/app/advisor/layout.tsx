import type { Metadata } from "next";
import { RequireRole } from "@/components/ui";

// The home-screen app (manifest, icons, theme colour) is set up for the whole site in src/app/layout.tsx.
export const metadata: Metadata = { title: "Drop Letter" };

export default function Layout({ children }: { children: React.ReactNode }) {
  return <RequireRole roles={["advisor"]} variant="advisor">{children}</RequireRole>;
}
