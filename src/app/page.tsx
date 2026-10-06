"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/lib/data";
import { accessRedirect, homeFor } from "@/components/ui";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    api.currentAccess().then(
      (a) => router.replace(accessRedirect(a) ?? (a?.status === "ok" ? homeFor(a.profile.role) : "/login")),
      () => router.replace("/login"),
    );
  }, [router]);
  return <div className="flex min-h-dvh items-center justify-center text-slate-500">Loading...</div>;
}
