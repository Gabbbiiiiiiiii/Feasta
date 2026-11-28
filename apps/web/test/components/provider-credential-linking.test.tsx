import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
  auth: {
    currentUser: null as FakeUser | null,
    authStateReady: vi.fn(async () => undefined),
  },
  authorize: vi.fn(async () => undefined),
  credential: vi.fn((email: string, password: string) => ({email, password})),
  ensureIdentity: vi.fn(async () => ({data: {success: true, created: true}})),
  link: vi.fn(),
  reload: vi.fn(async () => undefined),
  sendVerification: vi.fn(async () => undefined),
  setPersistence: vi.fn(async () => undefined),
}));

type FakeUser = {
  uid: string;
  phoneNumber: string | null;
  email: string | null;
  emailVerified: boolean;
  providerData: Array<{providerId: string}>;
  getIdToken: ReturnType<typeof vi.fn>;
};

vi.mock("firebase/auth", () => {
  class MockPhoneAuthProvider {
    static readonly PROVIDER_ID = "phone";
    static credential() {
      return {};
    }
    verifyPhoneNumber = vi.fn();
  }
  return {
    browserSessionPersistence: {},
    EmailAuthProvider: {
      PROVIDER_ID: "password",
      credential: mocks.credential,
    },
    linkWithCredential: mocks.link,
    PhoneAuthProvider: MockPhoneAuthProvider,
    RecaptchaVerifier: class {},
    reload: mocks.reload,
    sendEmailVerification: mocks.sendVerification,
    setPersistence: mocks.setPersistence,
    signInWithPhoneNumber: vi.fn(),
    signInWithEmailAndPassword: vi.fn(),
    signOut: vi.fn(),
    updatePhoneNumber: vi.fn(),
  };
});

vi.mock("firebase/functions", () => ({
  httpsCallable: vi.fn(() => mocks.ensureIdentity),
}));

vi.mock("firebase/storage", () => ({
  ref: vi.fn(),
  uploadBytesResumable: vi.fn(),
}));

vi.mock("@/lib/firebase/client", () => ({
  auth: mocks.auth,
  functions: {},
  storage: {},
}));

vi.mock("@/lib/auth/client-session", () => ({
  authorizeWebAuthenticationAttempt: mocks.authorize,
  exchangeCurrentUserForSession: vi.fn(),
  getCsrfToken: vi.fn(),
  WebAuthenticationError: class WebAuthenticationError extends Error {
    constructor(message: string, public readonly reason?: string) {
      super(message);
    }
  },
}));

import {registerProviderIdentity} from "@/lib/auth/provider-client";

const input = {
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ADA@EXAMPLE.TEST",
  password: "Feasta123!",
  phoneNumber: "+639171234567",
  acceptedTerms: true as const,
  acceptedPrivacy: true as const,
  termsPolicyVersion: "terms-2026-08",
  privacyPolicyVersion: "privacy-2026-08",
};

