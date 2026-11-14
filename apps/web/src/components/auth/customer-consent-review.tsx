"use client";
import {useCallback, useEffect, useRef, useState} from "react";
import {consentMessages, consentReason, loadCustomerAgreements, type CustomerConsent} from "@/lib/auth/customer-consent";

export function useCustomerConsent(active = true) {
  const [required, setRequired] = useState(active);
  const [agreements, setAgreements] = useState<Awaited<ReturnType<typeof loadCustomerAgreements>> | null>(null);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const generation = useRef(0);
  const reload = useCallback(async () => {
    const request = ++generation.current;
    setAgreements(null); setTerms(false); setPrivacy(false);
    try {
      const next = await loadCustomerAgreements();
      if (generation.current === request) setAgreements(next);
    } catch {
      if (generation.current === request) setMessage(consentMessages["policy-unavailable"]);
    }
  }, []);
  useEffect(() => {
    const lifetime = generation;
    let cancelled = false;
    if (required) void Promise.resolve().then(() => {if (!cancelled) return reload();});
    return () => {cancelled = true; lifetime.current++;};
  }, [required, reload]);
  function reject(error: unknown) {
    const reason = consentReason(error);
    if (!reason) return false;
    setMessage(consentMessages[reason]);
    setTerms(false); setPrivacy(false);
    if (required) void reload(); else setRequired(true);
    return true;
  }
  const input: CustomerConsent | undefined = agreements && terms && privacy ? {
    acceptedTerms: true, acceptedPrivacy: true,
    termsPolicyVersion: agreements.terms.version, privacyPolicyVersion: agreements.privacy.version,
  } : undefined;
  return {required, agreements, terms, privacy, setTerms, setPrivacy, message, reload, reject, input};
}
export function CustomerConsentReview({consent, disabled = false}: {consent: ReturnType<typeof useCustomerConsent>; disabled?: boolean}) {
  if (!consent.required) return null;
  return <fieldset disabled={disabled} className="grid gap-3 rounded-lg border p-4">
    <legend>Customer agreements</legend>
    {consent.message && <p role="alert">{consent.message}</p>}
    {!consent.agreements ? <p role="status">Agreements must be loaded before acceptance.</p> :
      (["terms", "privacy"] as const).map(kind => {
        const agreement = consent.agreements![kind];
        return <div key={kind}>
          <details><summary>{agreement.name} ? version {agreement.version}</summary>
            <p>Effective {agreement.effectiveDate}</p><p>{agreement.summary}</p>
            {agreement.sections.map((section,i) => <section key={i}><h3>{section.title}</h3>
              {section.paragraphs.map((paragraph,j) => <p key={j} className="whitespace-pre-wrap">{paragraph}</p>)}
            </section>)}
          </details>
          <label className="flex min-h-11 items-center gap-3"><input type="checkbox"
            checked={kind === "terms" ? consent.terms : consent.privacy}
            onChange={event => (kind === "terms" ? consent.setTerms : consent.setPrivacy)(event.target.checked)} />
            I accept the {kind === "terms" ? "Terms" : "Privacy Policy"} (version {agreement.version})</label>
        </div>;
      })}
    <button type="button" disabled={disabled} onClick={() => void consent.reload()} className="min-h-12 underline">Reload agreements</button>
  </fieldset>;
}
