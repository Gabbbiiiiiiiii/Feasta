import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  signIn: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({replace: mocks.replace, refresh: mocks.refresh}),
}));
vi.mock("@/lib/auth/admin-client", () => ({
  signInAdmin: mocks.signIn,
}));
vi.mock("@/lib/auth/client-session", () => ({
  WebAuthenticationError: class WebAuthenticationError extends Error {
    constructor(
      message: string,
      public readonly reason?: string,
    ) {
      super(message);
    }
  },
}));

import {AdminLoginForm} from "@/app/admin-login/admin-login-form";
import {WebAuthenticationError} from "@/lib/auth/client-session";

describe("admin authentication", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates an admin-restricted session without a registration control", async () => {
    const user = userEvent.setup();
    mocks.signIn.mockResolvedValueOnce({
      role: "admin",
      destination: "/admin",
    });
    render(<AdminLoginForm returnTo="/admin/providers" />);

    await user.type(
      screen.getByRole("textbox", {name: /admin email/i}),
      "ADMIN@FEASTA.TEST",
    );
    await user.type(screen.getByLabelText(/^Password/), "FeastaTest!2026");
    await user.click(screen.getByRole("button", {name: /sign in as admin/i}));

    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledWith(
      "ADMIN@FEASTA.TEST",
      "FeastaTest!2026",
      "/admin/providers",
    ));
    expect(mocks.replace).toHaveBeenCalledWith("/admin");
    expect(screen.queryByText(/register|create.*admin/i)).not.toBeInTheDocument();
  });

  it("prevents duplicate submissions while authentication is pending", async () => {
    let finish!: (value: {role: "admin"; destination: string}) => void;
    mocks.signIn.mockReturnValueOnce(new Promise((resolve) => {
      finish = resolve;
    }));
    render(<AdminLoginForm />);
    fireEvent.change(screen.getByRole("textbox", {name: /admin email/i}), {
      target: {value: "admin@feasta.test"},
    });
    fireEvent.change(screen.getByLabelText(/^Password/), {
      target: {value: "FeastaTest!2026"},
    });
    const submit = screen.getByRole("button", {name: /sign in as admin/i});
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(mocks.signIn).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();
    finish({role: "admin", destination: "/admin"});
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/admin"));
  });

  it("uses generic errors and exposes rate-limit recovery without enumeration", async () => {
    const user = userEvent.setup();
    mocks.signIn.mockRejectedValueOnce(
      Object.assign(new Error("auth/user-not-found"), {
        code: "auth/user-not-found",
      }),
    );
    render(<AdminLoginForm />);
    await user.type(
      screen.getByRole("textbox", {name: /admin email/i}),
      "missing@feasta.test",
    );
    await user.type(screen.getByLabelText(/^Password/), "wrong");
    await user.click(screen.getByRole("button", {name: /sign in as admin/i}));
    const generic = await screen.findByRole("alert");
    expect(generic).toHaveTextContent(
      "The credentials could not be verified for admin access.",
    );
    expect(generic).not.toHaveTextContent(/user-not-found|firebase/i);

    mocks.signIn.mockRejectedValueOnce(
      new WebAuthenticationError("hidden", "rate_limited"),
    );
    await user.click(screen.getByRole("button", {name: /sign in as admin/i}));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Too many sign-in attempts",
    );
  });
});
