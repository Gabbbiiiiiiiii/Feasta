import "server-only";

import {
  normalizePhilippineMobile,
  parseUserRole,
  resolveProviderRegistrationState,
  type ProviderAccountClassification,
  type ProviderRegistrationResolution,
} from "@feasta/shared-types";
import type {DecodedIdToken, UserRecord} from "firebase-admin/auth";

import {adminAuth, adminDb} from "@/lib/firebase/admin";
import {classifyProviderRegistrationRecords} from "@/lib/auth/provider-registration-classification";
import {requireServerPhoneIdentityOwnership} from "@/lib/auth/phone-identity-server";

export interface ProviderPhoneClassificationResult {
  classification: ProviderAccountClassification;
  resolution: ProviderRegistrationResolution;
}

export async function classifyAuthenticatedProviderPhone(input: {
  decoded: DecodedIdToken;
  authUser: UserRecord;
  submittedPhoneNumber: string;
}): Promise<ProviderPhoneClassificationResult> {
  const submittedPhone = normalizePhilippineMobile(input.submittedPhoneNumber);
  const authPhone = normalizePhilippineMobile(input.authUser.phoneNumber);
  const signedInWithPhone = input.decoded.firebase?.sign_in_provider === "phone";
  const phoneLinked = input.authUser.providerData.some(
    (provider) => provider.providerId === "phone",
  );

  if (
    input.authUser.disabled ||
    !submittedPhone ||
    !authPhone ||
    authPhone !== submittedPhone ||
    !signedInWithPhone ||
    !phoneLinked
  ) {
    throw new Error("Trusted phone authentication evidence is invalid.");
  }
  await requireServerPhoneIdentityOwnership(input.authUser, authPhone);

  const userReference = adminDb.collection("users").doc(input.authUser.uid);
  const customerReference = adminDb.collection("customers").doc(input.authUser.uid);
  const ownedProviderQuery = adminDb.collection("providers")
    .where("ownerId", "==", input.authUser.uid)
    .limit(2);
  const [userSnapshot, customerSnapshot, ownedProviderSnapshot] =
    await Promise.all([
      userReference.get(),
      customerReference.get(),
      ownedProviderQuery.get(),
    ]);
  const userProfile = userSnapshot.data() ?? null;
  const providerId = typeof userProfile?.providerId === "string"
    ? userProfile.providerId.trim()
    : "";
  const linkedProviderSnapshot = providerId
    ? await adminDb.collection("providers").doc(providerId).get()
    : null;
  const ownedProviderProfiles = ownedProviderSnapshot.docs.map((document) => ({
    id: document.id,
    ...document.data(),
  }));
  const linkedProviderProfile = linkedProviderSnapshot?.exists
    ? {id: linkedProviderSnapshot.id, ...linkedProviderSnapshot.data()!}
    : null;
  const classification = classifyProviderRegistrationRecords({
    uid: input.authUser.uid,
    authPhoneNumber: authPhone,
    userProfile,
    customerProfileExists: customerSnapshot.exists,
    ownedProviderProfiles,
    linkedProviderProfile,
  });
  const resolution = resolveProviderRegistrationState({
    authenticatedUid: input.authUser.uid,
    linkedCredentialUid: input.authUser.uid,
    phoneAuthenticated: true,
    phoneVerified: true,
    emailCredentialLinked: input.authUser.providerData.some(
      (provider) => provider.providerId === "password",
    ),
    emailVerified: input.authUser.emailVerified,
    accountClassification: classification,
    existingRole: parseUserRole(userProfile?.role),
  });

  return {classification, resolution};
}

export async function verifyProviderPhoneClassificationToken(
  idToken: string,
): Promise<{decoded: DecodedIdToken; authUser: UserRecord}> {
  const decoded = await adminAuth.verifyIdToken(idToken, true);
  const authUser = await adminAuth.getUser(decoded.uid);
  return {decoded, authUser};
}
