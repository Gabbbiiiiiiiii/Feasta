"use client";

import {
  GoogleAuthProvider,
  inMemoryPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import type {UserRole} from "@feasta/shared-types";

import {auth} from "@/lib/firebase/client";

export type WebUserRole = UserRole;

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<WebUserRole> {
  await setPersistence(auth, inMemoryPersistence);
  const credential = await signInWithEmailAndPassword(
    auth,
    email.trim().toLowerCase(),
    password,
  );
  return exchangeCredentialForSession(await credential.user.getIdToken(true));
}

export async function signInWithGoogle(): Promise<WebUserRole> {
  await setPersistence(auth, inMemoryPersistence);
  const credential = await signInWithPopup(auth, new GoogleAuthProvider());
  return exchangeCredentialForSession(await credential.user.getIdToken(true));
}

export async function logoutWebSession(): Promise<void> {
  const csrf = await getCsrfToken();
  await fetch("/api/auth/logout", {
    method: "POST",
    headers: {"x-feasta-csrf": csrf},
  });
  await signOut(auth);
}

async function exchangeCredentialForSession(
  idToken: string,
): Promise<WebUserRole> {
  const csrf = await getCsrfToken();
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-feasta-csrf": csrf,
    },
    body: JSON.stringify({idToken}),
  });

  const body = await response.json() as {
    role?: WebUserRole;
    error?: string;
  };
  if (!response.ok || !body.role) {
    await signOut(auth);
    throw new Error(body.error ?? "Unable to create a secure session.");
  }
  return body.role;
}

async function getCsrfToken(): Promise<string> {
  const response = await fetch("/api/auth/csrf", {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
  });
  const body = await response.json() as {token?: string};
  if (!response.ok || !body.token) throw new Error("Unable to initialize request security.");
  return body.token;
}
