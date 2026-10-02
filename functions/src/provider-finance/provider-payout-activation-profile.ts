import {HttpsError} from "firebase-functions/v2/https";

import {
  requireEnum,
  requireObject,
  requireString,
} from "../shared/validation.js";
import {
  PAYMONGO_MERCHANT_CATEGORY_CODES,
  PAYMONGO_PHILIPPINE_STATE_CODES,
  type PayMongoMerchantCategoryCode,
  type PayMongoPhilippineStateCode,
} from "./paymongo-account-codes.js";
import type {ProviderLinkedAccountType} from "./provider-payment-account-domain.js";

export const PAYMONGO_NATURE_OF_WORK_VALUES = [
  "employed_locally",
  "retired",
  "pensioner",
  "ofw",
  "ofw_beneficiary",
  "student",
  "self_employed",
  "unemployed_spouse_income",
  "unemployed_other_income",
] as const;

export const PAYMONGO_SOURCE_OF_FUNDS_VALUES = [
  "allowance",
  "commission",
  "donation",
  "other",
  "pension",
  "salary",
] as const;

export const PAYMONGO_BUSINESS_LEGAL_TYPES = [
  "sole_proprietor",
  "partnership",
  "corporation",
] as const;

export const PAYMONGO_BUSINESS_AGE_VALUES = [
  "less_than_1_year",
  "between_1_and_2_years",
  "between_2_and_5_years",
  "greater_than_5_years",
] as const;

export const PAYMONGO_BUSINESS_SIZE_VALUES = [
  "less_than_10",
  "between_10_and_50",
  "between_51_and_250",
  "greater_than_250",
] as const;

export const PAYMONGO_MONTHLY_VOLUME_VALUES = [
  "less_than_100K",
  "between_100K_and_300K",
  "between_300K_and_500K",
  "between_500K_and_1M",
  "between_1M_and_3M",
  "greater_than_3M",
] as const;

const BROWSER_AUTHORITY_FIELDS = [
  "paymongoAccountId",
  "payMongoAccountId",
  "payoutReady",
  "accountId",
  "account_id",
  "orgId",
  "childAccountId",
  "child_account_id",
  "invitationId",
] as const;

export type PayMongoNatureOfWork =
  (typeof PAYMONGO_NATURE_OF_WORK_VALUES)[number];

export type PayMongoSourceOfFunds =
  (typeof PAYMONGO_SOURCE_OF_FUNDS_VALUES)[number];

export type PayMongoBusinessLegalType =
  (typeof PAYMONGO_BUSINESS_LEGAL_TYPES)[number];

export type PayMongoBusinessAge =
  (typeof PAYMONGO_BUSINESS_AGE_VALUES)[number];

export type PayMongoBusinessSize =
  (typeof PAYMONGO_BUSINESS_SIZE_VALUES)[number];

export type PayMongoMonthlyVolume =
  (typeof PAYMONGO_MONTHLY_VOLUME_VALUES)[number];

export type ProviderPayoutActivationAddress = {
  line1: string;
  line2: string | null;
  city: string;
  state: PayMongoPhilippineStateCode;
  country: "PH";
  postalCode: string;
};

export type ProviderPayoutActivationBusiness = {
  legalType: PayMongoBusinessLegalType;
  address: ProviderPayoutActivationAddress;
  industry: PayMongoMerchantCategoryCode;
  age: PayMongoBusinessAge;
  size: PayMongoBusinessSize;
  estimatedMonthlyVolume: PayMongoMonthlyVolume;
  tin: string;
};

export type ProviderPayoutActivationProfile = {
  nationality: string;
  placeOfBirthCity: string;
  placeOfBirthCountry: string;
  natureOfWork: PayMongoNatureOfWork;
  sourceOfFunds: PayMongoSourceOfFunds;
  sourceOfFundsSalary: string | null;
  sourceOfFundsOther: string | null;
  personTin: string;
  currentAddress: ProviderPayoutActivationAddress;
  business: ProviderPayoutActivationBusiness | null;
};

const PERSON_FIELDS = [
  "nationality",
  "placeOfBirthCity",
  "placeOfBirthCountry",
  "natureOfWork",
  "sourceOfFunds",
  "sourceOfFundsSalary",
  "sourceOfFundsOther",
  "personTin",
  "currentAddress",
  "business",
] as const;

const ADDRESS_FIELDS = [
  "line1",
  "line2",
  "city",
  "state",
  "country",
  "postalCode",
] as const;

const BUSINESS_FIELDS = [
  "legalType",
  "address",
  "industry",
  "age",
  "size",
  "estimatedMonthlyVolume",
  "tin",
] as const;

