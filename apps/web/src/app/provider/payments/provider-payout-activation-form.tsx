"use client";

import {useState} from "react";

import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {
  PAYMONGO_MERCHANT_CATEGORY_CODES,
  PAYMONGO_PHILIPPINE_STATE_CODES,
} from "@/lib/provider/payments/paymongo-account-codes";
import {saveProviderPayoutActivationProfile} from "@/lib/provider/payments/provider-payout-client";
import type {ProviderLinkedAccountType} from "@/lib/provider/payments/provider-finance-types";

const NATURE_OF_WORK = [
  ["employed_locally", "Employed locally"],
  ["self_employed", "Self-employed"],
  ["ofw", "Overseas worker"],
  ["ofw_beneficiary", "Beneficiary of an overseas worker"],
  ["retired", "Retired"],
  ["pensioner", "Pensioner"],
  ["student", "Student"],
  ["unemployed_spouse_income", "Unemployed, supported by a spouse"],
  ["unemployed_other_income", "Unemployed, other income"],
] as const;

const SOURCE_OF_FUNDS = [
  ["salary", "Salary"],
  ["commission", "Commission"],
  ["allowance", "Allowance"],
  ["pension", "Pension"],
  ["donation", "Donation"],
  ["other", "Other"],
] as const;

const BUSINESS_TYPES = [
  ["sole_proprietor", "Sole proprietor"],
  ["partnership", "Partnership"],
  ["corporation", "Corporation"],
] as const;

const BUSINESS_AGES = [
  ["less_than_1_year", "Less than 1 year"],
  ["between_1_and_2_years", "1 to 2 years"],
  ["between_2_and_5_years", "2 to 5 years"],
  ["greater_than_5_years", "More than 5 years"],
] as const;

const BUSINESS_SIZES = [
  ["less_than_10", "Fewer than 10 people"],
  ["between_10_and_50", "10 to 50 people"],
  ["between_51_and_250", "51 to 250 people"],
  ["greater_than_250", "More than 250 people"],
] as const;

const MONTHLY_VOLUMES = [
  ["less_than_100K", "Less than 100,000"],
  ["between_100K_and_300K", "100,000 to 300,000"],
  ["between_300K_and_500K", "300,000 to 500,000"],
  ["between_500K_and_1M", "500,000 to 1,000,000"],
  ["between_1M_and_3M", "1,000,000 to 3,000,000"],
  ["greater_than_3M", "More than 3,000,000"],
] as const;

type AddressState = {
  line1: string;
  line2: string;
  city: string;
  state: string;
  postalCode: string;
};

const emptyAddress = (): AddressState => ({
  line1: "",
  line2: "",
  city: "",
  state: "",
  postalCode: "",
});

