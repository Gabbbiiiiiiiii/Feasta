import {beforeEach, describe, expect, it, vi} from "vitest";
const mocks = vi.hoisted(() => ({signOut: vi.fn(), auth: {}}));
vi.mock("@/lib/firebase/client", () => ({auth: mocks.auth, functions: {}}));
vi.mock("firebase/auth", async (original) => ({...await original<typeof import("firebase/auth")>(), signOut: mocks.signOut}));
import {logoutWebSession} from "@/lib/auth/client-session";

describe("logout client reliability", () => {
  beforeEach(() => {vi.resetAllMocks();});
  it("signs out Firebase after successful server logout", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({token: "csrf"})).mockResolvedValueOnce(Response.json({success: true}));
    await logoutWebSession();
    expect(fetch).toHaveBeenLastCalledWith("/api/auth/logout", {method: "POST", headers: {"x-feasta-csrf": "csrf"}});
    expect(mocks.signOut).toHaveBeenCalledWith(mocks.auth);
  });
  it.each([403, 500, 503])("rejects HTTP %s without signing out the browser identity", async (status) => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({token: "csrf"})).mockResolvedValueOnce(Response.json({error: "failure"}, {status}));
    await expect(logoutWebSession()).rejects.toMatchObject({reason: "logout_failed"});
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
  it("propagates network failure without signing out", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(Response.json({token: "csrf"})).mockRejectedValueOnce(new TypeError("offline"));
    await expect(logoutWebSession()).rejects.toThrow("offline");
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
