import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import {beforeEach, expect, it, vi} from "vitest";
const mocks = vi.hoisted(() => ({call: vi.fn(), google: vi.fn(), replace: vi.fn()}));
vi.mock("@/lib/firebase/client", () => ({functions: {region: "asia-southeast1"}}));
vi.mock("firebase/functions", () => ({httpsCallable: () => mocks.call}));
vi.mock("next/navigation", () => ({useRouter: () => ({replace: mocks.replace, refresh: vi.fn()})}));
vi.mock("@/lib/auth/client-session", () => ({signInWithGoogle: mocks.google, signInWithEmail: vi.fn()}));
import {parseCustomerAgreement, loadCustomerAgreements} from "@/lib/auth/customer-consent";
import {CustomerConsentReview, useCustomerConsent} from "@/components/auth/customer-consent-review";
import {CustomerLoginModal} from "@/components/customer/providers/customer-login-modal";
import {LoginForm} from "@/app/login/login-form";
const agreement = (version = "T-7") => ({code:"legal", name:"Published agreement", summary:"Summary", version, effectiveDate:"2026-10-01", sections:[{title:"Published text", paragraphs:["Actual published content"]}]});
beforeEach(() => {vi.clearAllMocks(); mocks.call.mockImplementation(async ({purpose}) => ({data:{agreement:agreement(purpose === "platform_terms" ? "T-7" : "P-3")}}));});
it("loads independent versions through the public callable", async () => {
 const result = await loadCustomerAgreements(); expect(result.terms.version).toBe("T-7"); expect(result.privacy.version).toBe("P-3"); expect(mocks.call).toHaveBeenCalledTimes(2);
});
it.each([null, {}, {...agreement(), version:" x "}, {...agreement(), version:"x".repeat(101)}, {...agreement(), effectiveDate:"2026-02-30"}, {...agreement(), sections:[]}, {...agreement(), sections:[{title:"Bad", paragraphs:[42]}]}])("rejects malformed documents", value => {expect(() => parseCustomerAgreement(value)).toThrow();});
function Harness() {const consent=useCustomerConsent(); return <><CustomerConsentReview consent={consent}/><button disabled={!consent.input} onClick={() => consent.reject({details:{reason:"policy-version-outdated"}})}>Submit</button></>;}
it("reloads both stale agreements and clears acceptance without automatic submission", async () => {
 render(<Harness/>); await screen.findAllByRole("checkbox");
 const boxes=screen.getAllByRole("checkbox"); boxes.forEach(box => fireEvent.click(box));
 expect(screen.getByRole("button",{name:"Submit"})).toBeEnabled();
 mocks.call.mockImplementation(async () => ({data:{agreement:agreement("new-8")}}));
 fireEvent.click(screen.getByRole("button",{name:"Submit"}));
 await waitFor(() => expect(mocks.call).toHaveBeenCalledTimes(4));
 await waitFor(() => expect(screen.getAllByRole("checkbox")[0]).not.toBeChecked());
 expect(screen.getAllByRole("checkbox")[1]).not.toBeChecked(); expect(screen.getByRole("button",{name:"Submit"})).toBeDisabled();
});
it.each(["consent-required", "policy-version-outdated", "policy-unavailable", "invalid-policy-version"])("Google handles %s with fresh explicit consent", async reason => {
 mocks.google.mockRejectedValueOnce({details:{reason}}).mockResolvedValueOnce({destination:"/customer",role:"customer"});
 render(<LoginForm/>); fireEvent.click(screen.getByRole("button",{name:/continue with google/i}));
 await screen.findAllByRole("checkbox"); expect(mocks.google.mock.calls[0][2]).toBeUndefined();
 fireEvent.click(screen.getByRole("button",{name:/continue with google/i})); expect(mocks.google).toHaveBeenCalledTimes(1);
 screen.getAllByRole("checkbox").forEach(box => fireEvent.click(box));
 fireEvent.click(screen.getByRole("button",{name:/continue with google/i}));
 await waitFor(() => expect(mocks.google).toHaveBeenCalledTimes(2));
 expect(mocks.google.mock.calls[1][2]).toEqual({acceptedTerms:true,acceptedPrivacy:true,termsPolicyVersion:"T-7",privacyPolicyVersion:"P-3"});
});
it("existing Google login uses empty synchronization without loading consent", async () => {
 mocks.google.mockResolvedValueOnce({destination:"/customer",role:"customer"}); render(<LoginForm/>);
 fireEvent.click(screen.getByRole("button",{name:/continue with google/i})); await waitFor(() => expect(mocks.replace).toHaveBeenCalled()); expect(mocks.call).not.toHaveBeenCalled();
});

it("modal Google sign-in requires explicit consent after backend rejection", async () => {
 mocks.google.mockRejectedValueOnce({details:{reason:"consent-required"}});render(<CustomerLoginModal open onClose={() => {}}/>);
 fireEvent.click(screen.getByRole("button",{name:/continue with google/i}));await screen.findAllByRole("checkbox");
 expect(screen.getByRole("button",{name:/continue with google/i})).toBeDisabled();
 screen.getAllByRole("checkbox").forEach(box => fireEvent.click(box));expect(screen.getByRole("button",{name:/continue with google/i})).toBeEnabled();expect(mocks.google).toHaveBeenCalledTimes(1);
});
