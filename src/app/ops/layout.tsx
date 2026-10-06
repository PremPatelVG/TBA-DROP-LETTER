import { RequireRole } from "@/components/ui";
export default function Layout({ children }: { children: React.ReactNode }) {
  return <RequireRole roles={["operations", "master"]} variant="admin">{children}</RequireRole>;
}
