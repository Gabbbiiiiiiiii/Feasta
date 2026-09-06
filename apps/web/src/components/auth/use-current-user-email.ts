"use client";

import {onAuthStateChanged} from "firebase/auth";
import {useEffect, useState} from "react";
import {auth} from "@/lib/firebase/client";

/** Verification copy starts identically on SSR and hydration, then follows Firebase. */
export function useCurrentUserEmail(): string | null {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => onAuthStateChanged(auth, (user) => {
    setEmail(user?.email ?? null);
  }), []);
  return email;
}
