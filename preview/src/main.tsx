import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import "./preview.css";
import { useLocation, setParams } from "./shims/navigation";

import Login from "@/app/login/page";
import NotAuthorised from "@/app/not-authorised/page";
import AdvisorLayout from "@/app/advisor/layout";
import AdvisorHome from "@/app/advisor/page";
import NewDrop from "@/app/advisor/drops/new/page";
import DropResponse from "@/app/advisor/drop/page";
import Leads from "@/app/advisor/leads/page";
import LogResponse from "@/app/advisor/responses/page";
import OpsLayout from "@/app/ops/layout";
import OpsHome from "@/app/ops/page";
import OpsDrops from "@/app/ops/drops/page";
import OpsAdvisors from "@/app/ops/advisors/page";
import OpsLevels from "@/app/ops/levels/page";
import MasterLayout from "@/app/master/layout";
import MasterHome from "@/app/master/page";

type Route = { pattern: RegExp; keys?: string[]; layout?: (p: { children: ReactNode }) => ReactNode; page: () => ReactNode };
const routes: Route[] = [
  { pattern: /^\/login$/, page: Login },
  { pattern: /^\/not-authorised$/, page: NotAuthorised },
  { pattern: /^\/advisor$/, layout: AdvisorLayout, page: AdvisorHome },
  { pattern: /^\/advisor\/drops\/new$/, layout: AdvisorLayout, page: NewDrop },
  { pattern: /^\/advisor\/drop$/, layout: AdvisorLayout, page: DropResponse },
  { pattern: /^\/advisor\/responses$/, layout: AdvisorLayout, page: LogResponse },
  { pattern: /^\/advisor\/leads$/, layout: AdvisorLayout, page: Leads },
  { pattern: /^\/ops$/, layout: OpsLayout, page: OpsHome },
  { pattern: /^\/ops\/drops$/, layout: OpsLayout, page: OpsDrops },
  { pattern: /^\/ops\/advisors$/, layout: OpsLayout, page: OpsAdvisors },
  { pattern: /^\/ops\/levels$/, layout: OpsLayout, page: OpsLevels },
  { pattern: /^\/master$/, layout: MasterLayout, page: MasterHome },
];

function App() {
  const path = useLocation().split("?")[0];
  for (const r of routes) {
    const m = path.match(r.pattern);
    if (!m) continue;
    setParams(Object.fromEntries((r.keys ?? []).map((k, i) => [k, decodeURIComponent(m[i + 1])])));
    const Page = r.page;
    const Layout = r.layout;
    // key by path so pages remount (and reload data) on navigation, like Next.js does
    return Layout ? <Layout key={path.split("/")[1]}><Page key={path} /></Layout> : <Page key={path} />;
  }
  return <Login />;
}

createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
