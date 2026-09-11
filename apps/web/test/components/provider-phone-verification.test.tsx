import {render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  refresh: vi.fn(),
  clear: vi.fn(),
  createRecaptcha: vi.fn(),
  request: vi.fn(),
  confirm: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mocks.replace,
    refresh: mocks.refresh,
  }),
}));
vi.mock("@/lib/auth/provider-client", () => ({
  createProviderPhoneRecaptcha: mocks.createRecaptcha,
  requestProviderPhoneVerification: mocks.request,
  confirmProviderPhoneVerification: mocks.confirm,
}));

import ProviderPhoneVerificationForm, {
  maskPhone,
} from "@/app/provider-verify-phone/provider-phone-verification-form";

describe("provider phone verification", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createRecaptcha.mockReturnValue({clear: mocks.clear});
    mocks.request.mockResolvedValue({
      verificationId: "verification-one",
      phoneNumber: "+639171234567",
      uid: "provider-one",
    });
    mocks.confirm.mockResolvedValue({
      role: "provider",
      destination: "/provider/onboarding",
    });
  });

  it("renders one heading and masks the registered mobile number", () => {
    render(
      <ProviderPhoneVerificationForm initialPhoneNumber="+639171234567" />,
    );
    expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
    expect(screen.getByText("+63 917 ••• ••67")).toBeInTheDocument();
    expect(maskPhone("+639171234567")).toBe("+63 917 ••• ••67");
  });

  it("sends an SMS, enforces cooldown, and verifies the OTP", async () => {
    const user = userEvent.setup();
    render(
      <ProviderPhoneVerificationForm initialPhoneNumber="+639171234567" />,
    );
    await user.click(screen.getByRole("button", {
      name: "Send verification code",
    }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", {
      name: "Resend available in 60s",
    })).toBeDisabled();
    const code = screen.getByRole("textbox", {
      name: "Verification code digit 1 of 6",
    });
    expect(code).toHaveAttribute("autocomplete", "one-time-code");
    expect(code).toHaveAttribute("inputmode", "numeric");
    await user.type(code, "123456");
    await user.click(screen.getByRole("button", {
      name: "Verify mobile number",
    }));
    await waitFor(() => expect(mocks.confirm).toHaveBeenCalledWith(
      expect.objectContaining({uid: "provider-one"}),
      "123456",
    ));
    expect(mocks.replace).toHaveBeenCalledWith("/provider/onboarding");
  });

  it("validates and normalizes a replacement number before sending", async () => {
    const user = userEvent.setup();
    render(
      <ProviderPhoneVerificationForm initialPhoneNumber="+639171234567" />,
    );
    await user.click(screen.getByRole("button", {
      name: "Send verification code",
    }));
    await screen.findByRole("group", {name: "Verification code"});
    await user.click(screen.getByRole("button", {name: "Use another number"}));
    const phone = screen.getByRole("textbox", {name: "Mobile number"});
    await user.type(phone, "0917-123-4567");
    await user.click(screen.getByRole("button", {
      name: "Send verification code",
    }));
    await waitFor(() => expect(mocks.request).toHaveBeenLastCalledWith(
      expect.anything(),
      "+639171234567",
    ));
    expect(mocks.request).toHaveBeenCalledTimes(2);
  });

  it("shows a safe invalid-code error and keeps the code form available", async () => {
    const user = userEvent.setup();
    mocks.confirm.mockRejectedValueOnce({
      code: "auth/invalid-verification-code",
    });
    render(
      <ProviderPhoneVerificationForm initialPhoneNumber="+639171234567" />,
    );
    await user.click(screen.getByRole("button", {
      name: "Send verification code",
    }));
    const code = await screen.findByRole("textbox", {
      name: "Verification code digit 1 of 6",
    });
    await user.type(code, "111111");
    await user.click(screen.getByRole("button", {
      name: "Verify mobile number",
    }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The verification code is incorrect",
    );
    expect(screen.getByRole("group", {name: "Verification code"}))
      .toBeInTheDocument();
  });

  it("maps an expired verification session to a recovery-safe message", async () => {
    const user = userEvent.setup();
    mocks.request.mockRejectedValueOnce({code: "auth/session-expired"});
    render(
      <ProviderPhoneVerificationForm initialPhoneNumber="+639171234567" />,
    );
    await user.click(screen.getByRole("button", {
      name: "Send verification code",
    }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This verification session expired",
    );
  });

  it("returns an expired authenticated provider session to login", async () => {
    const user = userEvent.setup();
    mocks.request.mockRejectedValueOnce({reason: "session_expired"});
    render(
      <ProviderPhoneVerificationForm initialPhoneNumber="+639171234567" />,
    );
    await user.click(screen.getByRole("button", {
      name: "Send verification code",
    }));
    await waitFor(() => {
      expect(mocks.replace).toHaveBeenCalledWith("/provider-login");
    });
  });
});
