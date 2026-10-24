import {act} from "@testing-library/react";
import {describe, expect, it, vi} from "vitest";
import VerifyEmailPage from "@/app/verify-email/page";
import ProviderVerifyEmailPage from "@/app/provider-verify-email/page";
import {useCurrentUserEmail} from "@/components/auth/use-current-user-email";
import {assertHydration} from "../helpers/assert-hydration";

const mocks = vi.hoisted(() => ({
  subscribe: vi.fn(), unsubscribe: vi.fn(),
  listener: null as null | ((user: {email: string} | null) => void),
}));
vi.mock("firebase/auth", () => ({onAuthStateChanged: mocks.subscribe}));
vi.mock("@/lib/firebase/client", () => ({auth: {currentUser: {email: "customer@example.test"}}}));
vi.mock("@/lib/auth/client-session", () => ({
  logoutWebSession: vi.fn(), refreshCurrentUserVerification: vi.fn(), resendCurrentUserVerification: vi.fn(),
}));
vi.mock("@/lib/auth/provider-client", () => ({refreshProviderVerification: vi.fn(), resendProviderVerification: vi.fn()}));
vi.mock("next/navigation", () => ({useRouter: () => ({replace: vi.fn(), refresh: vi.fn()}), useSearchParams: () => new URLSearchParams()}));

describe("verification hydration", () => {
  it.each([VerifyEmailPage, ProviderVerifyEmailPage])("hydrates %s with resolved browser auth and subscribes only after commit", async (Page) => {
    mocks.subscribe.mockReset().mockImplementation((_auth, listener) => {
      listener({email: "customer@example.test"});
      return mocks.unsubscribe;
    });
    mocks.unsubscribe.mockClear();
    await assertHydration(<Page />, (container) => {
      expect(mocks.subscribe).not.toHaveBeenCalled();
      expect(container.textContent).not.toContain("customer@example.test");
    }, () => expect(mocks.subscribe).toHaveBeenCalledTimes(1));
    expect(mocks.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("updates verification identity as Firebase resolves and signs out", async () => {
    mocks.subscribe.mockImplementation((_auth, listener) => {
      mocks.listener = listener;
      return mocks.unsubscribe;
    });
    function Identity() { return <p>{useCurrentUserEmail() ?? "Email resolving"}</p>; }
    await assertHydration(<Identity />, () => {}, (container) => {
      expect(container).toHaveTextContent("Email resolving");
      act(() => mocks.listener?.({email: "customer@example.test"}));
      expect(container).toHaveTextContent("customer@example.test");
      act(() => mocks.listener?.(null));
      expect(container).toHaveTextContent("Email resolving");
    });
  });
});
