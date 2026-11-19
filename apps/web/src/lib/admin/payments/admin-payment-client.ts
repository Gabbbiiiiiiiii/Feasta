"use client";

import {
  FirebaseError,
} from "firebase/app";
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
} from "firebase/auth";
import {
  httpsCallable,
} from "firebase/functions";

import {
  WebAuthenticationError,
} from "@/lib/auth/client-session";

const ADMIN_RELEASE_CONFIRMATION_PHRASE = "RELEASE";
const ADMIN_FUND_CONFIRMATION_PHRASE = "FUND";
const ADMIN_ADVANCE_CONFIRMATION_PHRASE = "ADVANCE";
import type {
  AdminPayoutSetupRepairInput,
  AdminPayoutSetupRepairResult,
} from "@/lib/admin/payments/admin-payment-types";
import {
  auth,
  functions,
  initializeBrowserAppCheck,
} from "@/lib/firebase/client";

const REPAIR_AMBIGUOUS_PAYOUT_FUNCTION =
  "repairAmbiguousProviderPayoutAccount";

const PAYOUT_REPAIR_REASON =
  "Operator confirmed no PayMongo test child account exists after ambiguous Create Account attempt.";

const SAFE_PROVIDER_ID =
  /^[A-Za-z0-9_-]{8,160}$/u;

async function reauthenticateAdminPassword(password: string): Promise<void> {
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user) {
    throw new WebAuthenticationError(
      "Your admin session has expired. Please sign in again.",
      "session_expired",
    );
  }

  if (typeof password !== "string" || password.length < 1) {
    throw new Error("Enter your admin password to continue.");
  }

  if (!user.email) {
    throw new Error(
      "This admin account has no email/password sign-in. Use an email/password admin account.",
    );
  }

  const hasPasswordProvider = user.providerData.some(
    (provider) => provider.providerId === EmailAuthProvider.PROVIDER_ID,
  );
  if (!hasPasswordProvider) {
    throw new Error(
      "This admin account has no email/password sign-in. Use an email/password admin account.",
    );
  }

  try {
    await reauthenticateWithCredential(
      user,
      EmailAuthProvider.credential(user.email, password),
    );
  } catch (error: unknown) {
    if (
      error instanceof FirebaseError &&
      (error.code === "auth/wrong-password" ||
        error.code === "auth/invalid-credential" ||
        error.code === "auth/invalid-login-credentials")
    ) {
      throw new Error("Admin password is incorrect.");
    }

    throw new Error("Admin re-authentication failed. Try again.");
  }

  await user.getIdToken(true);
}

function mapCallableError(error: unknown, fallback: string): Error {
  const code =
    error instanceof FirebaseError
      ? normalizeCallableCode(error.code)
      : "unknown";

  if (code === "not-found") {
    return new Error(
      "The finance callable is not deployed yet. Deploy Functions, then try again.",
    );
  }

  if (code === "failed-precondition" || code === "invalid-argument") {
    return new Error(
      error instanceof FirebaseError && error.message.trim().length >= 4
        ? error.message
            .replace(/^Firebase:\s*/u, "")
            .replace(/\s*\([^)]*\)\.?$/u, "")
            .trim()
        : fallback,
    );
  }

  if (code === "unauthenticated") {
    const message = error instanceof FirebaseError ? error.message : "";
    if (/Recent authentication/iu.test(message)) {
      return new Error(
        "Recent admin authentication is required. Re-enter your password and try again.",
      );
    }

    return new WebAuthenticationError(
      "Your admin session has expired. Please sign in again.",
      "session_expired",
    );
  }

  if (code === "permission-denied") {
    return new Error("Only an authorized FEASTA Admin can perform this action.");
  }

  if (code === "resource-exhausted") {
    return new Error("Too many requests were made. Wait a moment and try again.");
  }

  return new Error(fallback);
}

