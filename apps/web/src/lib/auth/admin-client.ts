"use client";

import {
  browserSessionPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
} from "firebase/auth";

import {
  exchangeCurrentUserForSession,
  type WebSessionResult,
  WebAuthenticationError,
} from "@/lib/auth/client-session";
import {auth} from "@/lib/firebase/client";

export async function signInAdmin(
  email: string,
  password: string,
  returnTo?: string,
): Promise<WebSessionResult> {
  const normalizedEmail = email.trim().toLowerCase();
  await authorizeAdminLoginAttempt(normalizedEmail);
  await setPersistence(auth, browserSessionPersistence);
  await signInWithEmailAndPassword(auth, normalizedEmail, password);
  try {
    return await exchangeCurrentUserForSession("admin", returnTo);
  } catch (error) {
    await signOut(auth);
    throw error;
  }
}

async function authorizeAdminLoginAttempt(email: string): Promise<void> {
  const csrfResponse = await fetch("/api/auth/csrf", {
    credentials: "same-origin",
    cache: "no-store",
  });
  const csrfBody = await csrfResponse.json() as {token?: string};
  if (!csrfResponse.ok || !csrfBody.token) {
    throw new WebAuthenticationError(
      "Sign-in could not be completed.",
      "configuration",
    );
  }
  const response = await fetch("/api/auth/admin/attempt", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-feasta-csrf": csrfBody.token,
    },
    body: JSON.stringify({email}),
  });
  if (!response.ok) {
    throw new WebAuthenticationError(
      "Sign-in could not be completed.",
      response.status === 429 ? "rate_limited" : "account_unavailable",
    );
  }
}