export function rejectBrowserPayoutAuthority(
  value: unknown,
): void {
  if (value === undefined || value === null) return;
  const input = requireObject(value, "data");
  const forbidden = BROWSER_AUTHORITY_FIELDS.filter(
    (field) => field in input,
  );
  if (forbidden.length > 0) {
    throw new HttpsError(
      "invalid-argument",
      "Payout account authority cannot be supplied by the browser.",
    );
  }
}

export function validateProviderPayoutActivationProfile(
  value: unknown,
  linkedAccountType: ProviderLinkedAccountType,
): ProviderPayoutActivationProfile {
  const input = requireObject(value);
  rejectBrowserPayoutAuthority(input);
  rejectUnknownFields(input, PERSON_FIELDS);

  const sourceOfFunds = requireEnum(
    input.sourceOfFunds,
    "sourceOfFunds",
    PAYMONGO_SOURCE_OF_FUNDS_VALUES,
  );
  const sourceOfFundsSalary = optionalDetail(
    input.sourceOfFundsSalary,
    "sourceOfFundsSalary",
  );
  const sourceOfFundsOther = optionalDetail(
    input.sourceOfFundsOther,
    "sourceOfFundsOther",
  );

  if (sourceOfFunds === "salary" && !sourceOfFundsSalary) {
    throw new HttpsError(
      "invalid-argument",
      "Enter the employer name for salary as the source of funds.",
    );
  }
  if (sourceOfFunds === "other" && !sourceOfFundsOther) {
    throw new HttpsError(
      "invalid-argument",
      "Enter the business or source name for other funds.",
    );
  }
  if (sourceOfFunds !== "salary" && sourceOfFundsSalary) {
    throw new HttpsError(
      "invalid-argument",
      "Employer name is only used when the source of funds is salary.",
    );
  }
  if (sourceOfFunds !== "other" && sourceOfFundsOther) {
    throw new HttpsError(
      "invalid-argument",
      "Other source name is only used when the source of funds is other.",
    );
  }

  const business = parseBusiness(
    input.business,
    linkedAccountType,
  );

  return {
    nationality: requireNationality(input.nationality),
    placeOfBirthCity: requireString(
      input.placeOfBirthCity,
      "placeOfBirthCity",
      {minLength: 2, maxLength: 80},
    ),
    placeOfBirthCountry: requireCountry(
      input.placeOfBirthCountry,
      "placeOfBirthCountry",
    ),
    natureOfWork: requireEnum(
      input.natureOfWork,
      "natureOfWork",
      PAYMONGO_NATURE_OF_WORK_VALUES,
    ),
    sourceOfFunds,
    sourceOfFundsSalary,
    sourceOfFundsOther,
    personTin: normalizeTin(input.personTin, "personTin"),
    currentAddress: parseAddress(
      input.currentAddress,
      "currentAddress",
    ),
    business,
  };
}

export function readStoredPayoutActivationProfile(
  value: unknown,
  linkedAccountType: ProviderLinkedAccountType,
): ProviderPayoutActivationProfile | null {
  if (!value || typeof value !== "object") return null;
  try {
    return validateProviderPayoutActivationProfile(
      value,
      linkedAccountType,
    );
  } catch {
    return null;
  }
}

export function payMongoActivationUpdateBody(input: {
  profile: ProviderPayoutActivationProfile;
  emailAddress: string;
  mobileNumber: string;
  tradeName: string;
  description: string;
}): {
  person: Record<string, unknown>;
  business?: Record<string, unknown>;
} {
  const description = input.description.trim();
  if (description.length < 1 || description.length > 255) {
    throw new HttpsError(
      "failed-precondition",
      "The business description must be 255 characters or fewer before activation.",
    );
  }
  const tradeName = input.tradeName.trim();
  if (tradeName.length < 2 || tradeName.length > 160) {
    throw new HttpsError(
      "failed-precondition",
      "The business name is not available for payout activation.",
    );
  }

  const person = {
    email_address: input.emailAddress,
    mobile_number: input.mobileNumber,
    nationality: input.profile.nationality,
    place_of_birth: {
      city: input.profile.placeOfBirthCity,
      country: input.profile.placeOfBirthCountry,
    },
    nature_of_work: input.profile.natureOfWork,
    source_of_funds: input.profile.sourceOfFunds,
    source_of_funds_salary: input.profile.sourceOfFundsSalary,
    source_of_funds_other: input.profile.sourceOfFundsOther,
    tin: input.profile.personTin,
    address: payMongoAddress(input.profile.currentAddress),
  };

  if (!input.profile.business) {
    return {person};
  }

  return {
    person,
    business: {
      trade_name: tradeName,
      type: input.profile.business.legalType,
      description,
      industry: input.profile.business.industry,
      age: input.profile.business.age,
      size: input.profile.business.size,
      estimated_monthly_volume:
        input.profile.business.estimatedMonthlyVolume,
      tin: input.profile.business.tin,
      address: payMongoAddress(input.profile.business.address),
    },
  };
}