export function ProviderPayoutActivationForm({
  linkedAccountType,
  onSaved,
}: {
  linkedAccountType: ProviderLinkedAccountType;
  onSaved: () => Promise<void>;
}) {
  const [nationality, setNationality] = useState("");
  const [placeOfBirthCity, setPlaceOfBirthCity] = useState("");
  const [placeOfBirthCountry, setPlaceOfBirthCountry] = useState("");
  const [natureOfWork, setNatureOfWork] = useState("");
  const [sourceOfFunds, setSourceOfFunds] = useState("");
  const [sourceOfFundsSalary, setSourceOfFundsSalary] = useState("");
  const [sourceOfFundsOther, setSourceOfFundsOther] = useState("");
  const [personTin, setPersonTin] = useState("");
  const [currentAddress, setCurrentAddress] = useState(emptyAddress);
  const [legalType, setLegalType] = useState("");
  const [industry, setIndustry] = useState("");
  const [age, setAge] = useState("");
  const [size, setSize] = useState("");
  const [estimatedMonthlyVolume, setEstimatedMonthlyVolume] = useState("");
  const [businessTin, setBusinessTin] = useState("");
  const [businessAddress, setBusinessAddress] = useState(emptyAddress);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const merchant = linkedAccountType === "merchant";

  const submit = async () => {
    if (saving) return;
    setSaving(true);
    setError(null);
    try {
      await saveProviderPayoutActivationProfile({
        nationality: nationality.trim().toUpperCase(),
        placeOfBirthCity: placeOfBirthCity.trim(),
        placeOfBirthCountry: placeOfBirthCountry.trim().toUpperCase(),
        natureOfWork,
        sourceOfFunds,
        sourceOfFundsSalary: sourceOfFunds === "salary"
          ? sourceOfFundsSalary.trim()
          : null,
        sourceOfFundsOther: sourceOfFunds === "other"
          ? sourceOfFundsOther.trim()
          : null,
        personTin: personTin.trim(),
        currentAddress: addressInput(currentAddress),
        business: merchant ? {
          legalType,
          industry,
          age,
          size,
          estimatedMonthlyVolume,
          tin: businessTin.trim(),
          address: addressInput(businessAddress),
        } : null,
      });
      await onSaved();
    } catch (submitError) {
      setError(submitError instanceof Error
        ? submitError.message
        : "Activation details could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="mt-5 grid gap-4 border-t border-border pt-5"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div>
        <h3 className="text-base font-semibold">Activation details</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          PayMongo still needs these details before the payout account can be
          activated. Identity verification supplies the legal name and date of
          birth.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Nationality" value={nationality} onChange={setNationality} placeholder="PHL" autoComplete="off" />
        <TextField label="Place of birth city" value={placeOfBirthCity} onChange={setPlaceOfBirthCity} />
        <TextField label="Place of birth country" value={placeOfBirthCountry} onChange={setPlaceOfBirthCountry} placeholder="PH" autoComplete="off" />
        <TextField label="Personal TIN" value={personTin} onChange={setPersonTin} autoComplete="off" />
        <ChoiceField label="Nature of work" value={natureOfWork} onChange={setNatureOfWork} options={NATURE_OF_WORK} />
        <ChoiceField label="Source of funds" value={sourceOfFunds} onChange={setSourceOfFunds} options={SOURCE_OF_FUNDS} />
        {sourceOfFunds === "salary" ? (
          <TextField label="Employer name" value={sourceOfFundsSalary} onChange={setSourceOfFundsSalary} />
        ) : null}
        {sourceOfFunds === "other" ? (
          <TextField label="Source of other funds" value={sourceOfFundsOther} onChange={setSourceOfFundsOther} />
        ) : null}
      </div>
      <AddressFields legend="Current address" value={currentAddress} onChange={setCurrentAddress} />
      {merchant ? (
        <fieldset className="grid gap-4">
          <legend className="text-sm font-semibold">Registered business</legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <ChoiceField label="Legal business type" value={legalType} onChange={setLegalType} options={BUSINESS_TYPES} />
            <ChoiceField label="Merchant category" value={industry} onChange={setIndustry} options={PAYMONGO_MERCHANT_CATEGORY_CODES.map((code) => [code, code] as const)} />
            <ChoiceField label="Business age" value={age} onChange={setAge} options={BUSINESS_AGES} />
            <ChoiceField label="Business size" value={size} onChange={setSize} options={BUSINESS_SIZES} />
            <ChoiceField label="Estimated monthly volume (PHP)" value={estimatedMonthlyVolume} onChange={setEstimatedMonthlyVolume} options={MONTHLY_VOLUMES} />
            <TextField label="Business TIN" value={businessTin} onChange={setBusinessTin} autoComplete="off" />
          </div>
          <AddressFields legend="Business address" value={businessAddress} onChange={setBusinessAddress} />
        </fieldset>
      ) : null}
      {error ? (
        <p className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={saving}>
          {saving ? "Saving..." : "Save activation details"}
        </Button>
      </div>
    </form>
  );
}

function addressInput(value: AddressState) {
  return {
    line1: value.line1.trim(),
    line2: value.line2.trim() || null,
    city: value.city.trim(),
    state: value.state,
    country: "PH" as const,
    postalCode: value.postalCode.trim(),
  };
}

function AddressFields({
  legend,
  value,
  onChange,
}: {
  legend: string;
  value: AddressState;
  onChange: (value: AddressState) => void;
}) {
  const update = (key: keyof AddressState, next: string) => {
    onChange({...value, [key]: next});
  };
  return (
    <fieldset className="grid gap-4 sm:grid-cols-2">
      <legend className="text-sm font-semibold">{legend}</legend>
      <TextField idPrefix={legend} label="Street address" value={value.line1} onChange={(next) => update("line1", next)} />
      <TextField idPrefix={legend} label="Address line 2" value={value.line2} onChange={(next) => update("line2", next)} required={false} />
      <TextField idPrefix={legend} label="City" value={value.city} onChange={(next) => update("city", next)} />
      <ChoiceField idPrefix={legend} label="Region" value={value.state} onChange={(next) => update("state", next)} options={PAYMONGO_PHILIPPINE_STATE_CODES.map((code) => [code, code] as const)} />
      <TextField idPrefix={legend} label="Postal code" value={value.postalCode} onChange={(next) => update("postalCode", next)} />
    </fieldset>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  autoComplete,
  required = true,
  idPrefix = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  idPrefix?: string;
}) {
  const id = `payout-${`${idPrefix} ${label}`.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}`;
  return (
    <label className="grid gap-1 text-sm font-medium" htmlFor={id}>
      {label}
      <Input id={id} required={required} value={value} placeholder={placeholder} autoComplete={autoComplete} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function ChoiceField({
  label,
  value,
  onChange,
  options,
  idPrefix = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: readonly (readonly [string, string])[];
  idPrefix?: string;
}) {
  const id = `payout-${`${idPrefix} ${label}`.toLowerCase().replace(/[^a-z0-9]+/gu, "-")}`;
  return (
    <label className="grid gap-1 text-sm font-medium" htmlFor={id}>
      {label}
      <select
        id={id}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-14 w-full rounded-lg border border-input bg-card px-4 text-base"
      >
        <option value="">Select</option>
        {options.map(([optionValue, optionLabel]) => (
          <option key={optionValue} value={optionValue}>{optionLabel}</option>
        ))}
      </select>
    </label>
  );
}
