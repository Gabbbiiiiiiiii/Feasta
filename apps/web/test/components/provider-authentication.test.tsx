import {fireEvent, render, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {beforeEach, describe, expect, it, vi} from "vitest";

const mocks = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  registerIdentity: vi.fn(),
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
import {ProviderVerificationActions} from "@/app/provider/verification/provider-verification-actions";
import {PROVIDER_ONBOARDING_STEPS} from "@/lib/provider/onboarding";

describe("provider authentication and onboarding", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    URL.createObjectURL = vi.fn(() => "blob:provider-preview");
    URL.revokeObjectURL = vi.fn();
  });

  it("registers a provider identity without trusted activation fields", async () => {
    const user = userEvent.setup();
    mocks.registerIdentity.mockResolvedValueOnce({verificationEmailSent: true});
    render(<ProviderRegistrationPage />);
    const fields = {
      "Owner first name": "Ada",
      "Owner last name": "Lovelace",
      "Phone number": "+639171234567",
      "Email address": "provider@example.test",
      "Password": "Feasta123!",
      "Confirm password": "Feasta123!",
    };
    for (const [label, value] of Object.entries(fields)) {
      fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`, "i")), {
        target: {value},
      });
    }
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", {name: /create provider account/i}));
    await waitFor(() => expect(mocks.registerIdentity).toHaveBeenCalledTimes(1));
    const payload = mocks.registerIdentity.mock.calls[0][0];
    expect(payload).not.toHaveProperty("role");
    expect(payload).not.toHaveProperty("isActive");
    expect(payload).not.toHaveProperty("verificationStatus");
    expect(payload).toMatchObject({
      acceptedTerms: true,
      acceptedPrivacy: true,
      termsPolicyVersion: "unversioned",
      privacyPolicyVersion: "unversioned",
    });
    expect(payload).not.toHaveProperty("termsAcceptedAt");
    expect(payload).not.toHaveProperty("privacyAcceptedAt");
    expect(mocks.replace).toHaveBeenCalledWith(
      "/provider-verify-email?delivery=sent",
    );
  });

  it("links provider registration errors to fields and focuses the summary", async () => {
    const user = userEvent.setup();
    render(<ProviderRegistrationPage />);
    await user.click(screen.getByRole("button", {name: /create provider account/i}));

    const email = screen.getByRole("textbox", {name: /email address/i});
    const agreement = screen.getByRole("checkbox");
    const summary = screen.getByText(
      /review the highlighted fields before creating your provider account/i,
    );
    expect(summary).toHaveAttribute("role", "alert");
    expect(email).toHaveAttribute("aria-invalid", "true");
    expect(email).toHaveAccessibleDescription("Enter a valid email address.");
    expect(agreement).toHaveAttribute("aria-invalid", "true");
    expect(agreement).toHaveAccessibleDescription(
      "Accept the Terms and Privacy Policy to continue.",
    );
    expect(summary).toHaveFocus();
    expect(mocks.registerIdentity).not.toHaveBeenCalled();
  });

  it("uses a provider-only secure session destination", async () => {
    const user = userEvent.setup();
    mocks.signIn.mockResolvedValueOnce({
      role: "provider",
      destination: "/provider",
    });
    render(<ProviderLoginPage />);
    fireEvent.change(screen.getByRole("textbox", {name: /business account email/i}), {target: {value: "provider@example.test"}});
    fireEvent.change(screen.getByLabelText(/^Password/), {target: {value: "Feasta123!"}});
    await user.click(screen.getByRole("button", {name: /sign in as provider/i}));
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith("/provider"));
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
