"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUser } from "@/components/ui";
import RegionalAccounts from "@/components/regional-accounts";
import { canManageRegionalAccounts } from "@/lib/data/authz";

/**
 * Regional accounts for the national account (TBA India Ops): it adds and manages state and city accounts.
 * State and city accounts are sent back to the dashboard (the server refuses them anyway); master uses /master.
 */
export default function OpsRegionalAccounts() {
  const user = useUser();
  const router = useRouter();
  const allowed = canManageRegionalAccounts(user);
  useEffect(() => { if (!allowed) router.replace("/ops"); }, [allowed, router]);
  return allowed ? <RegionalAccounts /> : null;
}
