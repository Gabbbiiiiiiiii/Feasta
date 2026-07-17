"use client";

import {
  GoogleAuthProvider,
  inMemoryPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from "firebase/auth";

import {auth} from "@/lib/firebase/client";

export type WebUserRole = "customer" | "provider" | "admin";

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
  await fetch("/api/auth/logout", {method: "POST"});
  await signOut(auth);
}

async function exchangeCredentialForSession(
  idToken: string,
): Promise<WebUserRole> {
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
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
