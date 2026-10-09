import {afterEach, beforeEach, expect, it, vi} from "vitest";
const mocks = vi.hoisted(() => ({popup: vi.fn(), authState: vi.fn(), auth: {currentUser: null as unknown}, profile: vi.fn(), signOut: vi.fn()}));
vi.mock("@/lib/firebase/client", () => ({auth: mocks.auth, functions: {}}));
vi.mock("firebase/auth", () => ({
  GoogleAuthProvider: class {}, browserLocalPersistence: {}, setPersistence: vi.fn().mockResolvedValue(undefined),
  signInWithPopup: mocks.popup, onAuthStateChanged: mocks.authState,
  signOut: mocks.signOut,
}));
vi.mock("firebase/functions", () => ({httpsCallable: () => mocks.profile}));
import {signInWithGoogle} from "@/lib/auth/client-session";
const user = {uid: "google-user", providerData: [{providerId: "google.com"}], getIdToken: vi.fn().mockResolvedValue("token")};
beforeEach(() => {
  mocks.auth.currentUser = null;
  vi.clearAllMocks(); vi.useFakeTimers(); mocks.profile.mockResolvedValue({}); mocks.signOut.mockResolvedValue(undefined);
  vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => Promise.resolve({ok: true, json: async () => url.endsWith("csrf") ? {token: "csrf"} : {role: "customer", destination: "/customer/packages/pkg/plan"}})));
});

it("rolls back a newly signed-in user after session failure, then retries cleanly", async () => {
  mocks.popup.mockImplementation(async () => {mocks.auth.currentUser = user; return {user};});
  mocks.signOut.mockImplementation(async () => {mocks.auth.currentUser = null;});
  vi.mocked(fetch).mockResolvedValueOnce({ok: false, json: async () => ({})} as Response);
  await expect(signInWithGoogle()).rejects.toThrow();
  expect(mocks.signOut).toHaveBeenCalledTimes(1);
  expect(mocks.auth.currentUser).toBeNull();
  expect(vi.getTimerCount()).toBe(0);
  await expect(signInWithGoogle()).resolves.toMatchObject({role: "customer"});
  expect(mocks.auth.currentUser).toBe(user);
  expect(mocks.popup).toHaveBeenCalledTimes(2);
});

it.each(["existing", "replacement"])("does not sign out a %s user after session failure", async (scenario) => {
  if (scenario === "existing") mocks.auth.currentUser = user;
  mocks.popup.mockImplementation(async () => {mocks.auth.currentUser = user; return {user};});
  mocks.profile.mockImplementationOnce(async () => {
    if (scenario === "replacement") mocks.auth.currentUser = {...user, uid: "other-user"};
    throw {code: "functions/unavailable"};
  });
  await expect(signInWithGoogle()).rejects.toMatchObject({code: "functions/unavailable"});
  expect(mocks.signOut).not.toHaveBeenCalled();
  expect(mocks.auth.currentUser).not.toBeNull();
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it("ignores pre-existing and unrelated auth state and waits for the popup credential", async () => {
  mocks.auth.currentUser = {...user};
  let resolve!: (value: unknown) => void;
  mocks.popup.mockReturnValue(new Promise((done) => { resolve = done; }));
  const result = signInWithGoogle("/customer/packages/pkg/plan");
  await vi.advanceTimersByTimeAsync(0);
  mocks.auth.currentUser = {...user};
  await vi.advanceTimersByTimeAsync(1000);
  expect(fetch).not.toHaveBeenCalled();
  expect(mocks.authState).not.toHaveBeenCalled();
  resolve({user});
  await expect(result).resolves.toMatchObject({destination: "/customer/packages/pkg/plan"});
  expect(vi.getTimerCount()).toBe(0);
  expect(vi.mocked(fetch).mock.calls.some(([, init]) => String(init?.body).includes('"returnTo":"/customer/packages/pkg/plan"'))).toBe(true);
});
it("times out without creating a late server session", async () => {
  let resolve!: (value: unknown) => void;
  mocks.popup.mockReturnValue(new Promise((done) => { resolve = done; }));
  const result = signInWithGoogle();
  const assertion = expect(result).rejects.toMatchObject({reason: "google_timeout"});
  await vi.advanceTimersByTimeAsync(90001); await assertion;
  resolve({user}); await vi.advanceTimersByTimeAsync(0);
  expect(fetch).not.toHaveBeenCalled(); expect(vi.getTimerCount()).toBe(0);
});
it("completes a normal popup login", async () => {
  mocks.popup.mockResolvedValue({user});
  await expect(signInWithGoogle("/customer/packages/pkg/plan")).resolves.toMatchObject({role: "customer"});
  expect(mocks.profile).toHaveBeenCalledWith({});
});
it.each(["auth/popup-closed-by-user", "auth/popup-blocked", "auth/unauthorized-domain"])("preserves the real %s failure", async (code) => {
  mocks.popup.mockRejectedValue({code});
  await expect(signInWithGoogle()).rejects.toEqual({code});
  expect(vi.getTimerCount()).toBe(0);
});

it("cancels on unmount and ignores a late successful popup", async () => {
  const controller = new AbortController();
  let resolve!: (value: unknown) => void;
  mocks.popup.mockReturnValue(new Promise((done) => { resolve = done; }));
  const result = signInWithGoogle("/customer/packages/pkg/plan", controller.signal);
  const assertion = expect(result).rejects.toMatchObject({name: "AbortError"});
  await vi.advanceTimersByTimeAsync(0);
  controller.abort(); await assertion;
  resolve({user}); await vi.advanceTimersByTimeAsync(0);
  expect(fetch).not.toHaveBeenCalled();
  expect(mocks.profile).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});

it("aborts an in-flight session exchange and clears its deadline", async () => {
  mocks.popup.mockResolvedValue({user});
  let sessionSignal: AbortSignal | undefined;
  vi.mocked(fetch).mockImplementation((url, init) => {
    if (String(url).endsWith("csrf")) return Promise.resolve({ok: true, json: async () => ({token: "csrf"})} as Response);
    sessionSignal = init?.signal as AbortSignal;
    return new Promise((_, reject) => sessionSignal!.addEventListener("abort", () => reject(sessionSignal!.reason), {once: true}));
  });
  const controller = new AbortController();
  const result = signInWithGoogle("/customer/packages/pkg/plan", controller.signal);
  const assertion = expect(result).rejects.toMatchObject({name: "AbortError"});
  await vi.advanceTimersByTimeAsync(0);
  expect(sessionSignal).toBeDefined();
  controller.abort(); await assertion;
  expect(sessionSignal?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