export async function repairAmbiguousProviderPayoutSetup(
  input: AdminPayoutSetupRepairInput,
): Promise<AdminPayoutSetupRepairResult> {
  await auth.authStateReady();

  if (!auth.currentUser) {
    throw new WebAuthenticationError(
      "Your admin session has expired. Please sign in again.",
      "session_expired",
    );
  }

  const providerId =
    input.providerId.trim();

  if (!SAFE_PROVIDER_ID.test(providerId)) {
    throw new Error(
      "The Provider payout account is unavailable.",
    );
  }

  if (
    !Number.isSafeInteger(
      input.expectedUpdatedAtMillis,
    ) ||
    input.expectedUpdatedAtMillis <= 0
  ) {
    throw new Error(
      "The payout recovery state is stale. Refresh Provider payout issues.",
    );
  }

  initializeBrowserAppCheck();

  const callable = httpsCallable<
    {
      providerId: string;
      expectedUpdatedAtMillis: number;
      reason: string;
    },
    AdminPayoutSetupRepairResult
  >(
    functions,
    REPAIR_AMBIGUOUS_PAYOUT_FUNCTION,
    {
      timeout: 30_000,
    },
  );

  try {
    const result = await callable({
      providerId,
      expectedUpdatedAtMillis:
        input.expectedUpdatedAtMillis,
      reason: PAYOUT_REPAIR_REASON,
    });

    return result.data;
  } catch (error: unknown) {
    throw new Error(
      payoutRepairErrorMessage(error),
    );
  }
}

