import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  registerCustomer: vi.fn(),
  signInWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
  requestPasswordReset: vi.fn(),
  inspectPasswordResetCode: vi.fn(),
  completePasswordReset: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mocks.replace,
    refresh: mocks.refresh,
  }),
  useSearchParams: () =>
    new URLSearchParams(),
}));

vi.mock("@/lib/auth/client-session", () => ({
  WebAuthenticationError: class WebAuthenticationError extends Error {
    reason?: string;
  },
  registerCustomer: mocks.registerCustomer,
  signInWithEmail: mocks.signInWithEmail,
  signInWithGoogle: mocks.signInWithGoogle,
  requestPasswordReset: mocks.requestPasswordReset,
  inspectPasswordResetCode: mocks.inspectPasswordResetCode,
  completePasswordReset: mocks.completePasswordReset,
}));

import ForgotPasswordPage from "@/app/forgot-password/page";
import {LoginForm} from "@/app/login/login-form";
import CustomerRegistrationPage from "@/app/register/page";
import {ResetPasswordForm} from "@/app/reset-password/reset-password-form";

describe("customer authentication forms", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("registers only a customer through the trusted workflow", async () => {
    const user = userEvent.setup();
    mocks.registerCustomer.mockResolvedValueOnce({verificationEmailSent: true});
    render(<CustomerRegistrationPage />);

    expect(screen.queryByRole("combobox", {name: /role/i})).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", {name: /first name/i}), {target: {value: "Ada"}});
    fireEvent.change(screen.getByRole("textbox", {name: /last name/i}), {target: {value: "Lovelace"}});
    fireEvent.change(screen.getByRole("textbox", {name: /email address/i}), {target: {value: "ADA@EXAMPLE.TEST"}});
    fireEvent.change(screen.getByLabelText(/^Password/), {target: {value: "Feasta123!"}});
    fireEvent.change(screen.getByLabelText(/Confirm password/), {target: {value: "Feasta123!"}});
    await user.click(screen.getByRole("checkbox", {name: /terms/i}));
    await user.click(screen.getByRole("checkbox", {name: /privacy/i}));
    await user.click(screen.getByRole("button", {name: "Create account"}));

    await waitFor(() => expect(mocks.registerCustomer).toHaveBeenCalledTimes(1));
    expect(mocks.registerCustomer).toHaveBeenCalledWith({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ADA@EXAMPLE.TEST",
      password: "Feasta123!",
      acceptedTerms: true,
      acceptedPrivacy: true,
    });
    expect(mocks.registerCustomer.mock.calls[0][0]).not.toHaveProperty("role");
    expect(mocks.replace).toHaveBeenCalledWith(
      "/verify-email?registration=complete&delivery=sent",
    );
  });

  it("associates registration errors and prevents an invalid submit", async () => {
    const user = userEvent.setup();
    render(<CustomerRegistrationPage />);
    await user.click(screen.getByRole("button", {name: "Create account"}));
    expect(await screen.findAllByRole("alert")).not.toHaveLength(0);
    expect(mocks.registerCustomer).not.toHaveBeenCalled();
    expect(screen.getByRole("textbox", {name: /first name/i})).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("prevents duplicate registration submissions", async () => {
    const user = userEvent.setup();
    let finishRegistration!: (value: {verificationEmailSent: boolean}) => void;
    mocks.registerCustomer.mockReturnValueOnce(new Promise((resolve) => {
      finishRegistration = resolve;
    }));
    render(<CustomerRegistrationPage />);
    fireEvent.change(screen.getByRole("textbox", {name: /first name/i}), {target: {value: "Grace"}});
    fireEvent.change(screen.getByRole("textbox", {name: /last name/i}), {target: {value: "Hopper"}});
    fireEvent.change(screen.getByRole("textbox", {name: /email address/i}), {target: {value: "grace@example.test"}});
    fireEvent.change(screen.getByLabelText(/^Password/), {target: {value: "Feasta123!"}});
    fireEvent.change(screen.getByLabelText(/Confirm password/), {target: {value: "Feasta123!"}});
    await user.click(screen.getByRole("checkbox", {name: /terms/i}));
    await user.click(screen.getByRole("checkbox", {name: /privacy/i}));
    const submit = screen.getByRole("button", {name: "Create account"});
    await user.click(submit);
    await user.click(submit);
    expect(mocks.registerCustomer).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();
    finishRegistration({verificationEmailSent: true});
    await waitFor(() => expect(mocks.replace).toHaveBeenCalled());
  });

  it("uses the server-approved destination after email and Google sign-in", async () => {
    const user = userEvent.setup();
    mocks.signInWithEmail.mockResolvedValueOnce({
      role: "customer",
      destination: "/customer/bookings",
    });
    mocks.signInWithGoogle.mockResolvedValueOnce({
      role: "customer",
      destination: "/customer",
    });
    render(<LoginForm returnTo="/customer/bookings" />);

    await user.click(
      screen.getByRole("button", {
        name: /continue with google/i,
      }),
    );

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/customer",
      )
    );

    await user.click(
      screen.getByRole("button", {
        name: /log in with email/i,
      }),
    );

    fireEvent.change(
      screen.getByRole("textbox", {
        name: /email/i,
      }),
      {
        target: {
          value: "customer@example.test",
        },
      },
    );

    fireEvent.change(
      screen.getByLabelText(/^Password/),
      {
        target: {
          value: "Feasta123!",
        },
      },
    );

    await user.click(
      screen.getByRole("button", {
        name: "Log in",
      }),
    );

    await waitFor(() =>
      expect(mocks.replace).toHaveBeenCalledWith(
        "/customer/bookings",
      )
    );
  });

  it("presents a session-expired state without exposing technical details", () => {
    render(<LoginForm initialNotice="Your session ended. Sign in again to continue." />);
    expect(screen.getByRole("status")).toHaveTextContent("session ended");
    expect(screen.getByRole("status")).not.toHaveTextContent(/cookie|token|firebase/i);
  });

  it("retains mobile-safe sizing and touch targets", () => {
    Object.defineProperty(window, "innerWidth", {configurable: true, value: 360});
    const {container} = render(<CustomerRegistrationPage />);
        expect(container.querySelector("main")).toHaveClass(
      "min-w-0",
      "overflow-x-clip",
      "px-4",
    );
    for (const button of screen.getAllByRole("button")) {
      expect(button.className).toMatch(/min-h-12|size-12/u);
    }
  });

  it("keeps password reset requests privacy preserving", async () => {
    const user = userEvent.setup();
    mocks.requestPasswordReset.mockRejectedValueOnce(
      Object.assign(new Error("not found"), {code: "auth/user-not-found"}),
    );
    render(<ForgotPasswordPage />);
    await user.type(screen.getByRole("textbox", {name: /email/i}), "unknown@example.test");
    await user.click(screen.getByRole("button", {name: /send reset/i}));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "If an account matches that email",
    );
  });

  it("validates and completes a password reset code", async () => {
    const user = userEvent.setup();
    mocks.inspectPasswordResetCode.mockResolvedValueOnce("customer@example.test");
    mocks.completePasswordReset.mockResolvedValueOnce(undefined);
    render(<ResetPasswordForm code="secure-code" />);
    await screen.findByText(/cu•••@example.test/i);
    fireEvent.change(screen.getByLabelText(/^New password/), {target: {value: "Updated123!"}});
    fireEvent.change(screen.getByLabelText(/Confirm new password/), {target: {value: "Updated123!"}});
    await user.click(screen.getByRole("button", {name: /update password/i}));
    await waitFor(() => expect(mocks.completePasswordReset).toHaveBeenCalledWith(
      "secure-code",
      "Updated123!",
    ));
    expect(await screen.findByRole("status")).toHaveTextContent("updated");
  });
});
