import {fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";
import {readFileSync} from "node:fs";
import {join} from "node:path";

const mocks = vi.hoisted(() => ({replace: vi.fn(), refresh: vi.fn(), register: vi.fn(), email: vi.fn(), google: vi.fn(), favorite: vi.fn()}));
let pathname = "/customer/providers";
let query = new URLSearchParams();
vi.mock("next/navigation", () => ({usePathname: () => pathname, useSearchParams: () => query, useRouter: () => ({replace: mocks.replace, refresh: mocks.refresh})}));
vi.mock("@/lib/auth/client-session", () => ({
  WebAuthenticationError: class extends Error { reason?: string; },
  registerCustomer: mocks.register,
  signInWithEmail: mocks.email,
  signInWithGoogle: mocks.google,
}));
vi.mock("@/components/layout/notification-menu", () => ({NotificationMenu: () => <a href="/customer/notifications">Notifications</a>}));
vi.mock("@/components/auth/logout-button", () => ({LogoutButton: () => <button>Sign Out</button>}));
vi.mock("@/lib/customer/planning/event-venue-client", () => ({searchEventVenues: vi.fn(), getEventVenueDetails: vi.fn()}));
vi.mock("@/app/customer/favorites/actions", () => ({setProviderFavoriteAction: mocks.favorite}));

import {PublicProviderMarketplaceShell} from "@/components/customer/layout/public-provider-marketplace-shell";
import {CustomerAuthLink} from "@/components/customer/layout/customer-auth-provider";
import {ProviderFavoriteControl} from "@/components/customer/favorites/provider-favorite-control";
import CustomerRegistrationPage from "@/app/register/page";

function marketplace(children = <p>Marketplace remains here</p>) {
  return <PublicProviderMarketplaceShell authReturnTo={pathname}>{children}</PublicProviderMarketplaceShell>;
}

function fillRegistration() {
  fireEvent.change(screen.getByLabelText(/^First name/), {target: {value: "Ada"}});
  fireEvent.change(screen.getByLabelText(/^Last name/), {target: {value: "Lovelace"}});
  fireEvent.change(screen.getByLabelText(/^Email address/), {target: {value: "ada@example.test"}});
  fireEvent.change(screen.getByLabelText(/^Password/), {target: {value: "Feasta123!"}});
  fireEvent.change(screen.getByLabelText(/^Confirm password/), {target: {value: "Feasta123!"}});
  fireEvent.click(screen.getByRole("checkbox", {name: /Terms/}));
  fireEvent.click(screen.getByRole("checkbox", {name: /Privacy Policy/}));
}

describe("marketplace hybrid customer authentication", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pathname = "/customer/providers";
    query = new URLSearchParams();
  });

  it("opens header login and switches modes within a single accessible dialog", async () => {
    const user = userEvent.setup();
    render(marketplace());
    await user.click(screen.getByRole("button", {name: "Log in"}));
    expect(await screen.findByRole("dialog", {name: "Welcome!"})).toBeVisible();
    await user.click(screen.getByRole("button", {name: "Create an account"}));
    const dialog = screen.getByRole("dialog", {name: "Create your account"});
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    const details = within(dialog).getByRole("region", {name: "Registration details"});
    expect(details).toHaveClass("min-h-0", "overflow-y-auto", "overscroll-contain");
    expect(details).toHaveAttribute("tabindex", "0");
    const submit = within(dialog).getByRole("button", {name: "Create account"});
    expect(details).not.toContainElement(submit);
    expect(submit.closest("form")).toContainElement(details);
    expect(submit.parentElement).toHaveClass("shrink-0");
    expect(details).not.toContainElement(within(dialog).getByRole("heading", {name: "Create your account"}));
    expect(details).not.toContainElement(within(dialog).getByRole("button", {name: "Close customer authentication"}));
    for (const name of [/^First name/, /^Last name/, /^Email address/, /^Password/, /^Confirm password/]) {
      expect(within(details).getByLabelText(name)).toBeRequired();
    }
    expect(within(dialog).getByRole("checkbox", {name: /Terms/})).toBeVisible();
    expect(within(dialog).getByRole("checkbox", {name: /Privacy Policy/})).toBeVisible();
    await user.click(within(dialog).getByRole("button", {name: "Log in"}));
    expect(screen.getByRole("dialog", {name: "Welcome!"})).toBeVisible();
    expect(screen.queryByRole("region", {name: "Registration details"})).not.toBeInTheDocument();
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    expect(screen.getByText("Marketplace remains here")).toBeInTheDocument();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("opens header signup directly, traps keyboard focus, and restores it after Escape and close", async () => {
    const user = userEvent.setup();
    render(marketplace());
    const signup = screen.getByRole("button", {name: "Sign up"});
    await user.click(signup);
    const dialog = screen.getByRole("dialog", {name: "Create your account"});
    for (let index = 0; index < 18; index += 1) {
      await user.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(signup).toHaveFocus();
    await user.click(signup);
    await user.click(screen.getByRole("button", {name: "Close customer authentication"}));
    await waitFor(() => expect(signup).toHaveFocus());
  });

  it("preserves package filters through signup and the canonical email-verification route", async () => {
    pathname = "/customer/packages";
    query = new URLSearchParams("eventType=birthday");
    mocks.register.mockResolvedValue({verificationEmailSent: true});
    const user = userEvent.setup();
    render(marketplace());
    await user.click(screen.getByRole("button", {name: "Sign up"}));
    fillRegistration();
    await user.click(screen.getByRole("button", {name: "Create account"}));
    await waitFor(() => expect(mocks.register).toHaveBeenCalledWith({firstName: "Ada", lastName: "Lovelace", email: "ada@example.test", password: "Feasta123!", acceptedTerms: true, acceptedPrivacy: true}));
    expect(mocks.replace).toHaveBeenCalledWith("/verify-email?registration=complete&delivery=sent&next=%2Fcustomer%2Fpackages%3FeventType%3Dbirthday");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it.each(["modal", "page"] as const)("uses the same validation and agreement requirements in the %s", async (surface) => {
    const user = userEvent.setup();
    if (surface === "modal") {
      render(marketplace());
      await user.click(screen.getByRole("button", {name: "Sign up"}));
    } else render(<CustomerRegistrationPage />);
    await user.click(screen.getByRole("button", {name: "Create account"}));
    expect(screen.getByLabelText(/^First name/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Accept both agreements to create an account.")).toBeVisible();
    expect(mocks.register).not.toHaveBeenCalled();
  });

  it("retains direct registration next paths and the verification retry flow", async () => {
    query = new URLSearchParams("next=/customer/packages/package_12345678/book");
    mocks.register.mockResolvedValue({verificationEmailSent: false});
    render(<CustomerRegistrationPage />);
    fillRegistration();
    fireEvent.click(screen.getByRole("button", {name: "Create account"}));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/verify-email?registration=complete&delivery=retry&next=%2Fcustomer%2Fpackages%2Fpackage_12345678%2Fbook"));
    const page = readFileSync(join(process.cwd(), "src/app/register/page.tsx"), "utf8");
    const modal = readFileSync(join(process.cwd(), "src/components/customer/providers/customer-login-modal.tsx"), "utf8");
    expect(page).toContain("<CustomerRegistrationForm");
    expect(modal).toContain("<CustomerRegistrationForm");
    expect(page).not.toContain("registerCustomer(");
    expect(modal).not.toContain("registerCustomer(");
  });

  it("keeps registration errors in the dialog and re-enables submission", async () => {
    mocks.register.mockRejectedValue(new Error("registration failed"));
    const user = userEvent.setup();
    render(marketplace());
    await user.click(screen.getByRole("button", {name: "Sign up"}));
    fillRegistration();
    await user.click(screen.getByRole("button", {name: "Create account"}));
    expect(await screen.findByRole("alert")).toBeVisible();
    expect(screen.getByRole("button", {name: "Create account"})).toBeEnabled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("uses the current marketplace query for explicit email login and the server-approved destination", async () => {
    query = new URLSearchParams("category=photographer");
    const destination = "/customer/providers?category=photographer";
    mocks.email.mockResolvedValue({role: "customer", destination});
    const user = userEvent.setup();
    render(marketplace());
    await user.click(screen.getByRole("button", {name: "Log in"}));
    await user.click(screen.getByRole("button", {name: "Log in with email"}));
    fireEvent.change(screen.getByLabelText(/^Email address/), {target: {value: "ada@example.test"}});
    fireEvent.change(screen.getByLabelText(/^Password/), {target: {value: "Feasta123!"}});
    await user.click(within(screen.getByRole("dialog")).getByRole("button", {name: "Log in"}));
    await waitFor(() => expect(mocks.email).toHaveBeenCalledWith("ada@example.test", "Feasta123!", destination));
    expect(mocks.replace).toHaveBeenCalledWith(destination);
    expect(mocks.refresh).toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("opens guest favorite auth at its canonical destination without replaying mutations", async () => {
    const destination = "/customer/providers/provider-one?returnTo=%2Fcustomer%2Fproviders%3Fq%3Devents";
    mocks.google.mockResolvedValue({role: "customer", destination});
    const user = userEvent.setup();
    render(marketplace(<ProviderFavoriteControl providerId="provider-one" providerName="Ana Events" initialFavorited={false} authenticated={false} loginReturnTo={destination} />));
    await user.click(screen.getByRole("link", {name: /Add Ana Events to favorites/}));
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    await user.click(screen.getByRole("button", {name: "Continue with Google"}));
    await waitFor(() => expect(mocks.google).toHaveBeenCalledWith(destination));
    expect(mocks.replace).toHaveBeenCalledWith(destination);
    expect(mocks.favorite).not.toHaveBeenCalled();
  });

  it("carries a protected booking destination through login/register switching", async () => {
    const destination = "/customer/packages/package_12345678/book?eventDate=2099-09-10";
    const user = userEvent.setup();
    mocks.register.mockResolvedValue({verificationEmailSent: true});
    render(marketplace(<CustomerAuthLink href={destination} returnTo={destination}>Continue booking</CustomerAuthLink>));
    await user.click(screen.getByRole("link", {name: "Continue booking"}));
    await user.click(screen.getByRole("button", {name: "Create an account"}));
    fillRegistration();
    await user.click(screen.getByRole("button", {name: "Create account"}));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/verify-email?registration=complete&delivery=sent&next=" + encodeURIComponent(destination)));
  });
});