function normalizeCallableCode(
  code: string,
): string {
  return code
    .replace(/^functions\//, "")
    .replace(/^functions:/, "");
}

function payoutRepairErrorMessage(
  error: unknown,
): string {
  if (
    error instanceof
      WebAuthenticationError
  ) {
    return error.message;
  }

  if (error instanceof FirebaseError) {
    switch (
      normalizeCallableCode(error.code)
    ) {
      case "unauthenticated":
        return "Your admin session has expired. Please sign in again.";

      case "permission-denied":
        return "Only an authorized FEASTA Admin can repair this payout setup.";

      case "not-found":
        return "This payout setup is no longer available. Refresh Provider payout issues.";

      case "invalid-argument":
        return "The payout recovery request is invalid.";

      case "failed-precondition":
        return "The payout setup changed or is no longer safe to repair. Refresh Provider payout issues.";

      case "resource-exhausted":
        return "Too many payout recovery attempts were made. Wait a moment and try again.";

      case "unavailable":
      case "deadline-exceeded":
        return "The trusted payout recovery service is temporarily unavailable.";

      default:
        return "The payout setup could not be repaired safely.";
    }
  }

  if (
    error instanceof Error &&
    error.message.trim()
  ) {
    return error.message;
  }

  return "The payout setup could not be repaired safely.";
}
export async function retryFailedProviderDisbursement(input: {providerDisbursementId: string}): Promise<{prepared: true}> {
  await auth.authStateReady();
  if (!auth.currentUser) throw new WebAuthenticationError("Your admin session has expired. Please sign in again.", "session_expired");
  const providerDisbursementId = input.providerDisbursementId;
  if (!/^[A-Za-z0-9_-]{1,220}$/u.test(providerDisbursementId)) throw new Error("The Provider payout reference is invalid.");
  initializeBrowserAppCheck();
  const callable = httpsCallable<{providerDisbursementId: string}, {prepared: true}>(
    functions, "retryFailedProviderDisbursement", {timeout: 30_000});
  try {
    return (await callable({providerDisbursementId})).data;
  } catch (error: unknown) {
    const code = error instanceof FirebaseError ? normalizeCallableCode(error.code) : "unknown";
    const message = code === "failed-precondition" || code === "not-found" ?
      "This payout changed or is no longer authoritatively failed. Refresh Provider payout issues." :
      code === "unauthenticated" ? "Your admin session has expired. Please sign in again." :
      code === "permission-denied" ? "Only an authorized FEASTA Admin can retry this payout." :
      code === "resource-exhausted" ? "Too many payout retries were requested. Wait a moment and try again." :
      "The trusted payout retry service could not prepare this retry safely. Refresh Provider payout issues.";
    throw new Error(message);
  }
}

export async function fundCompanyFloat(input: {
  amountInCentavos: number;
  password: string;
  confirmationPhrase: string;
}): Promise<{
  availableBalanceInCentavos: number;
  outstandingAdvanceInCentavos: number;
  currency: "PHP";
  mode: "mock";
}> {
  await reauthenticateAdminPassword(input.password);

  if (input.confirmationPhrase !== ADMIN_FUND_CONFIRMATION_PHRASE) {
    throw new Error("Type FUND exactly to confirm company float funding.");
  }

  if (!Number.isSafeInteger(input.amountInCentavos) || input.amountInCentavos <= 0) {
    throw new Error("Company float funding amount is invalid.");
  }

  initializeBrowserAppCheck();
  const callable = httpsCallable<
    {amountInCentavos: number; confirmationPhrase: string},
    {
      availableBalanceInCentavos: number;
      outstandingAdvanceInCentavos: number;
      currency: "PHP";
      mode: "mock";
    }
  >(functions, "fundCompanyFloat", {timeout: 30_000});

  try {
    return (await callable({
      amountInCentavos: input.amountInCentavos,
      confirmationPhrase: ADMIN_FUND_CONFIRMATION_PHRASE,
    })).data;
  } catch (error: unknown) {
    throw mapCallableError(error, "Company float could not be funded.");
  }
}

export async function approveCompanyAdvanceRequest(input: {
  advanceRequestId: string;
  password: string;
  confirmationPhrase: string;
}): Promise<{
  advanceId: string;
  advanceRequestId: string;
  providerRequestId: string;
  providerId: string;
  amountInCentavos: number;
  currency: "PHP";
  status: "outstanding" | "repaid";
  mode: "mock";
  repaymentDestination: "company_float";
}> {
  await reauthenticateAdminPassword(input.password);

  if (!/^[A-Za-z0-9_-]{1,220}$/u.test(input.advanceRequestId)) {
    throw new Error("The advance request reference is invalid.");
  }
  if (input.confirmationPhrase !== ADMIN_ADVANCE_CONFIRMATION_PHRASE) {
    throw new Error("Type ADVANCE exactly to confirm this company advance.");
  }

  initializeBrowserAppCheck();
  const callable = httpsCallable<
    {
      advanceRequestId: string;
      confirmationPhrase: string;
    },
    {
      advanceId: string;
      advanceRequestId: string;
      providerRequestId: string;
      providerId: string;
      amountInCentavos: number;
      currency: "PHP";
      status: "outstanding" | "repaid";
      mode: "mock";
      repaymentDestination: "company_float";
    }
  >(functions, "approveCompanyAdvanceRequest", {timeout: 30_000});

  try {
    return (await callable({
      advanceRequestId: input.advanceRequestId,
      confirmationPhrase: ADMIN_ADVANCE_CONFIRMATION_PHRASE,
    })).data;
  } catch (error: unknown) {
    throw mapCallableError(error, "Company advance could not be approved.");
  }
}

export async function rejectCompanyAdvanceRequest(input: {
  advanceRequestId: string;
  password: string;
}): Promise<{advanceRequestId: string; status: "rejected"}> {
  await reauthenticateAdminPassword(input.password);

  if (!/^[A-Za-z0-9_-]{1,220}$/u.test(input.advanceRequestId)) {
    throw new Error("The advance request reference is invalid.");
  }

  initializeBrowserAppCheck();
  const callable = httpsCallable<
    {advanceRequestId: string},
    {advanceRequestId: string; status: "rejected"}
  >(functions, "rejectCompanyAdvanceRequest", {timeout: 30_000});

  try {
    return (await callable({advanceRequestId: input.advanceRequestId})).data;
  } catch (error: unknown) {
    throw mapCallableError(error, "Company advance request could not be rejected.");
  }
}

export async function releaseMockProviderDisbursement(input: {
  providerDisbursementId: string;
  password: string;
  confirmationPhrase: string;
}): Promise<{
  providerDisbursementId: string;
  withdrawalId: string;
  amountInCentavos: number;
  currency: "PHP";
  status: "succeeded";
  mode: "mock";
  providerId: string;
}> {
  await reauthenticateAdminPassword(input.password);

  const providerDisbursementId = input.providerDisbursementId;
  if (!/^[A-Za-z0-9_-]{1,220}$/u.test(providerDisbursementId)) {
    throw new Error("The Provider payout reference is invalid.");
  }

  if (input.confirmationPhrase !== ADMIN_RELEASE_CONFIRMATION_PHRASE) {
    throw new Error("Type RELEASE exactly to confirm this payout release.");
  }

  initializeBrowserAppCheck();

  const callable = httpsCallable<
    {
      providerDisbursementId: string;
      confirmationPhrase: string;
    },
    {
      providerDisbursementId: string;
      withdrawalId: string;
      amountInCentavos: number;
      currency: "PHP";
      status: "succeeded";
      mode: "mock";
      providerId: string;
    }
  >(functions, "releaseMockProviderDisbursement", {timeout: 30_000});

  try {
    return (await callable({
      providerDisbursementId,
      confirmationPhrase: ADMIN_RELEASE_CONFIRMATION_PHRASE,
    })).data;
  } catch (error: unknown) {
    throw mapCallableError(
      error,
      "The mock provider payout could not be completed.",
    );
  }
}
