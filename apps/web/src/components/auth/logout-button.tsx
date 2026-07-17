"use client";

import {useRouter} from "next/navigation";
import {useState} from "react";

import {logoutWebSession} from "@/lib/auth/client-session";

export function LogoutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  return (
    <button
      className="rounded-xl border border-[#E7DED8] px-4 py-2 font-semibold"
      disabled={loading}
      onClick={async () => {
        setLoading(true);
        try {
          await logoutWebSession();
          router.replace("/login");
          router.refresh();
        } finally {
          setLoading(false);
        }
      }}
    >
      {loading ? "Signing out…" : "Sign out"}
    </button>
  );
}
