"use client";

import {FormEvent, useRef, useState} from "react";
import Link from "next/link";
import {useRouter} from "next/navigation";
import type {UserRole} from "@feasta/shared-types";

import {FormField} from "@/components/forms/form-field";
import {PasswordInput} from "@/components/forms/password-input";
import {ConfirmationDialog} from "@/components/shared/confirmation-dialog";
import {StatusBadge} from "@/components/shared/status-badge";
import {Button} from "@/components/ui/button";
import {AuthStatus} from "@/components/auth/auth-status";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";
import type {AccountManagementProfile} from "@/lib/auth/account-management";
import {
  changeAccountPassword,
  deactivateWebAccount,
  logoutWebSession,
  requestAccountEmailUpdate,
  revokeAllWebAccountSessions,
  updateAccountPreferences,
  updateAccountProfile,
} from "@/lib/auth/account-client";
import {customerAuthenticationError} from "@/lib/auth/error-messages";

export function AccountManagementPanel({
  profile,
}: {
  profile: AccountManagementProfile;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const operation = useRef(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deactivateOpen, setDeactivateOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [sessionPassword, setSessionPassword] = useState("");
  const [deactivationPassword, setDeactivationPassword] = useState("");
  const [profileValues, setProfileValues] = useState(
    initialProfileValues(profile),
  );
  const [preferences, setPreferences] = useState({
    marketingConsent: profile.marketingConsent,
    pushNotificationsEnabled: profile.pushNotificationsEnabled,
    emailNotificationsEnabled: profile.emailNotificationsEnabled,
  });
  const [passwordValues, setPasswordValues] = useState({
    current: "",
    next: "",
    confirm: "",
  });
  const [emailValues, setEmailValues] = useState({
    currentPassword: "",
    newEmail: "",
  });

  async function run(
    name: string,
    action: () => Promise<void>,
    successMessage?: string,
  ) {
    if (operation.current) return;
    operation.current = true;
    setBusy(name);
    setError(null);
    setNotice(null);
    try {
      await action();
      if (successMessage) setNotice(successMessage);
    } catch (caught) {
      setError(accountError(caught));
    } finally {
      operation.current = false;
      setBusy(null);
    }
  }

  function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run("profile", async () => {
      await updateAccountProfile(profile.role, profileValues);
      router.refresh();
    }, "Profile changes were saved.");
  }

  function submitPreferences(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run("preferences", async () => {
      await updateAccountPreferences(preferences);
      router.refresh();
    }, "Privacy and notification preferences were saved.");
  }

  function submitPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (passwordValues.next !== passwordValues.confirm) {
      setError("The new passwords do not match.");
      return;
    }
    void run("password", () =>
      changeAccountPassword(passwordValues.current, passwordValues.next));
  }

  function submitEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void run("email", () =>
      requestAccountEmailUpdate(
        emailValues.currentPassword,
        emailValues.newEmail,
      ), "Check the new email address to approve the change. Your current email remains active until verification succeeds.");
  }

  const loginPath = loginPathForRole(profile.role);
  const legalIdentityEditable =
    profile.provider?.verificationStatus === "draft" ||
    profile.provider?.verificationStatus === "resubmission_required";

  return (
    <div className="grid gap-6">
      <section className="grid gap-4 rounded-card border border-border bg-card p-5 shadow-card sm:p-6" aria-labelledby="account-summary-title">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="account-summary-title" className="text-xl font-bold">Account summary</h2>
          <StatusBadge status="active" label={`Active ${profile.role}`} />
        </div>
        <dl className="grid gap-4 sm:grid-cols-2">
          <div><dt className="text-sm font-bold text-muted-foreground">Email</dt><dd className="break-all font-medium">{profile.email}</dd></div>
          <div><dt className="text-sm font-bold text-muted-foreground">Sign-in method</dt><dd className="font-medium">{profile.supportsPasswordChanges ? "Email and password" : "External identity provider"}</dd></div>
          <div><dt className="text-sm font-bold text-muted-foreground">Terms version</dt><dd>{profile.termsPolicyVersion}</dd></div>
          <div><dt className="text-sm font-bold text-muted-foreground">Privacy version</dt><dd>{profile.privacyPolicyVersion}</dd></div>
        </dl>
      </section>

      {profile.role !== "provider" || profile.provider ? (
        <section className="rounded-card border border-border bg-card p-5 shadow-card sm:p-6" aria-labelledby="profile-edit-title">
          <h2 id="profile-edit-title" className="text-xl font-bold">Profile details</h2>
          <p className="mt-2 text-sm text-muted-foreground">Only role-appropriate fields are accepted by the trusted backend.</p>
          <form className="mt-5 grid gap-4 sm:grid-cols-2" onSubmit={submitProfile}>
            {profile.role === "provider" ? (
              <>
                <TextField label="Owner first name" field="ownerFirstName" values={profileValues} setValues={setProfileValues} disabled={busy != null} />
                <TextField label="Owner last name" field="ownerLastName" values={profileValues} setValues={setProfileValues} disabled={busy != null} />
                {legalIdentityEditable ? (
                  <>
                    <TextField label="Business name" field="businessName" values={profileValues} setValues={setProfileValues} disabled={busy != null} />
                    <TextField label="Business email" field="businessEmail" type="email" values={profileValues} setValues={setProfileValues} disabled={busy != null} />
                    <TextField label="Business phone" field="businessPhone" type="tel" values={profileValues} setValues={setProfileValues} disabled={busy != null} />
                    <TextField label="Address" field="address" values={profileValues} setValues={setProfileValues} disabled={busy != null} />
                    <TextField label="City" field="city" values={profileValues} setValues={setProfileValues} disabled={busy != null} />
                    <TextField label="Province" field="province" values={profileValues} setValues={setProfileValues} disabled={busy != null} />
                    <FormField className="sm:col-span-2" label="Business description" required disabled={busy != null}>
                      <Textarea value={profileValues.description ?? ""} onChange={(event) => setProfileValues((current) => ({...current, description: event.target.value}))} />
                    </FormField>
                  </>
                ) : (
                  <div className="grid gap-4 rounded-lg border border-border bg-muted/40 p-4 sm:col-span-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                    <div>
                      <h3 className="font-bold">Public business information</h3>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        Business contact, description, location, logo, and cover image are managed in Business Profile. Verified business identity and service capabilities remain read-only there.
                      </p>
                    </div>
                    {profile.provider?.verificationStatus === "approved" ? (
                      <Button type="button" variant="secondary" asChild>
                        <Link href="/provider/business-profile">Manage Business Profile</Link>
                      </Button>
                    ) : (
                      <p className="text-sm font-semibold text-muted-foreground">Available after provider approval.</p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <>
                <TextField label="First name" field="firstName" values={profileValues} setValues={setProfileValues} disabled={busy != null} />
                <TextField label="Last name" field="lastName" values={profileValues} setValues={setProfileValues} disabled={busy != null} />
                {profile.role === "customer" ? (
                  <>
                    <TextField label="Address" field="address" values={profileValues} setValues={setProfileValues} disabled={busy != null} required={false} />
                    <TextField label="City" field="city" values={profileValues} setValues={setProfileValues} disabled={busy != null} required={false} />
                    <TextField label="Province" field="province" values={profileValues} setValues={setProfileValues} disabled={busy != null} required={false} />
                    <FormField label="Verified phone" description="Change this through the trusted phone-verification workflow." disabled>
                      <Input value={profile.customer?.phoneNumber ?? ""} readOnly disabled />
                    </FormField>
                  </>
                ) : null}
              </>
            )}
            <div className="sm:col-span-2"><Button type="submit" loading={busy === "profile"} disabled={busy != null}>Save profile</Button></div>
          </form>
        </section>
      ) : (
        <section className="rounded-card border border-border bg-card p-6 shadow-card">
          <h2 className="text-xl font-bold">Business profile required</h2>
          <p className="mt-2 text-muted-foreground">Complete trusted provider setup before editing business details.</p>
          <Button className="mt-4" asChild><Link href="/provider/onboarding">Continue business setup</Link></Button>
        </section>
      )}

      <section className="rounded-card border border-border bg-card p-5 shadow-card sm:p-6" aria-labelledby="preferences-title">
        <h2 id="preferences-title" className="text-xl font-bold">Privacy and notifications</h2>
        <form className="mt-5 grid gap-4" onSubmit={submitPreferences}>
          <PreferenceCheckbox label="Marketing messages" checked={preferences.marketingConsent} disabled={busy != null} onChange={(checked) => setPreferences((current) => ({...current, marketingConsent: checked}))} />
          <PreferenceCheckbox label="Push notifications" checked={preferences.pushNotificationsEnabled} disabled={busy != null} onChange={(checked) => setPreferences((current) => ({...current, pushNotificationsEnabled: checked}))} />
          <PreferenceCheckbox label="Email notifications" checked={preferences.emailNotificationsEnabled} disabled={busy != null} onChange={(checked) => setPreferences((current) => ({...current, emailNotificationsEnabled: checked}))} />
          <Button className="justify-self-start" type="submit" loading={busy === "preferences"} disabled={busy != null}>Save preferences</Button>
        </form>
      </section>

      <section className="grid gap-6 rounded-card border border-border bg-card p-5 shadow-card sm:p-6" aria-labelledby="security-title">
        <h2 id="security-title" className="text-xl font-bold">Sign-in security</h2>
        {profile.supportsPasswordChanges ? (
          <>
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={submitPassword}>
              <FormField label="Current password" required disabled={busy != null}><PasswordInput autoComplete="current-password" value={passwordValues.current} onChange={(event) => setPasswordValues((current) => ({...current, current: event.target.value}))} /></FormField>
              <div className="hidden sm:block" aria-hidden="true" />
              <FormField label="New password" required disabled={busy != null}><PasswordInput autoComplete="new-password" value={passwordValues.next} onChange={(event) => setPasswordValues((current) => ({...current, next: event.target.value}))} /></FormField>
              <FormField label="Confirm new password" required disabled={busy != null}><PasswordInput autoComplete="new-password" value={passwordValues.confirm} onChange={(event) => setPasswordValues((current) => ({...current, confirm: event.target.value}))} /></FormField>
              <div className="sm:col-span-2"><Button type="submit" loading={busy === "password"} disabled={busy != null}>Change password and sign out</Button></div>
            </form>
            <form className="grid gap-4 sm:grid-cols-2" onSubmit={submitEmail}>
              <FormField label="Current password for email change" required disabled={busy != null}><PasswordInput autoComplete="current-password" value={emailValues.currentPassword} onChange={(event) => setEmailValues((current) => ({...current, currentPassword: event.target.value}))} /></FormField>
              <FormField label="New email address" required disabled={busy != null}><Input type="email" autoComplete="email" value={emailValues.newEmail} onChange={(event) => setEmailValues((current) => ({...current, newEmail: event.target.value}))} /></FormField>
              <div className="sm:col-span-2"><Button type="submit" variant="secondary" loading={busy === "email"} disabled={busy != null}>Send email-change verification</Button></div>
            </form>
          </>
        ) : (
          <p className="rounded-lg bg-info-subtle p-4 text-sm font-medium text-info">Password and primary email changes are managed by your external identity provider. FEASTA will not create a password for this account.</p>
        )}
      </section>

      <section className="grid gap-4 rounded-card border border-border bg-card p-5 shadow-card sm:p-6" aria-labelledby="sessions-title">
        <h2 id="sessions-title" className="text-xl font-bold">Sessions</h2>
        {profile.supportsPasswordChanges ? (
          <FormField label="Current password for all-session sign out" required disabled={busy != null}>
            <PasswordInput autoComplete="current-password" value={sessionPassword} onChange={(event) => setSessionPassword(event.target.value)} />
          </FormField>
        ) : (
          <p className="text-sm text-muted-foreground">Your identity provider will ask you to reauthenticate before all sessions are revoked.</p>
        )}
        <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          <Button className="w-full sm:w-auto" variant="secondary" disabled={busy != null} onClick={() => void run("logout", async () => { await logoutWebSession(); router.replace(loginPath); router.refresh(); })}>Sign out</Button>
          <Button className="w-full sm:w-auto" variant="secondary" loading={busy === "sessions"} disabled={busy != null} onClick={() => void run("sessions", async () => { await revokeAllWebAccountSessions(sessionPassword); router.replace(loginPath); router.refresh(); })}>Sign out all sessions</Button>
        </div>
      </section>

      {profile.role !== "admin" ? (
        <section className="grid gap-4 rounded-card border border-destructive/40 bg-card p-5 shadow-card sm:p-6" aria-labelledby="deactivation-title">
          <h2 id="deactivation-title" className="text-xl font-bold">Deactivate account</h2>
          <p className="text-sm text-muted-foreground">{profile.role === "provider" ? "Active event obligations must be resolved first. Booking, payment, dispute, and audit records are retained." : "This is a soft deactivation. Booking, payment, dispute, and audit records are retained."}</p>
          <FormField label="Optional reason" disabled={busy != null}><Textarea value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} /></FormField>
          {profile.supportsPasswordChanges ? (
            <FormField label="Current password for deactivation" required disabled={busy != null}>
              <PasswordInput autoComplete="current-password" value={deactivationPassword} onChange={(event) => setDeactivationPassword(event.target.value)} />
            </FormField>
          ) : (
            <p className="text-sm text-muted-foreground">Your identity provider will ask you to reauthenticate before deactivation.</p>
          )}
          <ConfirmationDialog open={deactivateOpen} onOpenChange={setDeactivateOpen} title="Deactivate this account?" description="Protected access will end and all sessions will be revoked. This does not delete retained operational records." destructive confirmLabel="Deactivate account" onConfirm={() => run("deactivate", async () => { await deactivateWebAccount(profile.role, reason, deactivationPassword); router.replace(loginPath); router.refresh(); })} trigger={<Button className="justify-self-start" variant="destructive" disabled={busy != null}>Deactivate account</Button>} />
        </section>
      ) : (
        <section className="rounded-card border border-border bg-card p-5 shadow-card sm:p-6">
          <h2 className="text-xl font-bold">Admin account lifecycle</h2>
          <p className="mt-2 text-sm text-muted-foreground">Administrators cannot deactivate themselves. Another trusted administrator must follow the controlled administrative process, preserving last-admin safeguards.</p>
        </section>
      )}

      {notice ? <AuthStatus message={notice} tone="success" /> : null}
      {error ? <AuthStatus message={error} tone="error" /> : null}
    </div>
  );
}

function TextField({
  label,
  field,
  values,
  setValues,
  disabled,
  type = "text",
  required = true,
  description,
}: {
  label: string;
  field: string;
  values: Record<string, string>;
  setValues: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  disabled: boolean;
  type?: string;
  required?: boolean;
  description?: string;
}) {
  return (
    <FormField label={label} required={required} disabled={disabled} description={description}>
      <Input type={type} value={values[field] ?? ""} onChange={(event) => setValues((current) => ({...current, [field]: event.target.value}))} />
    </FormField>
  );
}

function PreferenceCheckbox({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-border p-3 font-medium focus-within:ring-2 focus-within:ring-ring">
      <input className="size-5 accent-primary" type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function initialProfileValues(
  profile: AccountManagementProfile,
): Record<string, string> {
  if (profile.role === "provider" && profile.provider) {
    return {
      ownerFirstName: profile.firstName,
      ownerLastName: profile.lastName,
      businessName: profile.provider.businessName,
      businessEmail: profile.provider.businessEmail,
      businessPhone: profile.provider.businessPhone,
      description: profile.provider.description,
      address: profile.provider.address,
      city: profile.provider.city,
      province: profile.provider.province,
    };
  }
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    address: profile.customer?.address ?? "",
    city: profile.customer?.city ?? "",
    province: profile.customer?.province ?? "",
  };
}

function loginPathForRole(role: UserRole) {
  if (role === "provider") return "/provider-login";
  if (role === "admin") return "/admin-login";
  return "/login";
}

function accountError(error: unknown): string {
  const reason = typeof error === "object" && error !== null && "reason" in error
    ? String(error.reason)
    : "";
  if (reason === "password_provider_required") {
    return "Password and email changes are managed by your identity provider.";
  }
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";
  if (code.includes("wrong-password") || code.includes("invalid-credential")) {
    return "The current password is incorrect.";
  }
  if (code.includes("requires-recent-login")) {
    return "Sign in again before changing sensitive account details.";
  }
  if (code.includes("weak-password")) {
    return "Choose a stronger password with at least 8 characters.";
  }
  if (code.includes("email-already-in-use")) {
    return "That email address is already in use.";
  }
  if (code.includes("failed-precondition")) {
    return error instanceof Error
      ? error.message
      : "Complete the required account steps before continuing.";
  }
  return customerAuthenticationError(error);
}
