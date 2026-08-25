import {act, fireEvent, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  registerIdentity: vi.fn(),
  establishIdentitySession: vi.fn(),
  requestRegistrationPhoneCode: vi.fn(),
  confirmRegistrationPhoneCode: vi.fn(),
  resumePhoneRegistration: vi.fn(),
  resumeExistingProvider: vi.fn(),
  abandonPhoneRegistration: vi.fn(),
  createPhoneRecaptcha: vi.fn(),
  clearPhoneRecaptcha: vi.fn(),
  signIn: vi.fn(),
  registerBusiness: vi.fn(),
  saveDraft: vi.fn(),
  uploadImage: vi.fn(),
  deleteImage: vi.fn(),
  uploadDocument: vi.fn(),
  removeDocument: vi.fn(),
  submitVerification: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mocks.replace,
    push: mocks.push,
    refresh: mocks.refresh,
  }),
}));
vi.mock("@/lib/auth/provider-client", () => ({
  UNVERSIONED_POLICY_VERSION: "unversioned",
  registerProviderIdentity: mocks.registerIdentity,
  establishProviderIdentitySession: mocks.establishIdentitySession,
  createProviderPhoneRecaptcha: mocks.createPhoneRecaptcha,
  requestProviderRegistrationPhoneCode: mocks.requestRegistrationPhoneCode,
  confirmProviderRegistrationPhoneCode: mocks.confirmRegistrationPhoneCode,
  resumeProviderPhoneRegistration: mocks.resumePhoneRegistration,
  resumeExistingProviderAfterPhoneAuth: mocks.resumeExistingProvider,
  abandonProviderPhoneRegistration: mocks.abandonPhoneRegistration,
  signInProvider: mocks.signIn,
  registerProviderBusiness: mocks.registerBusiness,
  saveProviderOnboardingDraft: mocks.saveDraft,
  uploadVerificationDocument: mocks.uploadDocument,
  removeVerificationDocument: mocks.removeDocument,
  submitProviderVerification: mocks.submitVerification,
}));
vi.mock("@/lib/provider/provider-media-client", () => ({
  uploadProviderOnboardingImage: mocks.uploadImage,
  deleteProviderOnboardingImage: mocks.deleteImage,
}));

import ProviderLoginPage from "@/app/provider-login/page";
import {ProviderOnboardingStepForm} from "@/app/provider/onboarding/[step]/provider-onboarding-step-form";
import ProviderRegistrationPage from "@/app/provider-register/page";
import {validateAccountDetails} from "@/app/provider-register/provider-phone-registration-form";
import {ProviderVerificationActions} from "@/app/provider/verification/provider-verification-actions";
import {PROVIDER_ONBOARDING_STEPS} from "@/lib/provider/onboarding";

async function enterOtp(
  user: ReturnType<typeof userEvent.setup>,
  code: string,
) {
  const cells = await screen.findAllByRole(
    "textbox",
    {name: /digit \d of 6/i},
  );
  for (const [index, digit] of [...code].entries()) {
    await user.type(cells[index], digit);
  }
}

