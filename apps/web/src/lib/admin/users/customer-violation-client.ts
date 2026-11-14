"use client";

export type CustomerViolationHistory = {
  revision: number; activeCount: number; status: string;
  observationStart: string; observationEnd: string; restrictionExpiresAt: string | null;
  nextCursor: string | null;
  records: {id: string; mainEventId: string; providerRequestIds: string[]; reason: string;
    occurredAt: string | null; issuedAt: string | null; reversedAt: string | null;
    reversalReason: string | null; reversedBy: string | null; consumedCycleId: string | null;
    restrictionStartedAt?: string | null; restrictionExpiresAt?: string | null}[];
};

async function call<T>(name: string, input: unknown): Promise<T> {
  const [{httpsCallable}, {auth, functions, initializeBrowserAppCheck}] = await Promise.all([
    import("firebase/functions"), import("@/lib/firebase/client"),
  ]);
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error("Sign in again to review violations.");
  initializeBrowserAppCheck();
  try { return (await httpsCallable<unknown, T>(functions, name)(input)).data; }
  catch (error) {
    if ((error as {code?: string}).code === "functions/aborted") {
      throw new Error("Violation state changed. Refresh before reversing.");
    }
    throw new Error("Could not complete the violation review. Refresh and try again.");
  }
}

export function loadCustomerViolations(customerId: string, cursor: string | null = null) {
  return call<CustomerViolationHistory>("getAdminCustomerViolations", {customerId, cursor});
}

export function reverseCustomerViolation(input: {
  customerId: string; strikeId: string; reason: string; expectedRevision: number;
}) {
  return call<{changed: boolean}>("reverseAdminCustomerViolation", input);
}