function parseBusiness(
  value: unknown,
  linkedAccountType: ProviderLinkedAccountType,
): ProviderPayoutActivationBusiness | null {
  if (linkedAccountType === "consumer") {
    if (value !== undefined && value !== null) {
      throw new HttpsError(
        "invalid-argument",
        "Individual payout setup does not use business activation details.",
      );
    }
    return null;
  }

  const input = requireObject(value, "business");
  rejectUnknownFields(input, BUSINESS_FIELDS);
  return {
    legalType: requireEnum(
      input.legalType,
      "business.legalType",
      PAYMONGO_BUSINESS_LEGAL_TYPES,
    ),
    address: parseAddress(input.address, "business.address"),
    industry: requireEnum(
      input.industry,
      "business.industry",
      PAYMONGO_MERCHANT_CATEGORY_CODES,
    ),
    age: requireEnum(
      input.age,
      "business.age",
      PAYMONGO_BUSINESS_AGE_VALUES,
    ),
    size: requireEnum(
      input.size,
      "business.size",
      PAYMONGO_BUSINESS_SIZE_VALUES,
    ),
    estimatedMonthlyVolume: requireEnum(
      input.estimatedMonthlyVolume,
      "business.estimatedMonthlyVolume",
      PAYMONGO_MONTHLY_VOLUME_VALUES,
    ),
    tin: normalizeTin(input.tin, "business.tin"),
  };
}

function parseAddress(
  value: unknown,
  fieldName: string,
): ProviderPayoutActivationAddress {
  const input = requireObject(value, fieldName);
  rejectUnknownFields(input, ADDRESS_FIELDS);
  const line2 = input.line2;
  return {
    line1: requireString(input.line1, `${fieldName}.line1`, {
      minLength: 3,
      maxLength: 200,
    }),
    line2: line2 === undefined || line2 === null || line2 === ""
      ? null
      : requireString(line2, `${fieldName}.line2`, {
        minLength: 1,
        maxLength: 200,
      }),
    city: requireString(input.city, `${fieldName}.city`, {
      minLength: 2,
      maxLength: 80,
    }),
    state: requireEnum(
      input.state,
      `${fieldName}.state`,
      PAYMONGO_PHILIPPINE_STATE_CODES,
    ),
    country: requireEnum(
      input.country,
      `${fieldName}.country`,
      ["PH"] as const,
    ),
    postalCode: requirePostalCode(input.postalCode, fieldName),
  };
}

function payMongoAddress(
  address: ProviderPayoutActivationAddress,
): Record<string, string | null> {
  return {
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    state: address.state,
    country: address.country,
    postal_code: address.postalCode,
  };
}

function optionalDetail(
  value: unknown,
  fieldName: string,
): string | null {
  if (value === undefined || value === null || value === "") return null;
  return requireString(value, fieldName, {minLength: 2, maxLength: 160});
}

function requireNationality(value: unknown): string {
  const nationality = requireString(value, "nationality", {
    minLength: 3,
    maxLength: 3,
  }).toUpperCase();
  if (!/^[A-Z]{3}$/u.test(nationality)) {
    throw new HttpsError(
      "invalid-argument",
      "nationality has an invalid value.",
    );
  }
  return nationality;
}

function requireCountry(value: unknown, fieldName: string): string {
  const country = requireString(value, fieldName, {
    minLength: 2,
    maxLength: 2,
  }).toUpperCase();
  if (!/^[A-Z]{2}$/u.test(country)) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} has an invalid value.`,
    );
  }
  return country;
}

function requirePostalCode(
  value: unknown,
  fieldName: string,
): string {
  const postalCode = requireString(value, `${fieldName}.postalCode`, {
    minLength: 4,
    maxLength: 4,
  });
  if (!/^[0-9]{4}$/u.test(postalCode)) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName}.postalCode has an invalid value.`,
    );
  }
  return postalCode;
}

function normalizeTin(value: unknown, fieldName: string): string {
  const source = requireString(value, fieldName, {
    minLength: 9,
    maxLength: 24,
  });
  if (!/^[0-9\s-]+$/u.test(source)) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} may contain only digits, spaces, and hyphens.`,
    );
  }
  const digits = source.replace(/\D/gu, "");
  if (digits.length < 9 || digits.length > 15) {
    throw new HttpsError(
      "invalid-argument",
      `${fieldName} must contain between 9 and 15 digits.`,
    );
  }
  return digits;
}

function rejectUnknownFields(
  input: Readonly<Record<string, unknown>>,
  allowedFields: readonly string[],
): void {
  const allowed = new Set<string>(allowedFields);
  const unknown = Object.keys(input).filter((field) => !allowed.has(field));
  if (unknown.length > 0) {
    throw new HttpsError(
      "invalid-argument",
      `Unsupported payout activation fields: ${unknown.join(", ")}.`,
    );
  }
}