describe("provider authentication and onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resumePhoneRegistration.mockResolvedValue(null);
    mocks.abandonPhoneRegistration.mockResolvedValue(undefined);
    mocks.createPhoneRecaptcha.mockImplementation(() => ({
      clear: mocks.clearPhoneRecaptcha,
    }));
    mocks.establishIdentitySession.mockResolvedValue({
      role: "provider",
      destination: "/provider",
    });
    URL.createObjectURL = vi.fn(() => "blob:provider-preview");
    URL.revokeObjectURL = vi.fn();
  });

  it("validates Phase C password confirmation independently", () => {
    expect(validateAccountDetails({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.test",
      password: "Feasta123!",
      confirmPassword: "Different123!",
      phoneNumber: "+639171234567",
      acceptedTerms: true,
      acceptedPrivacy: true,
    })).toMatchObject({
      confirmPassword: "Passwords do not match.",
    });
  });

  it("keeps the secure resume check in a polished loading state", async () => {
    let finishResume!: (value: null) => void;
    mocks.resumePhoneRegistration.mockImplementationOnce(
      () => new Promise<null>((resolve) => {
        finishResume = resolve;
      }),
    );

    render(<ProviderRegistrationPage />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Preparing secure registration...",
    );
    expect(screen.getByRole("status")).toHaveClass("min-h-[360px]");
    expect(mocks.resumePhoneRegistration).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("textbox", {name: /mobile number/i}))
      .not.toBeInTheDocument();

    finishResume(null);
    expect(await screen.findByRole("textbox", {name: /mobile number/i}))
      .toBeInTheDocument();
  });

  it("resets a recoverable verifier failure for the next explicit attempt", async () => {
    const user = userEvent.setup();
    const confirmation = {confirm: vi.fn()};
    mocks.createPhoneRecaptcha.mockImplementation(() => {
      document.getElementById("provider-registration-phone-recaptcha")
        ?.append(document.createElement("iframe"));
      return {clear: mocks.clearPhoneRecaptcha};
    });
    mocks.requestRegistrationPhoneCode
      .mockImplementationOnce(async (_phone, createVerifier) => {
        createVerifier();
        throw {code: "auth/captcha-check-failed"};
      })
      .mockImplementationOnce(async (_phone, createVerifier) => {
        createVerifier();
        return {confirmation, phoneNumber: "+639171234567"};
      });
    render(<ProviderRegistrationPage />);
    const mobile = await screen.findByRole("textbox", {name: /mobile number/i});
    await user.type(mobile, "9171234567");
    await user.click(screen.getByRole("button", {name: /send verification code/i}));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /security verification was reset/i,
    );
    expect(mocks.requestRegistrationPhoneCode).toHaveBeenCalledTimes(1);
    expect(mocks.clearPhoneRecaptcha).toHaveBeenCalledTimes(1);
    expect(document.getElementById("provider-registration-phone-recaptcha"))
      .toBeEmptyDOMElement();

    await user.click(screen.getByRole("button", {name: /send verification code/i}));
    expect(await screen.findByRole("heading", {
      name: /verify your mobile number/i,
    })).toBeInTheDocument();
    expect(mocks.requestRegistrationPhoneCode).toHaveBeenCalledTimes(2);
    expect(mocks.createPhoneRecaptcha).toHaveBeenCalledTimes(2);
  });

  it("allows only one initial SMS request while send is pending", async () => {
    let finishSend!: (value: {
      confirmation: {confirm: ReturnType<typeof vi.fn>};
      phoneNumber: string;
    }) => void;
    const confirmation = {confirm: vi.fn()};
    mocks.requestRegistrationPhoneCode.mockImplementationOnce(
      async (_phone, createVerifier) => {
        createVerifier();
        return new Promise((resolve) => {
          finishSend = resolve;
        });
      },
    );
    render(<ProviderRegistrationPage />);
    const mobile = await screen.findByRole("textbox", {name: /mobile number/i});
    fireEvent.change(mobile, {target: {value: "9171234567"}});
    const sendButton = screen.getByRole("button", {name: /send verification code/i});
    const phoneForm = sendButton.closest("form");
    expect(phoneForm).not.toBeNull();

    fireEvent.click(sendButton);
    fireEvent.click(sendButton);
    fireEvent.submit(phoneForm!);

    expect(mocks.requestRegistrationPhoneCode).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", {name: /sending code/i})).toBeDisabled();

    finishSend({confirmation, phoneNumber: "+639171234567"});
    expect(await screen.findByRole("heading", {
      name: /verify your mobile number/i,
    })).toBeInTheDocument();
  });

  it("keeps resend and code-expiry clocks separate and resends only on click", async () => {
    vi.useFakeTimers();
    try {
      const firstConfirmation = {confirm: vi.fn()};
      const secondConfirmation = {confirm: vi.fn()};
      mocks.requestRegistrationPhoneCode
        .mockImplementationOnce(async (_phone, createVerifier) => {
          createVerifier();
          return {
            confirmation: firstConfirmation,
            phoneNumber: "+639171234567",
          };
        })
        .mockImplementationOnce(async (_phone, createVerifier) => {
          createVerifier();
          return {
            confirmation: secondConfirmation,
            phoneNumber: "+639171234567",
          };
        });
      mocks.confirmRegistrationPhoneCode.mockResolvedValueOnce({
        classification: "auth_only",
        phoneNumber: "+639171234567",
        resolution: {
          state: "email_credential_link_required",
          resumable: true,
          collision: "none",
          recoveryAction: "link_email_credential",
        },
      });
      render(<ProviderRegistrationPage />);
      await act(async () => undefined);
      fireEvent.change(screen.getByRole("textbox", {name: /mobile number/i}), {
        target: {value: "9171234567"},
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", {name: /send verification code/i}));
      });

      expect(screen.getByRole("button", {name: "Resend code in 01:00"}))
        .toBeDisabled();
      expect(screen.getByText("Code expires in 05:00.")).toBeInTheDocument();

      for (let second = 0; second < 60; second += 1) {
        await act(async () => vi.advanceTimersByTime(1000));
      }

      const resendButton = screen.getByRole("button", {name: "Resend code"});
      expect(resendButton).toBeEnabled();
      expect(screen.getByText("Code expires in 04:00.")).toBeInTheDocument();
      expect(mocks.requestRegistrationPhoneCode).toHaveBeenCalledTimes(1);

      await act(async () => {
        fireEvent.click(resendButton);
      });
      expect(mocks.requestRegistrationPhoneCode).toHaveBeenCalledTimes(2);
      expect(screen.getByRole("button", {name: "Resend code in 01:00"}))
        .toBeDisabled();
      expect(screen.getByText("Code expires in 05:00.")).toBeInTheDocument();
      expect(screen.getAllByRole("textbox", {name: /digit \d of 6/i})
        .every((cell) => (cell as HTMLInputElement).value === ""))
        .toBe(true);

      const cells = screen.getAllByRole("textbox", {name: /digit \d of 6/i});
      for (const [index, digit] of [..."123456"].entries()) {
        fireEvent.change(cells[index], {target: {value: digit}});
      }
      await act(async () => {
        fireEvent.click(screen.getByRole("button", {name: /verify mobile number/i}));
      });
      expect(mocks.confirmRegistrationPhoneCode).toHaveBeenCalledWith(
        secondConfirmation,
        "123456",
        "+639171234567",
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("applies an in-memory backoff for authoritative rate limits", async () => {
    const localStorageSpy = vi.spyOn(Storage.prototype, "setItem");
    mocks.requestRegistrationPhoneCode.mockRejectedValueOnce({
      code: "auth/too-many-requests",
    });
    render(<ProviderRegistrationPage />);
    fireEvent.change(
      await screen.findByRole("textbox", {name: /mobile number/i}),
      {target: {value: "9171234567"}},
    );
    fireEvent.click(screen.getByRole("button", {name: /send verification code/i}));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /wait a while before requesting another code/i,
    );
    expect(screen.getByRole("button", {name: "Try again in 01:00"}))
      .toBeDisabled();
    expect(screen.getByText(/may need to wait longer/i)).toBeInTheDocument();
    expect(screen.queryByText(/attempt \d+ of \d+/i)).not.toBeInTheDocument();
    expect(localStorageSpy).not.toHaveBeenCalled();
    localStorageSpy.mockRestore();
  });

  it("clears resend cooldown and local backoff when changing number", async () => {
    vi.useFakeTimers();
    try {
      const confirmation = {confirm: vi.fn()};
      mocks.requestRegistrationPhoneCode
        .mockImplementationOnce(async (_phone, createVerifier) => {
          createVerifier();
          return {confirmation, phoneNumber: "+639171234567"};
        })
        .mockRejectedValueOnce({code: "auth/too-many-requests"})
        .mockImplementationOnce(async (_phone, createVerifier) => {
          createVerifier();
          return {confirmation, phoneNumber: "+639181234567"};
        });
      render(<ProviderRegistrationPage />);
      await act(async () => undefined);
      fireEvent.change(screen.getByRole("textbox", {name: /mobile number/i}), {
        target: {value: "9171234567"},
      });
      await act(async () => {
        fireEvent.click(screen.getByRole("button", {name: /send verification code/i}));
      });
      for (let second = 0; second < 60; second += 1) {
        await act(async () => vi.advanceTimersByTime(1000));
      }

      await act(async () => {
        fireEvent.click(screen.getByRole("button", {name: "Resend code"}));
      });
      expect(screen.getByRole("button", {name: "Try again in 01:00"}))
        .toBeDisabled();

      fireEvent.click(screen.getByRole("button", {name: /change number/i}));
      const mobile = screen.getByRole("textbox", {name: /mobile number/i});
      const sendButton = screen.getByRole("button", {
        name: /send verification code/i,
      });
      expect(sendButton).toBeEnabled();
      expect(screen.queryByText(/requests are temporarily paused/i))
        .not.toBeInTheDocument();

      fireEvent.change(mobile, {target: {value: "9181234567"}});
      await act(async () => {
        fireEvent.click(sendButton);
      });
      expect(mocks.requestRegistrationPhoneCode).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("cleans the verifier on change-number, OTP success, and unmount", async () => {
    const user = userEvent.setup();
    const confirmation = {confirm: vi.fn()};
    mocks.requestRegistrationPhoneCode.mockImplementation(
      async (_phone, createVerifier) => {
        createVerifier();
        return {confirmation, phoneNumber: "+639171234567"};
      },
    );
    mocks.confirmRegistrationPhoneCode.mockResolvedValueOnce({
      classification: "auth_only",
      phoneNumber: "+639171234567",
      resolution: {
        state: "email_credential_link_required",
        resumable: true,
        collision: "none",
        recoveryAction: "link_email_credential",
      },
    });
    const rendered = render(<ProviderRegistrationPage />);
    const mobile = await screen.findByRole("textbox", {name: /mobile number/i});
    await user.type(mobile, "9171234567");
    await user.click(screen.getByRole("button", {name: /send verification code/i}));
    await user.click(await screen.findByRole("button", {name: /change number/i}));
    expect(mocks.clearPhoneRecaptcha).toHaveBeenCalledTimes(1);

    await user.clear(screen.getByRole("textbox", {name: /mobile number/i}));
    await user.type(screen.getByRole("textbox", {name: /mobile number/i}), "9171234567");
    await user.click(screen.getByRole("button", {name: /send verification code/i}));
    await enterOtp(user, "123456");
    await user.click(screen.getByRole("button", {name: /verify mobile number/i}));
    await screen.findByRole("heading", {name: /complete your provider account/i});
    expect(mocks.clearPhoneRecaptcha).toHaveBeenCalledTimes(2);

    rendered.unmount();
    expect(mocks.clearPhoneRecaptcha).toHaveBeenCalledTimes(2);
  });

  it("cleans an active verifier when registration unmounts", async () => {
    const user = userEvent.setup();
    mocks.requestRegistrationPhoneCode.mockImplementationOnce(
      async (_phone, createVerifier) => {
        createVerifier();
        return {confirmation: {confirm: vi.fn()}, phoneNumber: "+639171234567"};
      },
    );
    const rendered = render(<ProviderRegistrationPage />);
    await user.type(
      await screen.findByRole("textbox", {name: /mobile number/i}),
      "9171234567",
    );
    await user.click(screen.getByRole("button", {name: /send verification code/i}));
    await screen.findByRole("heading", {name: /verify your mobile number/i});

    rendered.unmount();
    expect(mocks.clearPhoneRecaptcha).toHaveBeenCalledTimes(1);
  });

  it("reveals registered-provider state only after trusted OTP classification", async () => {
    const user = userEvent.setup();
    const confirmation = {confirm: vi.fn()};
    mocks.requestRegistrationPhoneCode.mockResolvedValueOnce({
      confirmation,
      phoneNumber: "+639171234567",
    });
    mocks.confirmRegistrationPhoneCode.mockResolvedValueOnce({
      classification: "registered_provider",
      phoneNumber: "+639171234567",
      resolution: {
        state: "registration_complete",
        resumable: true,
        collision: "none",
        recoveryAction: "resume_existing_provider",
      },
    });
    mocks.resumeExistingProvider.mockResolvedValueOnce({
      role: "provider",
      destination: "/provider/status",
    });
    render(<ProviderRegistrationPage />);

    expect(screen.queryByText(/already registered/i)).not.toBeInTheDocument();
    await user.type(
      await screen.findByRole("textbox", {name: /mobile number/i}),
      "9171234567",
    );
    await user.click(screen.getByRole("button", {name: /send verification code/i}));
    expect(screen.queryByText(/already registered/i)).not.toBeInTheDocument();
    await enterOtp(user, "123456");
    await user.click(screen.getByRole("button", {name: /verify mobile number/i}));

    expect(await screen.findByRole("heading", {
      name: /mobile number already registered/i,
    })).toBeInTheDocument();
    expect(mocks.resumeExistingProvider).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", {
      name: /continue to provider account/i,
    }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(
      "/provider/status",
    ));
    expect(mocks.registerIdentity).not.toHaveBeenCalled();
  });

  it("offers trusted resume UX for an incomplete provider identity", async () => {
    mocks.resumePhoneRegistration.mockResolvedValueOnce({
      classification: "provider_identity",
      phoneNumber: "+639171234567",
      resolution: {
        state: "registration_complete",
        resumable: true,
        collision: "none",
        recoveryAction: "resume_existing_provider",
      },
    });
    mocks.resumeExistingProvider.mockResolvedValueOnce({
      role: "provider",
      destination: "/provider/onboarding",
    });
    render(<ProviderRegistrationPage />);

    expect(await screen.findByRole("heading", {
      name: /registration already started/i,
    })).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", {
      name: /continue registration/i,
    }));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(
      "/provider/onboarding",
    ));
    expect(mocks.registerIdentity).not.toHaveBeenCalled();
  });

  it("fails malformed relationships closed without attempting repair", async () => {
    mocks.resumePhoneRegistration.mockResolvedValueOnce({
      classification: "malformed_provider_relationship",
      phoneNumber: "+639171234567",
      resolution: {
        state: "account_unavailable",
        resumable: false,
        collision: "provider_relationship_invalid",
        recoveryAction: "contact_support",
      },
    });
    render(<ProviderRegistrationPage />);

    expect(await screen.findByRole("heading", {
      name: /couldn't safely continue/i,
    })).toBeInTheDocument();
    expect(screen.getByText(/contact FEASTA support or use another number/i))
      .toBeInTheDocument();
    expect(mocks.abandonPhoneRegistration).toHaveBeenCalledTimes(1);
    expect(mocks.resumeExistingProvider).not.toHaveBeenCalled();
    expect(mocks.registerIdentity).not.toHaveBeenCalled();
  });

  it("starts net-new provider registration with normalized phone auth", async () => {
    const user = userEvent.setup();
    const confirmation = {confirm: vi.fn()};
    mocks.requestRegistrationPhoneCode.mockImplementationOnce(
      async (_phone: string, createVerifier: () => unknown) => {
        createVerifier();
        return {confirmation, phoneNumber: "+639171234567"};
      },
    );
    render(<ProviderRegistrationPage />);

    const mobile = await screen.findByRole("textbox", {name: /mobile number/i});
    await user.type(mobile, "0917-123-4567");
    await user.click(screen.getByRole("button", {name: /send verification code/i}));

    await waitFor(() => expect(mocks.requestRegistrationPhoneCode)
      .toHaveBeenCalledWith("+639171234567", expect.any(Function)));
    expect(screen.getByRole("heading", {name: /verify your mobile number/i}))
      .toBeInTheDocument();
    expect(screen.getAllByRole("textbox", {name: /digit \d of 6/i}))
      .toHaveLength(6);
    expect(mocks.registerIdentity).not.toHaveBeenCalled();
  });

  it("rejects malformed phone input before Firebase phone auth", async () => {
    const user = userEvent.setup();
    render(<ProviderRegistrationPage />);
    const mobile = await screen.findByRole("textbox", {name: /mobile number/i});
    await user.type(mobile, "(053) 123 4567");
    await user.click(screen.getByRole("button", {name: /send verification code/i}));

    expect(mobile).toHaveAccessibleDescription(
      "Enter a valid Philippine mobile number.",
    );
    expect(mocks.requestRegistrationPhoneCode).not.toHaveBeenCalled();
  });

  it("confirms OTP and opens the Phase C account-details checkpoint", async () => {
    const user = userEvent.setup();
    const confirmation = {confirm: vi.fn()};
    mocks.requestRegistrationPhoneCode.mockResolvedValueOnce({
      confirmation,
      phoneNumber: "+639171234567",
    });
    mocks.confirmRegistrationPhoneCode.mockResolvedValueOnce({
      classification: "auth_only",
      phoneNumber: "+639171234567",
      resolution: {
        state: "email_credential_link_required",
        resumable: true,
        collision: "none",
        recoveryAction: "link_email_credential",
      },
    });
    render(<ProviderRegistrationPage />);
    await user.type(
      await screen.findByRole("textbox", {name: /mobile number/i}),
      "9171234567",
    );
    await user.click(screen.getByRole("button", {name: /send verification code/i}));
    await enterOtp(user, "123456");
    await user.click(screen.getByRole("button", {name: /verify mobile number/i}));

    await waitFor(() => expect(mocks.confirmRegistrationPhoneCode)
      .toHaveBeenCalledWith(confirmation, "123456", "+639171234567"));
    expect(screen.getByRole("heading", {name: /complete your provider account/i}))
      .toBeInTheDocument();
    expect(screen.getByRole("textbox", {name: /email address/i}))
      .toBeInTheDocument();
    expect(screen.getByLabelText(/^password/i)).toBeInTheDocument();
    expect(mocks.registerIdentity).not.toHaveBeenCalled();
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("validates all Phase C account details and separate consents", async () => {
    mocks.resumePhoneRegistration.mockResolvedValueOnce({
      classification: "auth_only",
      phoneNumber: "+639171234567",
      resolution: {
        state: "email_credential_link_required",
        resumable: true,
        collision: "none",
        recoveryAction: "link_email_credential",
      },
    });
    render(<ProviderRegistrationPage />);
    await userEvent.setup().click(await screen.findByRole("button", {
      name: /complete provider account/i,
    }));

    expect(screen.getByLabelText(/first name/i)).toHaveAccessibleDescription(
      "Enter your first name.",
    );
    expect(screen.getByLabelText(/last name/i)).toHaveAccessibleDescription(
      "Enter your last name.",
    );
    expect(screen.getByLabelText(/email address/i)).toHaveAccessibleDescription(
      "Enter a valid email address.",
    );
    expect(screen.getByLabelText(/^password/i)).toHaveAccessibleDescription(
      expect.stringMatching(/at least 8 characters/i),
    );
    expect(screen.getByLabelText(/I accept the Terms/i)).toHaveAccessibleDescription(
      "Accept the Terms to continue.",
    );
    expect(screen.getByLabelText(/I accept the Privacy Policy/i)).toHaveAccessibleDescription(
      "Accept the Privacy Policy to continue.",
    );
    expect(mocks.registerIdentity).not.toHaveBeenCalled();
  });

  it("establishes the Phase D provider session after Phase C and routes home", async () => {
    const user = userEvent.setup();
    mocks.resumePhoneRegistration.mockResolvedValueOnce({
      classification: "auth_only",
      phoneNumber: "+639171234567",
      resolution: {
        state: "email_credential_link_required",
        resumable: true,
        collision: "none",
        recoveryAction: "link_email_credential",
      },
    });
    mocks.registerIdentity.mockResolvedValueOnce({
      verificationEmailSent: true,
      emailVerified: false,
      credentialLinked: true,
    });
    render(<ProviderRegistrationPage />);
    await screen.findByRole("heading", {name: /complete your provider account/i});
    await user.type(screen.getByLabelText(/first name/i), "Ada");
    await user.type(screen.getByLabelText(/last name/i), "Lovelace");
    await user.type(screen.getByLabelText(/email address/i), "ADA@EXAMPLE.TEST");
    await user.type(screen.getByLabelText(/^password/i), "Feasta123!");
    await user.type(screen.getByLabelText(/confirm password/i), "Feasta123!");
    await user.click(screen.getByLabelText(/I accept the Terms/i));
    await user.click(screen.getByLabelText(/I accept the Privacy Policy/i));
    await user.click(screen.getByRole("button", {name: /complete provider account/i}));

    await waitFor(() => expect(mocks.registerIdentity).toHaveBeenCalledWith({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ADA@EXAMPLE.TEST",
      password: "Feasta123!",
      phoneNumber: "+639171234567",
      acceptedTerms: true,
      acceptedPrivacy: true,
      termsPolicyVersion: "unversioned",
      privacyPolicyVersion: "unversioned",
    }));
    expect(mocks.establishIdentitySession).toHaveBeenCalledTimes(1);
    expect(mocks.replace).toHaveBeenCalledWith("/provider");
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });

  it("resumes after refresh when the password provider linked before identity creation", async () => {
    mocks.resumePhoneRegistration.mockResolvedValueOnce({
      classification: "auth_only",
      phoneNumber: "+639171234567",
      resolution: {
        state: "provider_identity_required",
        resumable: true,
        collision: "none",
        recoveryAction: "complete_provider_identity",
      },
    });

    render(<ProviderRegistrationPage />);

    expect(await screen.findByRole("heading", {
      name: /complete your provider account/i,
    })).toBeInTheDocument();
    expect(screen.getByRole("textbox", {name: /email address/i}))
      .toBeInTheDocument();
    expect(mocks.requestRegistrationPhoneCode).not.toHaveBeenCalled();
    expect(mocks.resumeExistingProvider).not.toHaveBeenCalled();
  });

  it("shows safe email collision recovery without creating a session", async () => {
    const user = userEvent.setup();
    mocks.resumePhoneRegistration.mockResolvedValueOnce({
      classification: "auth_only",
      phoneNumber: "+639171234567",
      resolution: {
        state: "email_credential_link_required",
        resumable: true,
        collision: "none",
        recoveryAction: "link_email_credential",
      },
    });
    mocks.registerIdentity.mockRejectedValueOnce({
      code: "auth/credential-already-in-use",
      message: "other-uid-sensitive-detail",
    });
    render(<ProviderRegistrationPage />);
    await screen.findByRole("heading", {name: /complete your provider account/i});
    await user.type(screen.getByLabelText(/first name/i), "Ada");
    await user.type(screen.getByLabelText(/last name/i), "Lovelace");
    await user.type(screen.getByLabelText(/email address/i), "used@example.test");
    await user.type(screen.getByLabelText(/^password/i), "Feasta123!");
    await user.type(screen.getByLabelText(/confirm password/i), "Feasta123!");
    await user.click(screen.getByLabelText(/I accept the Terms/i));
    await user.click(screen.getByLabelText(/I accept the Privacy Policy/i));
    await user.click(screen.getByRole("button", {name: /complete provider account/i}));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/already associated with another account/i);
    expect(alert).not.toHaveTextContent(/other-uid/i);
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.resumeExistingProvider).not.toHaveBeenCalled();
  });

  it("shows trusted existing-provider UX before continuing to its destination", async () => {
    mocks.resumePhoneRegistration.mockResolvedValueOnce({
      classification: "registered_provider",
      phoneNumber: "+639171234567",
      resolution: {
        state: "registration_complete",
        resumable: true,
        collision: "none",
        recoveryAction: "resume_existing_provider",
      },
    });
    mocks.resumeExistingProvider.mockResolvedValueOnce({
      role: "provider",
      destination: "/provider",
    });

    render(<ProviderRegistrationPage />);

    expect(await screen.findByRole("heading", {
      name: /mobile number already registered/i,
    })).toBeInTheDocument();
    expect(mocks.resumeExistingProvider).not.toHaveBeenCalled();
    await userEvent.setup().click(screen.getByRole("button", {
      name: /continue to provider account/i,
    }));
    await waitFor(() => expect(mocks.resumeExistingProvider).toHaveBeenCalled());
    expect(mocks.replace).toHaveBeenCalledWith("/provider");
    expect(mocks.registerIdentity).not.toHaveBeenCalled();
  });

  it("fails closed and signs out a non-provider phone account", async () => {
    mocks.resumePhoneRegistration.mockResolvedValueOnce({
      classification: "non_provider_account",
      phoneNumber: "+639171234567",
      resolution: {
        state: "account_collision",
        resumable: false,
        collision: "phone_belongs_to_non_provider",
        recoveryAction: "use_correct_feasta_portal",
      },
    });

    render(<ProviderRegistrationPage />);

    expect(await screen.findByRole("heading", {
      name: /mobile number already in use/i,
    })).toBeInTheDocument();
    const description = screen.getByText(/another FEASTA account/i);
    expect(description).not.toHaveTextContent(/\bcustomer\b|\badmin\b/i);
    expect(screen.getAllByRole("link", {name: /^log in$/i})
      .find((link) => link.getAttribute("href") === "/login"))
      .toBeDefined();
    expect(mocks.abandonPhoneRegistration).toHaveBeenCalledTimes(1);
    expect(mocks.registerIdentity).not.toHaveBeenCalled();
  });

  it("shows a safe error for an invalid OTP", async () => {
    const user = userEvent.setup();
    const confirmation = {confirm: vi.fn()};
    mocks.requestRegistrationPhoneCode.mockResolvedValueOnce({
      confirmation,
      phoneNumber: "+639171234567",
    });
    mocks.confirmRegistrationPhoneCode.mockRejectedValueOnce({
      code: "auth/invalid-verification-code",
    });
    render(<ProviderRegistrationPage />);
    await user.type(
      await screen.findByRole("textbox", {name: /mobile number/i}),
      "9171234567",
    );
    await user.click(screen.getByRole("button", {name: /send verification code/i}));
    await enterOtp(user, "654321");
    await user.click(screen.getByRole("button", {name: /verify mobile number/i}));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      /verification code is incorrect/i,
    );
    expect(screen.queryByText(/auth\/invalid-verification-code/i))
      .not.toBeInTheDocument();
    expect(screen.getAllByRole("textbox", {name: /digit \d of 6/i})
      .map((cell) => (cell as HTMLInputElement).value).join(""))
      .toBe("654321");
    expect(screen.getByRole("button", {name: /verify mobile number/i}))
      .toBeEnabled();
    for (const cell of screen.getAllByRole("textbox", {name: /digit \d of 6/i})) {
      expect(cell).toBeEnabled();
    }
  });

  it("disables the OTP group while the existing confirmation is in flight", async () => {
    const user = userEvent.setup();
    const confirmation = {confirm: vi.fn()};
    let finishConfirmation!: (value: {
      classification: "auth_only";
      phoneNumber: string;
      resolution: {
        state: "email_credential_link_required";
        resumable: true;
        collision: "none";
        recoveryAction: "link_email_credential";
      };
    }) => void;
    mocks.requestRegistrationPhoneCode.mockResolvedValueOnce({
      confirmation,
      phoneNumber: "+639171234567",
    });
    mocks.confirmRegistrationPhoneCode.mockImplementationOnce(
      () => new Promise((resolve) => {
        finishConfirmation = resolve;
      }),
    );
    render(<ProviderRegistrationPage />);
    await user.type(
      await screen.findByRole("textbox", {name: /mobile number/i}),
      "9171234567",
    );
    await user.click(screen.getByRole("button", {name: /send verification code/i}));
    await enterOtp(user, "123456");
    await user.click(screen.getByRole("button", {name: /verify mobile number/i}));

    fireEvent.submit(screen.getByRole("button", {
      name: /verifying code/i,
    }).closest("form")!);
    expect(mocks.confirmRegistrationPhoneCode).toHaveBeenCalledTimes(1);

    await waitFor(() => {
      for (const cell of screen.getAllByRole("textbox", {name: /digit \d of 6/i})) {
        expect(cell).toBeDisabled();
      }
    });

    finishConfirmation({
      classification: "auth_only",
      phoneNumber: "+639171234567",
      resolution: {
        state: "email_credential_link_required",
        resumable: true,
        collision: "none",
        recoveryAction: "link_email_credential",
      },
    });
    expect(await screen.findByRole("heading", {
      name: /complete your provider account/i,
    })).toBeInTheDocument();
  });

  it("renders the phone-first provider registration hierarchy accessibly", async () => {
    const {container} = render(<ProviderRegistrationPage />);
    await screen.findByRole("textbox", {name: /mobile number/i});
    expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
    expect(screen.getByRole("heading", {
      level: 1,
      name: "Grow your event business with FEASTA.",
    })).toBeInTheDocument();
    expect(screen.getByRole("link", {name: "Login"})).toHaveAttribute(
      "href",
      "/provider-login",
    );
    expect(screen.getByRole("button", {
      name: "Send verification code",
    })).toHaveClass("rounded-[10px]");
    expect(screen.getByPlaceholderText("9XXXXXXXXX").parentElement).toHaveClass(
      "rounded-[10px]",
    );
    expect(screen.getByPlaceholderText("9XXXXXXXXX"))
      .toHaveAccessibleName(/mobile number/i);
    expect(screen.getByText("Reach more customers")).toBeInTheDocument();
    expect(screen.getByText("Verify mobile number"))
      .toBeInTheDocument();
    expect(container.querySelectorAll("label.sr-only")).toHaveLength(0);
    expect(screen.queryByRole("textbox", {name: /email address/i}))
      .not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^password/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", {name: /business name/i}))
      .not.toBeInTheDocument();
  });

  it("uses a provider-only secure session destination", async () => {
    const user = userEvent.setup();
    mocks.signIn.mockResolvedValueOnce({
      role: "provider",
      destination: "/provider",
    });
    render(<ProviderLoginPage />);
    fireEvent.change(screen.getByRole("textbox", {name: /email address/i}), {target: {value: "provider@example.test"}});
    fireEvent.change(screen.getByLabelText(/^Password/), {target: {value: "Feasta123!"}});
    await user.click(screen.getByRole("button", {name: /^log in$/i}));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/provider"));
  });

  it("renders the provider portal login hierarchy with scoped controls", () => {
    const {container} = render(<ProviderLoginPage />);
    expect(screen.getAllByRole("heading", {level: 1})).toHaveLength(1);
    expect(screen.getByRole("heading", {
      level: 1,
      name: "Welcome back",
    })).toBeInTheDocument();
    expect(screen.getByText(
      "Sign in to your Feasta provider account.",
    )).toBeInTheDocument();
    expect(screen.getByRole("textbox", {
      name: /email address/i,
    })).toHaveClass("rounded-[10px]");
    expect(screen.getByLabelText(/^Password/)).toHaveClass("rounded-[10px]");
    expect(screen.getByRole("button", {name: /^log in$/i})).toHaveClass(
      "rounded-[10px]",
    );
    expect(screen.getByRole("link", {name: /forgot password/i})).toHaveAttribute(
      "href",
      "/forgot-password",
    );
    expect(screen.getByRole("link", {name: /become a provider/i})).toHaveAttribute(
      "href",
      "/provider-register",
    );
    expect(container.querySelector("[fdprocessedid]")).toBeNull();
    expect(screen.queryByRole("button", {name: /google|phone/i})).not.toBeInTheDocument();
  });

  it("uses the scoped orange provider Login link without a pill or arrow", () => {
    render(<ProviderRegistrationPage />);
    const loginLink = screen.getByRole("link", {name: "Login"});
    expect(loginLink).toHaveAttribute("href", "/provider-login");
    expect(loginLink).toHaveClass("rounded-[10px]", "bg-primary", "min-h-11");
    expect(loginLink).not.toHaveClass("rounded-pill");
    expect(loginLink.querySelector("svg")).toBeNull();
  });

  it("renders an accessible business step without approval controls", () => {
    render(
      <ProviderOnboardingStepForm
        step={PROVIDER_ONBOARDING_STEPS[1]}
        draft={{
          ownerFirstName: "Ada",
          ownerLastName: "Lovelace",
          ownerPhone: "+639171234567",
          ownerEmail: "owner@example.test",
          acceptedTerms: false,
          acceptedPrivacy: false,
          termsPolicyVersion: "unversioned",
          privacyPolicyVersion: "unversioned",
          completedSteps: [1],
        }}
      />,
    );
    expect(screen.queryByLabelText(/verification status|is active|featured/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/business name/i)).toBeRequired();
    expect(screen.getByRole("button", {name: /save and continue/i})).toHaveClass("min-h-12");
  });

  it("saves a trusted draft step and advances to the next route", async () => {
    const user = userEvent.setup();
    mocks.saveDraft.mockResolvedValueOnce({
      completedSteps: [1],
      nextStep: 2,
    });
    render(
      <ProviderOnboardingStepForm
        step={PROVIDER_ONBOARDING_STEPS[0]}
        draft={{
          ownerFirstName: "Ada",
          ownerLastName: "Lovelace",
          ownerPhone: "+639171234567",
          ownerEmail: "owner@example.test",
          acceptedTerms: false,
          acceptedPrivacy: false,
          termsPolicyVersion: "unversioned",
          privacyPolicyVersion: "unversioned",
          completedSteps: [],
        }}
      />,
    );
    await user.clear(screen.getByLabelText(/owner first name/i));
    await user.type(screen.getByLabelText(/owner first name/i), "Grace");
    await user.click(screen.getByRole("button", {name: /save and continue/i}));
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalledWith(
      1,
      {
        ownerFirstName: "Grace",
        ownerLastName: "Lovelace",
        ownerPhone: "+639171234567",
      },
    ));
    expect(mocks.push).toHaveBeenCalledWith(
      "/provider/onboarding/business",
    );
  });

  it("warns before discarding an unsaved step", async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(
      <ProviderOnboardingStepForm
        step={PROVIDER_ONBOARDING_STEPS[0]}
        draft={{
          ownerFirstName: "Ada",
          ownerLastName: "Lovelace",
          ownerPhone: "+639171234567",
          ownerEmail: "owner@example.test",
          acceptedTerms: false,
          acceptedPrivacy: false,
          termsPolicyVersion: "unversioned",
          privacyPolicyVersion: "unversioned",
          completedSteps: [],
        }}
      />,
    );
    await user.type(screen.getByLabelText(/owner first name/i), " Updated");
    await user.click(screen.getByRole("button", {name: "Back"}));
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("normalizes owner contact data before saving", async () => {
    const user = userEvent.setup();
    mocks.saveDraft.mockResolvedValueOnce({
      completedSteps: [1],
      nextStep: 2,
    });
    render(
      <ProviderOnboardingStepForm
        step={PROVIDER_ONBOARDING_STEPS[0]}
        draft={{
          ownerFirstName: " Ada ",
          ownerLastName: " Lovelace ",
          ownerPhone: "0917 123 4567",
          ownerEmail: "owner@example.test",
          acceptedTerms: false,
          acceptedPrivacy: false,
          termsPolicyVersion: "unversioned",
          privacyPolicyVersion: "unversioned",
          completedSteps: [],
        }}
      />,
    );
    await user.click(screen.getByRole("button", {name: /save and continue/i}));
    await waitFor(() => expect(mocks.saveDraft).toHaveBeenCalledWith(1, {
      ownerFirstName: "Ada",
      ownerLastName: "Lovelace",
      ownerPhone: "+639171234567",
    }));
  });

  it("validates and securely registers Cloudinary business images", async () => {
    const user = userEvent.setup();
    mocks.uploadImage.mockResolvedValueOnce({
      url: "https://res.cloudinary.com/feasta-test/image/upload/v1/feasta/providers/provider-owner/onboarding/logo.png",
      publicId: "feasta/providers/provider-owner/onboarding/logo",
    });
    mocks.saveDraft.mockResolvedValueOnce({
      completedSteps: [1, 2],
      nextStep: 3,
    });
    render(
      <ProviderOnboardingStepForm
        step={PROVIDER_ONBOARDING_STEPS[1]}
        draft={{
          ownerFirstName: "Ada",
          ownerLastName: "Lovelace",
          ownerPhone: "+639171234567",
          ownerEmail: "owner@example.test",
          businessName: "FEASTA Catering",
          businessEmail: " SALES@FEASTA.TEST ",
          businessPhone: "0917-123-4567",
          description: "Complete catering services for celebrations.",
          acceptedTerms: false,
          acceptedPrivacy: false,
          termsPolicyVersion: "unversioned",
          privacyPolicyVersion: "unversioned",
          completedSteps: [1],
        }}
      />,
    );
    const logo = new File(["logo"], "logo.png", {type: "image/png"});
    await user.upload(
      screen.getByLabelText(/^Business logo$/i, {selector: "input"}),
      logo,
    );
    await user.click(screen.getByRole("button", {name: /save and continue/i}));

    await waitFor(() => expect(mocks.uploadImage).toHaveBeenCalledWith(
      "logo",
      logo,
    ));
    expect(mocks.saveDraft).toHaveBeenCalledWith(2, {
      businessName: "FEASTA Catering",
      businessEmail: "sales@feasta.test",
      businessPhone: "+639171234567",
      description: "Complete catering services for celebrations.",
      logoUrl:
        "https://res.cloudinary.com/feasta-test/image/upload/v1/feasta/providers/provider-owner/onboarding/logo.png",
      logoPublicId:
        "feasta/providers/provider-owner/onboarding/logo",
      coverImageUrl: null,
      coverPublicId: null,
    });
    const payload = mocks.saveDraft.mock.calls.at(-1)?.[1];
    expect(payload).not.toHaveProperty("ownerId");
    expect(payload).not.toHaveProperty("verificationStatus");
    expect(screen.getByAltText("Business logo preview")).toBeInTheDocument();
  });

  it("rejects invalid contacts and executable image uploads", async () => {
    render(
      <ProviderOnboardingStepForm
        step={PROVIDER_ONBOARDING_STEPS[1]}
        draft={{
          ownerFirstName: "Ada",
          ownerLastName: "Lovelace",
          ownerPhone: "+639171234567",
          ownerEmail: "owner@example.test",
          businessName: "F",
          businessEmail: "not-email",
          businessPhone: "+1 555 1234",
          description: "short",
          acceptedTerms: false,
          acceptedPrivacy: false,
          termsPolicyVersion: "unversioned",
          privacyPolicyVersion: "unversioned",
          completedSteps: [1],
        }}
      />,
    );
    const logoInput = screen.getByLabelText(
      /^Business logo$/i,
      {selector: "input"},
    );
    fireEvent.change(logoInput, {
      target: {
        files: [
          new File(
            ["bad"],
            "script.exe",
            {type: "application/octet-stream"},
          ),
        ],
      },
    });
    fireEvent.submit(
      screen.getByRole("button", {name: /save and continue/i})
        .closest("form")!,
    );
    expect(screen.getByLabelText(/business email/i)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText(
      /^Business logo$/i,
      {selector: "input"},
    )).toHaveAccessibleDescription(
      expect.stringMatching(/JPEG, PNG, or WebP/i),
    );
    expect(mocks.uploadImage).not.toHaveBeenCalled();
    expect(mocks.saveDraft).not.toHaveBeenCalled();
  });

  it("uploads a private verification document and prevents premature submission", async () => {
    const user = userEvent.setup();
    mocks.uploadDocument.mockResolvedValueOnce(undefined);
    render(
      <ProviderVerificationActions
        providerId="provider-one"
        verificationId="verification-one"
        canSubmit={false}
      />,
    );
    const file = new File(["permit"], "permit.pdf", {type: "application/pdf"});
    await user.upload(screen.getByLabelText(/choose file/i), file);
    fireEvent.submit(
      screen.getByRole("button", {name: "Upload"}).closest("form")!,
    );
    await waitFor(() => expect(mocks.uploadDocument).toHaveBeenCalledWith(
      expect.objectContaining({
        providerId: "provider-one",
        verificationId: "verification-one",
        documentType: "business_permit",
        file,
      }),
    ));
    expect(screen.getByRole("button", {name: /review application/i})).toBeDisabled();
    expect(await screen.findByRole("status")).toHaveTextContent("registered securely");
  });

  it("shows document status and removes files only through the trusted callable", async () => {
    const user = userEvent.setup();
    mocks.removeDocument.mockResolvedValueOnce({removed: true});
    render(
      <ProviderVerificationActions
        providerId="provider-one"
        verificationId="verification-one"
        canSubmit={false}
        documents={[{
          id: "business_permit",
          documentType: "business_permit",
          status: "pending",
          displayName: "Business permit",
          isRequired: true,
          requirement: "required",
          fileSize: 1024,
        }]}
      />,
    );
    expect(screen.getByLabelText("Status: Pending")).toBeInTheDocument();
    await user.click(screen.getByRole("button", {name: "Remove"}));
    await user.click(screen.getByRole("button", {name: "Remove document"}));
    await waitFor(() => expect(mocks.removeDocument).toHaveBeenCalledWith({
      verificationId: "verification-one",
      documentType: "business_permit",
    }));
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("communicates upload progress and replacement state", async () => {
    const user = userEvent.setup();
    let finishUpload!: () => void;
    mocks.uploadDocument.mockImplementationOnce(async (
      input: {onProgress: (percent: number) => void},
    ) => {
      input.onProgress(64);
      await new Promise<void>((resolve) => {
        finishUpload = resolve;
      });
    });
    render(
      <ProviderVerificationActions
        providerId="provider-one"
        verificationId="verification-one"
        canSubmit={false}
        documents={[{
          id: "valid_id",
          documentType: "valid_id",
          status: "rejected",
          displayName: "Valid government ID",
          isRequired: true,
          requirement: "required",
          fileSize: 2048,
        }]}
      />,
    );
    await user.selectOptions(
      screen.getByLabelText(/document type/i),
      "valid_id",
    );
    await user.upload(
      screen.getByLabelText(/choose file/i),
      new File(["id"], "id.png", {type: "image/png"}),
    );
    fireEvent.submit(
      screen.getByRole("button", {name: "Replace"}).closest("form")!,
    );
    await waitFor(() => expect(mocks.uploadDocument).toHaveBeenCalled());
    expect(await screen.findByText("Uploading: 64%")).toBeInTheDocument();
    finishUpload();
    expect(await screen.findByRole("status")).toHaveTextContent(
      "replaced securely",
    );
  });

  it("submits verification once required documents are registered", async () => {
    const user = userEvent.setup();
    mocks.submitVerification.mockResolvedValueOnce(undefined);
    render(
      <ProviderVerificationActions
        providerId="provider-one"
        verificationId="verification-one"
        canSubmit
        reviewMode
      />,
    );
    await user.click(screen.getByRole("button", {name: /submit for admin review/i}));
    await waitFor(() => expect(mocks.submitVerification).toHaveBeenCalledTimes(1));
    expect(mocks.replace).toHaveBeenCalledWith("/provider/status");
  });

  it("prevents replay taps while submission is in progress", async () => {
    const user = userEvent.setup();
    let finish!: () => void;
    mocks.submitVerification.mockImplementationOnce(
      () => new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    render(
      <ProviderVerificationActions
        providerId="provider-one"
        verificationId="verification-one"
        canSubmit
        reviewMode
      />,
    );
    const submit = screen.getByRole(
      "button",
      {name: /submit for admin review/i},
    );
    await user.click(submit);
    await user.click(submit);
    expect(mocks.submitVerification).toHaveBeenCalledTimes(1);
    expect(submit).toBeDisabled();
    finish();
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith(
      "/provider/status",
    ));
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("blocks submission when trusted consent is not recorded", () => {
    render(
      <ProviderVerificationActions
        providerId="provider-one"
        verificationId="verification-one"
        canSubmit={false}
        reviewMode
        consent={{
          termsPolicyVersion: "v1",
          privacyPolicyVersion: "v1",
          termsAccepted: false,
          privacyAccepted: true,
        }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      /acceptance is not recorded/i,
    );
    expect(screen.getByRole(
      "button",
      {name: /submit for admin review/i},
    )).toBeDisabled();
  });
});
