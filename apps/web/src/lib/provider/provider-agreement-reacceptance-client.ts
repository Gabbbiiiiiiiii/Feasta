"use client";

import {httpsCallable} from "firebase/functions";
import {auth, functions} from "@/lib/firebase/client";
import type {ProviderAgreementSnapshot} from "./provider-agreement-record";

export type ProviderAgreementReview = {agreement: ProviderAgreementSnapshot; digest: string};

export async function reviewCurrentProviderAgreement(): Promise<ProviderAgreementReview> {
  if (!auth.currentUser) throw new Error("Please sign in again.");
  const result = await httpsCallable<{action: string}, ProviderAgreementReview>(
    functions, "acceptCurrentProviderAgreement",
  )({action: "review"});
  return result.data;
}

export async function acceptCurrentProviderAgreement(review: ProviderAgreementReview): Promise<void> {
  if (!auth.currentUser) throw new Error("Please sign in again.");
  await httpsCallable(functions, "acceptCurrentProviderAgreement")({
    action: "accept", confirmed: true, version: review.agreement.version, digest: review.digest,
  });
}
