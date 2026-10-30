import {beforeEach, describe, expect, it, vi} from "vitest";

const firebase = vi.hoisted(() => ({request: vi.fn(), ready: vi.fn(), check: vi.fn(),
  auth: {currentUser: {} as object | null, authStateReady: vi.fn()}}));
vi.mock("firebase/functions", () => ({httpsCallable: () => firebase.request}));
vi.mock("@/lib/firebase/client", () => ({auth: firebase.auth, functions: {},
  initializeBrowserAppCheck: firebase.check}));
import {adminOccasionErrorMessage, listAdminOccasions} from "@/lib/admin/file-maintenance/admin-occasion-client";

beforeEach(() => {
  vi.resetAllMocks(); firebase.auth.currentUser = {};
  firebase.auth.authStateReady.mockResolvedValue(undefined);
});

describe("occasion callable errors", () => {
  it.each([
    ["functions/not-found", "service is currently unavailable"],
    ["functions/unavailable", "service is currently unavailable"],
    ["functions/unauthenticated", "Sign in again"],
    ["functions/permission-denied", "does not have permission"],
    ["app-check/fetch-status-error", "Browser verification failed"],
    ["functions/deadline-exceeded", "Check your connection"],
    ["auth/network-request-failed", "Check your connection"],
    ["functions/internal", "could not complete the request"],
    ["functions/resource-exhausted", "Too many requests"],
  ])("sanitizes %s", async (code, expected) => {
    firebase.request.mockRejectedValue({code, message: "secret Firebase details"});
    await expect(listAdminOccasions()).rejects.toThrow(expected);
    await expect(listAdminOccasions()).rejects.not.toThrow("secret Firebase details");
  });
  it.each([
    ["CONFIG_UNAVAILABLE", "not initialized or is not stable"],
    ["REVISION_CONFLICT", "catalog changed"],
    ["CATALOG_CAPACITY_EXCEEDED", "cannot be loaded completely"],
    ["OCCASION_NOT_FOUND", "no longer available"],
  ])("preserves the meaning of %s", async (reason, expected) => {
    firebase.request.mockRejectedValue({code: "functions/failed-precondition", details: {reason}});
    await expect(listAdminOccasions()).rejects.toThrow(expected);
  });
  it("stops expired sessions before making a callable request", async () => {
    firebase.auth.currentUser = null;
    await expect(listAdminOccasions()).rejects.toThrow("Sign in again");
    expect(firebase.request).not.toHaveBeenCalled();
  });
  it("sanitizes App Check initialization failures before making a request", async () => {
    firebase.check.mockImplementation(() => {throw new Error("private site key config");});
    await expect(listAdminOccasions()).rejects.toThrow("Browser verification failed");
    expect(firebase.request).not.toHaveBeenCalled();
  });
  it("sanitizes session initialization and unexpected failures", async () => {
    firebase.auth.authStateReady.mockRejectedValue(new Error("private config"));
    await expect(listAdminOccasions()).rejects.toThrow("could not complete the request");
    expect(adminOccasionErrorMessage(null)).toContain("could not complete the request");
    expect(adminOccasionErrorMessage({details: {reason: "toString"}})).toContain("could not complete the request");
  });
});