describe("provider Phase C credential linking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    const user = phoneUser();
    mocks.auth.currentUser = user;
    mocks.link.mockImplementation(async () => {
      user.email = "ada@example.test";
      user.providerData.push({providerId: "password"});
      return {user};
    });
  });

  it("links password to the phone user, preserves UID, then creates identity", async () => {
    const originalUid = mocks.auth.currentUser?.uid;
    const result = await registerProviderIdentity(input);

    expect(mocks.credential).toHaveBeenCalledWith(
      "ada@example.test",
      "Feasta123!",
    );
    expect(mocks.link).toHaveBeenCalledTimes(1);
    expect(mocks.auth.currentUser?.uid).toBe(originalUid);
    expect(mocks.auth.currentUser?.providerData).toContainEqual({
      providerId: "password",
    });
    expect(mocks.ensureIdentity).toHaveBeenCalledTimes(1);
    expect(mocks.ensureIdentity).toHaveBeenCalledWith(expect.objectContaining({
      email: "ada@example.test",
      phoneNumber: "+639171234567",
      acceptedTerms: true,
      acceptedPrivacy: true,
    }));
    expect(mocks.link.mock.invocationCallOrder[0])
      .toBeLessThan(mocks.ensureIdentity.mock.invocationCallOrder[0]);
    expect(mocks.sendVerification).toHaveBeenCalledWith(mocks.auth.currentUser);
    expect(mocks.auth.currentUser?.emailVerified).toBe(false);
    expect(result).toEqual({
      verificationEmailSent: true,
      emailVerified: false,
      credentialLinked: true,
    });
  });

  it("fails closed before identity creation when the linked UID changes", async () => {
    mocks.link.mockResolvedValueOnce({user: {...phoneUser(), uid: "other-uid"}});

    await expect(registerProviderIdentity(input)).rejects.toMatchObject({
      reason: "uid_mismatch",
    });
    expect(mocks.ensureIdentity).not.toHaveBeenCalled();
    expect(mocks.sendVerification).not.toHaveBeenCalled();
  });

  it("requires the current Auth phone to match the Phase B phone", async () => {
    mocks.auth.currentUser!.phoneNumber = "+639179999999";

    await expect(registerProviderIdentity(input)).rejects.toMatchObject({
      reason: "session_expired",
    });
    expect(mocks.link).not.toHaveBeenCalled();
    expect(mocks.ensureIdentity).not.toHaveBeenCalled();
  });

  it("does not create identity when linking collides with another account", async () => {
    mocks.link.mockRejectedValueOnce({code: "auth/email-already-in-use"});

    await expect(registerProviderIdentity(input)).rejects.toMatchObject({
      code: "auth/email-already-in-use",
    });
    expect(mocks.ensureIdentity).not.toHaveBeenCalled();
    expect(mocks.sendVerification).not.toHaveBeenCalled();
  });

  it("resumes an already-linked phone and password user without relinking", async () => {
    const user = mocks.auth.currentUser!;
    user.email = "ada@example.test";
    user.providerData.push({providerId: "password"});

    const result = await registerProviderIdentity(input);

    expect(mocks.link).not.toHaveBeenCalled();
    expect(mocks.ensureIdentity).toHaveBeenCalledTimes(1);
    expect(result.credentialLinked).toBe(false);
  });

  it("fails closed when an already-linked email differs", async () => {
    const user = mocks.auth.currentUser!;
    user.email = "different@example.test";
    user.providerData.push({providerId: "password"});

    await expect(registerProviderIdentity(input)).rejects.toMatchObject({
      reason: "account_inconsistent",
    });
    expect(mocks.link).not.toHaveBeenCalled();
    expect(mocks.ensureIdentity).not.toHaveBeenCalled();
  });

  it("resumes a provider-already-linked race only after consistent reload", async () => {
    const user = mocks.auth.currentUser!;
    mocks.link.mockImplementationOnce(async () => {
      user.email = "ada@example.test";
      user.providerData.push({providerId: "password"});
      throw {code: "auth/provider-already-linked"};
    });

    await expect(registerProviderIdentity(input)).resolves.toMatchObject({
      credentialLinked: false,
    });
    expect(mocks.reload).toHaveBeenCalled();
    expect(mocks.ensureIdentity).toHaveBeenCalledTimes(1);
  });

  it("reports verification dispatch as retriable after identity succeeds", async () => {
    mocks.sendVerification.mockRejectedValueOnce({
      code: "auth/network-request-failed",
    });

    await expect(registerProviderIdentity(input)).resolves.toEqual({
      verificationEmailSent: false,
      emailVerified: false,
      credentialLinked: true,
    });
    expect(mocks.ensureIdentity).toHaveBeenCalledTimes(1);
  });
});

function phoneUser(): FakeUser {
  return {
    uid: "phone-auth-uid",
    phoneNumber: "+639171234567",
    email: null,
    emailVerified: false,
    providerData: [{providerId: "phone"}],
    getIdToken: vi.fn(async () => "fresh-token"),
  };
}
