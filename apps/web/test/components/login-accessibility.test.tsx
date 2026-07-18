import {render, screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {describe, expect, it, vi} from "vitest";

const auth = vi.hoisted(() => ({
  signInWithEmail: vi.fn(),
  signInWithGoogle: vi.fn(),
}));

vi.mock("next/navigation", () => ({useRouter: () => ({replace: vi.fn(), refresh: vi.fn()})}));
vi.mock("@/lib/auth/client-session", () => ({
  signInWithEmail: auth.signInWithEmail,
  signInWithGoogle: auth.signInWithGoogle,
}));

import LoginPage from "@/app/login/page";

describe("login accessibility", () => {
  it("uses visible labels, autocomplete, logical controls, and a linked safe error", async () => {
    const user = userEvent.setup();
    auth.signInWithEmail.mockRejectedValueOnce(Object.assign(new Error("Firebase internal detail"), {code: "auth/invalid-credential"}));
    render(<LoginPage />);

    const email = screen.getByRole("textbox", {name: /Email address/});
    const password = screen.getByLabelText(/Password/);
    expect(email).toHaveAttribute("autocomplete", "email");
    expect(password).toHaveAttribute("autocomplete", "current-password");
    await user.type(email, "customer@feasta.test");
    await user.type(password, "not-the-password");
    await user.click(screen.getByRole("button", {name: "Sign in"}));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("The email address or password is incorrect.");
    expect(alert).not.toHaveTextContent(/firebase|internal/i);
    expect(alert.closest("section")?.querySelector("form")).toHaveAttribute("aria-describedby", alert.id);
  });
});
