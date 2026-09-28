import {
  logSecurityEvent,
} from "../shared/security-events.js";

export type PayMongoLinkedAccountType =
  | "merchant"
  | "consumer";

export type PayMongoInvitationStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "cancelled";

export type PayMongoAccountActivationStatus =
  | "pending"
  | "under_review"
  | "activated"
  | "declined";

export type PayMongoLinkedAccountInvitation = {
  invitationId: string;
  email: string;
  accountType:
    PayMongoLinkedAccountType;
  status:
    PayMongoInvitationStatus;
  childAccountId:
    string | null;
};

export type PayMongoLinkedAccountRelationship = {
  relationshipId: string;

  linkingRequestId:
    string | null;

  enabled: boolean;

  parentAccountId:
    string;

  childAccountId:
    string;
};

export type PayMongoIdentityVerificationStatus =
  | "pending"
  | "processing"
  | "for_review"
  | "passed"
  | "passed_attestation_form"
  | "passed_kyc_reliance"
  | "failed";

export type PayMongoLinkedAccount = {
  accountId: string;
  accountType:
    PayMongoLinkedAccountType;
  activationStatus:
    PayMongoAccountActivationStatus;
  identityVerificationStatus:
    PayMongoIdentityVerificationStatus |
    null;
  relationshipId:
    string | null;
  legalIdentityPresent:
    boolean;
};

export type PayMongoIdentityVerificationSession = {
  verificationId: string;
  hostedUrl: string;
};

export class PayMongoLinkedAccountRequestError
  extends Error {
  readonly certainty:
    "gateway_rejected" |
    "ambiguous";

  readonly statusCode:
    number | null;

  readonly missingPointers:
    readonly string[];

  constructor(
    message: string,
    certainty:
      "gateway_rejected" |
      "ambiguous",
    statusCode:
      number | null,
    missingPointers:
      readonly string[] = [],
  ) {
    super(message);

    this.name =
      "PayMongoLinkedAccountRequestError";

    this.certainty =
      certainty;

    this.statusCode =
      statusCode;

    this.missingPointers =
      missingPointers;
  }
}

export async function createPayMongoLinkedAccountInvite(
  input: {
    secretKey: string;
    email: string;
    accountType:
      PayMongoLinkedAccountType;
  },
): Promise<PayMongoLinkedAccountInvitation> {
  const email =
    normalizeEmail(
      input.email,
    );

  const response =
    await payMongoLinkedAccountRequest(
      input.secretKey,
      "/v2/linking-requests/invites",
      {
        method: "POST",

        body: JSON.stringify({
          invites: [
            {
              email,

              account_type:
                input.accountType,
            },
          ],
        }),
      },
    );

  const invitation =
    parsePayMongoLinkedAccountInviteResponse(
      response,
    );

  if (
    invitation.email !== email ||
    invitation.accountType !==
      input.accountType
  ) {
    throw new PayMongoLinkedAccountRequestError(
      "PayMongo linked-account invitation response is inconsistent.",
      "ambiguous",
      null,
    );
  }

  return invitation;
}

export async function retrievePayMongoLinkedAccountInvitation(
  input: {
    secretKey: string;
    invitationId: string;
  },
): Promise<PayMongoLinkedAccountInvitation> {
  const invitationId =
    requireInvitationId(
      input.invitationId,
    );

  const response =
    await payMongoLinkedAccountRequest(
      input.secretKey,
      `/v2/linking-requests/${encodeURIComponent(invitationId)}`,
      {
        method: "GET",
      },
    );

  const invitation =
    parsePayMongoLinkedAccountInvitation(
      response,
    );

  if (
    invitation.invitationId !==
      invitationId
  ) {
    throw new PayMongoLinkedAccountRequestError(
      "PayMongo invitation identity is inconsistent.",
      "ambiguous",
      null,
    );
  }

  return invitation;
}

export async function retrievePayMongoLinkedAccount(
  input: {
    secretKey: string;
    accountId: string;
  },
): Promise<PayMongoLinkedAccount> {
  const accountId =
    requireAccountId(
      input.accountId,
    );

  const response =
    await payMongoLinkedAccountRequest(
      input.secretKey,
      `/v2/accounts/${encodeURIComponent(accountId)}`,
      {
        method: "GET",
      },
    );

  const account =
    parsePayMongoLinkedAccountResource(
      response,
    );

  if (
    account.accountId !==
      accountId
  ) {
    throw new PayMongoLinkedAccountRequestError(
      "PayMongo linked-account identity is inconsistent.",
      "ambiguous",
      null,
    );
  }

  return account;
}

export async function createPayMongoChildAccount(
  input: {
    secretKey: string;
    accountType:
      PayMongoLinkedAccountType;
    emailAddress: string;
    mobileNumber: string;
  },
): Promise<PayMongoLinkedAccount> {
  const response =
    await payMongoLinkedAccountRequest(
      input.secretKey,
      "/v2/accounts",
      {
        method: "POST",
        body: JSON.stringify({
          type: input.accountType,
          person: {
            email_address:
              normalizeEmail(
                input.emailAddress,
              ),
            mobile_number:
              requireMobileNumber(
                input.mobileNumber,
              ),
          },
        }),
      },
    );

  const account =
    parsePayMongoLinkedAccountResource(
      response,
    );

  if (
    account.accountType !==
      input.accountType
  ) {
    throw new PayMongoLinkedAccountRequestError(
      "PayMongo child-account type is inconsistent.",
      "ambiguous",
      null,
    );
  }

  return account;
}

export async function createPayMongoIdentityVerificationSession(
  input: {
    secretKey: string;
    accountId: string;
  },
): Promise<PayMongoIdentityVerificationSession> {
  const accountId =
    requireAccountId(
      input.accountId,
    );

  const response =
    await payMongoLinkedAccountRequest(
      input.secretKey,
      `/v2/accounts/${encodeURIComponent(accountId)}/identity_verification`,
      {
        method: "POST",
      },
    );

  return parsePayMongoIdentityVerificationSession(
    response,
    accountId,
  );
}

export async function updatePayMongoChildAccount(
  input: {
    secretKey: string;
    accountId: string;
    body: {
      person: Record<string, unknown>;
      business?: Record<string, unknown>;
    };
  },
): Promise<PayMongoLinkedAccount> {
  const accountId =
    requireAccountId(
      input.accountId,
    );

  const response =
    await payMongoLinkedAccountRequest(
      input.secretKey,
      `/v2/accounts/${encodeURIComponent(accountId)}`,
      {
        method: "PATCH",
        body: JSON.stringify(
          input.body,
        ),
      },
    );

  const account =
    parsePayMongoLinkedAccountResource(
      response,
    );

  if (account.accountId !== accountId) {
    throw new PayMongoLinkedAccountRequestError(
      "PayMongo child-account identity is inconsistent.",
      "ambiguous",
      null,
    );
  }

  return account;
}

export async function activatePayMongoChildAccount(
  input: {
    secretKey: string;
    accountId: string;
  },
): Promise<PayMongoLinkedAccount> {
  const accountId =
    requireAccountId(
      input.accountId,
    );

  const response =
    await payMongoLinkedAccountRequest(
      input.secretKey,
      `/v2/accounts/${encodeURIComponent(accountId)}/activate`,
      {
        method: "POST",
      },
    );

  const account =
    parsePayMongoLinkedAccountResource(
      response,
    );

  if (account.accountId !== accountId) {
    throw new PayMongoLinkedAccountRequestError(
      "PayMongo child-account identity is inconsistent.",
      "ambiguous",
      null,
    );
  }

  return account;
}

/*
 * Read-only PayMongo Relationship API integration.
 *
 * FEASTA discovers the relationship by the canonical child account
 * and onboarding invitation, then retrieves the exact relationship
 * again by ID before trusting it.
 *
 * No relationship mutation and no money movement happen here.
 */
export async function findPayMongoLinkedAccountRelationship(
  input: {
    secretKey: string;
    childAccountId: string;
    invitationId: string;
  },
): Promise<
  PayMongoLinkedAccountRelationship |
  null
> {
  const childAccountId =
    requireAccountId(
      input.childAccountId,
    );

  const invitationId =
    requireInvitationId(
      input.invitationId,
    );

  const query =
    new URLSearchParams({
      child_account_id:
        childAccountId,

      limit:
        "100",
    });

  const response =
    await payMongoLinkedAccountRequest(
      input.secretKey,

      `/v2/relationships?${query.toString()}`,

      {
        method: "GET",
      },
    );

  const root =
    asRecord(response);

  if (!Array.isArray(root.data)) {
    throw invalidResponse(
      "PayMongo relationships response is invalid.",
    );
  }

  if (
    typeof root.has_more !==
      "boolean"
  ) {
    throw invalidResponse(
      "PayMongo relationships pagination state is invalid.",
    );
  }

  /*
   * FEASTA deliberately does not guess cursor semantics here.
   *
   * The request is already filtered to one child account and asks
   * for the maximum documented page size. If PayMongo says another
   * page exists, fail closed rather than risk selecting an incomplete
   * relationship set.
   */
  if (root.has_more) {
    throw new PayMongoLinkedAccountRequestError(
      "PayMongo relationship discovery returned more than one page.",
      "ambiguous",
      null,
    );
  }

  const matches:
    PayMongoLinkedAccountRelationship[] =
      [];

  for (const value of root.data) {
    const relationship =
      parsePayMongoLinkedAccountRelationship(
        value,
      );

    if (
      relationship.childAccountId !==
        childAccountId
    ) {
      throw invalidResponse(
        "PayMongo relationship discovery returned an unexpected child account.",
      );
    }

    if (
      relationship.linkingRequestId ===
        invitationId
    ) {
      matches.push(
        relationship,
      );
    }
  }

  if (matches.length === 0) {
    return null;
  }

  if (matches.length !== 1) {
    throw new PayMongoLinkedAccountRequestError(
      "PayMongo relationship discovery is ambiguous.",
      "ambiguous",
      null,
    );
  }

  const discovered =
    matches[0];

  const relationship =
    await retrievePayMongoLinkedAccountRelationship({
      secretKey:
        input.secretKey,

      relationshipId:
        discovered.relationshipId,
    });

  if (
    relationship.childAccountId !==
      childAccountId ||
    relationship.linkingRequestId !==
      invitationId
  ) {
    throw new PayMongoLinkedAccountRequestError(
      "PayMongo relationship linkage changed during verification.",
      "ambiguous",
      null,
    );
  }

  return relationship;
}

export async function retrievePayMongoLinkedAccountRelationship(
  input: {
    secretKey: string;
    relationshipId: string;
  },
): Promise<
  PayMongoLinkedAccountRelationship
> {
  const relationshipId =
    requireRelationshipId(
      input.relationshipId,
    );

  const response =
    await payMongoLinkedAccountRequest(
      input.secretKey,

      `/v2/relationships/${encodeURIComponent(
        relationshipId,
      )}`,

      {
        method: "GET",
      },
    );

  const relationship =
    parsePayMongoLinkedAccountRelationship(
      response,
    );

  if (
    relationship.relationshipId !==
      relationshipId
  ) {
    throw new PayMongoLinkedAccountRequestError(
      "PayMongo relationship identity is inconsistent.",
      "ambiguous",
      null,
    );
  }

  return relationship;
}

export function parsePayMongoLinkedAccountInviteResponse(
  value: unknown,
): PayMongoLinkedAccountInvitation {
  const root =
    asRecord(value);

  const invites =
    root.invites;

  if (
    !Array.isArray(invites) ||
    invites.length !== 1
  ) {
    throw invalidResponse(
      "PayMongo linked-account invitation response is invalid.",
    );
  }

  return parsePayMongoLinkedAccountInvitation(
    invites[0],
  );
}

export function parsePayMongoLinkedAccountInvitation(
  value: unknown,
): PayMongoLinkedAccountInvitation {
  const record =
    unwrapDataRecord(
      value,
    );

  const invitationId =
    requireInvitationId(
      record.invitation_id,
    );

  const email =
    normalizeEmail(
      record.email,
    );

  const accountType =
    parseAccountType(
      record.account_type,
    );

  const status =
    parseInvitationStatus(
      record.status,
    );

  const childAccountId =
    optionalExternalId(
      record.child_account_id,
    );

  return {
    invitationId,
    email,
    accountType,
    status,
    childAccountId,
  };
}

export function parsePayMongoLinkedAccountResource(
  value: unknown,
): PayMongoLinkedAccount {
  const root =
    asRecord(value);

  const data =
    asRecord(
      root.data,
    );

  /*
   * Intentionally read ONLY these safe fields.
   *
   * PayMongo's full Account resource can contain
   * person, business and bank details, including
   * bank account numbers. FEASTA does not return
   * or persist those fields.
   */
  const person =
    data.person &&
    typeof data.person === "object" &&
    !Array.isArray(data.person)
      ? data.person as Record<string, unknown>
      : null;

  const relationship =
    data.relationship &&
    typeof data.relationship === "object" &&
    !Array.isArray(data.relationship)
      ? data.relationship as Record<string, unknown>
      : null;

  return {
    accountId:
      requireAccountId(
        data.id,
      ),

    accountType:
      parseAccountType(
        data.type,
      ),

    activationStatus:
      parseActivationStatus(
        data.activation_status,
      ),

    identityVerificationStatus:
      person
        ? parseOptionalIdentityStatus(
          person.identity_verification_status,
        )
        : null,

    relationshipId:
      relationship
        ? optionalRelationshipId(
          relationship.id,
        )
        : null,

    legalIdentityPresent:
      legalIdentityIsPresent(
        person,
      ),
  };
}

export function parsePayMongoIdentityVerificationSession(
  value: unknown,
  expectedAccountId: string,
): PayMongoIdentityVerificationSession {
  const data =
    unwrapDataRecord(
      value,
    );

  const attributes =
    data.attributes &&
    typeof data.attributes === "object" &&
    !Array.isArray(data.attributes)
      ? data.attributes as Record<string, unknown>
      : null;

  const accountId =
    optionalExternalId(
      data.account_id,
    );

  if (
    accountId &&
    accountId !== expectedAccountId
  ) {
    throw invalidResponse(
      "PayMongo identity-verification account is inconsistent.",
    );
  }

  return {
    verificationId:
      requireVerificationId(
        data.id,
      ),

    hostedUrl:
      requireHostedVerificationUrl(
        data.url ??
        data.hosted_url ??
        attributes?.hosted_url ??
        attributes?.url,
      ),
  };
}

/*
 * Parse only the relationship fields FEASTA needs for settlement
 * authorization.
 *
 * Never persist policy payloads, user details, bank information,
 * or unrelated account attributes.
 */
export function parsePayMongoLinkedAccountRelationship(
  value: unknown,
): PayMongoLinkedAccountRelationship {
  const root =
    asRecord(value);

  const data =
    root.data !== undefined
      ? asRecord(root.data)
      : root;

  const relationshipId =
    requireRelationshipId(
      data.id ??
      data.relationship_id,
    );

  const enabled =
    data.enabled;

  if (typeof enabled !== "boolean") {
    throw invalidResponse(
      "PayMongo relationship enabled status is invalid.",
    );
  }

  const parentAccount =
    asRecord(
      data.parent_account,
    );

  const childAccount =
    asRecord(
      data.child_account,
    );

  const parentAccountId =
    requireAccountId(
      parentAccount.id,
    );

  const childAccountId =
    requireAccountId(
      childAccount.id,
    );

  const linkingRequestId =
    data.linking_request_id ===
      null ||
    data.linking_request_id ===
      undefined
      ? null
      : requireInvitationId(
          data.linking_request_id,
        );

  return {
    relationshipId,

    linkingRequestId,

    enabled,

    parentAccountId,

    childAccountId,
  };
}

function requireRelationshipId(
  value: unknown,
): string {
  if (
    typeof value !== "string" ||
    !/^mr_[A-Za-z0-9]+$/u
      .test(value)
  ) {
    throw invalidResponse(
      "PayMongo relationship ID is invalid.",
    );
  }

  return value;
}

export function buildPayMongoLinkedAccountSignupUrl(
  input: {
    email: string;
    invitationId: string;
  },
): string {
  const email =
    normalizeEmail(
      input.email,
    );

  const invitationId =
    requireInvitationId(
      input.invitationId,
    );

  const url =
    new URL(
      "https://dashboard.paymongo.com/signup",
    );

  url.searchParams.set(
    "email",
    email,
  );

  url.searchParams.set(
    "invitation_code",
    invitationId,
  );

  return url.toString();
}

async function payMongoLinkedAccountRequest(
  secretKey: string,
  path: string,
  init: RequestInit,
): Promise<unknown> {
  if (
    typeof secretKey !== "string" ||
    !secretKey.startsWith("sk_")
  ) {
    logSecurityEvent({
      action:
        "configuration_failure",

      outcome:
        "failed",

      targetId:
        "paymongo_linked_accounts",

      reasonCode:
        "secret_key_missing_or_invalid",
    });

    throw new PayMongoLinkedAccountRequestError(
      "PayMongo secret key is not configured.",
      "gateway_rejected",
      null,
    );
  }

  if (
    !path.startsWith(
      "/v2/",
    )
  ) {
    throw new PayMongoLinkedAccountRequestError(
      "PayMongo linked-account path is invalid.",
      "gateway_rejected",
      null,
    );
  }

  const authorization =
    Buffer.from(
      `${secretKey}:`,
    ).toString(
      "base64",
    );

  let response: Response;

  try {
    response =
      await fetch(
        `https://api.paymongo.com${path}`,
        {
          ...init,

          headers: {
            Accept:
              "application/json",

            Authorization:
              `Basic ${authorization}`,

            "Content-Type":
              "application/json",

            ...init.headers,
          },

          signal:
            AbortSignal.timeout(
              15_000,
            ),
        },
      );
  }
  catch {
    throw new PayMongoLinkedAccountRequestError(
      "PayMongo linked-account request outcome is unknown.",
      "ambiguous",
      null,
    );
  }

  if (!response.ok) {
    /*
     * Never expose or log the PayMongo response
     * body. It may contain account/person data.
     * Field pointers are safe category names.
     */
    const missingPointers =
      await readMissingPointers(
        response,
      );

    const rejected =
      response.status >= 400 &&
      response.status < 500 &&
      response.status !== 408 &&
      response.status !== 409 &&
      response.status !== 425 &&
      response.status !== 429;

    throw new PayMongoLinkedAccountRequestError(
      "PayMongo linked-account request failed.",
      rejected
        ? "gateway_rejected"
        : "ambiguous",
      response.status,
      missingPointers,
    );
  }

  try {
    return await response.json();
  }
  catch {
    throw new PayMongoLinkedAccountRequestError(
      "PayMongo linked-account response could not be decoded.",
      "ambiguous",
      response.status,
    );
  }
}

function parseAccountType(
  value: unknown,
): PayMongoLinkedAccountType {
  if (
    value === "merchant" ||
    value === "consumer"
  ) {
    return value;
  }

  throw invalidResponse(
    "PayMongo linked-account type is invalid.",
  );
}

function parseInvitationStatus(
  value: unknown,
): PayMongoInvitationStatus {
  if (
    value === "pending" ||
    value === "accepted" ||
    value === "declined" ||
    value === "cancelled"
  ) {
    return value;
  }

  throw invalidResponse(
    "PayMongo invitation status is invalid.",
  );
}

function parseOptionalIdentityStatus(
  value: unknown,
): PayMongoIdentityVerificationStatus | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (
    value === "pending" ||
    value === "processing" ||
    value === "for_review" ||
    value === "passed" ||
    value === "passed_attestation_form" ||
    value === "passed_kyc_reliance" ||
    value === "failed"
  ) {
    return value;
  }

  throw invalidResponse(
    "PayMongo identity verification status is invalid.",
  );
}

function legalIdentityIsPresent(
  person: Record<string, unknown> | null,
): boolean {
  if (!person) return false;
  const birth =
    person.date_of_birth &&
    typeof person.date_of_birth === "object" &&
    !Array.isArray(person.date_of_birth)
      ? person.date_of_birth as Record<string, unknown>
      : null;

  return (
    nonEmpty(person.first_name) &&
    nonEmpty(person.last_name) &&
    typeof birth?.day === "number" &&
    typeof birth.month === "number" &&
    typeof birth.year === "number"
  );
}

function nonEmpty(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function optionalRelationshipId(
  value: unknown,
): string | null {
  if (value === undefined || value === null) return null;
  if (
    typeof value !== "string" ||
    !/^mr_[A-Za-z0-9]+$/u.test(value)
  ) {
    throw invalidResponse(
      "PayMongo relationship ID is invalid.",
    );
  }
  return value;
}

function requireVerificationId(
  value: unknown,
): string {
  if (
    typeof value !== "string" ||
    !/^verif_[A-Za-z0-9]+$/u.test(value)
  ) {
    throw invalidResponse(
      "PayMongo identity-verification ID is invalid.",
    );
  }
  return value;
}

function requireHostedVerificationUrl(
  value: unknown,
): string {
  if (typeof value !== "string") {
    throw invalidResponse(
      "PayMongo identity-verification URL is invalid.",
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalidResponse(
      "PayMongo identity-verification URL is invalid.",
    );
  }

  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== "https:" ||
    (
      host !== "paymongo.com" &&
      !host.endsWith(".paymongo.com")
    )
  ) {
    throw invalidResponse(
      "PayMongo identity-verification URL is invalid.",
    );
  }

  return url.toString();
}

function requireMobileNumber(
  value: unknown,
): string {
  if (
    typeof value !== "string" ||
    !/^\+[1-9]\d{4,15}$/u.test(value)
  ) {
    throw invalidResponse(
      "PayMongo mobile number is invalid.",
    );
  }
  return value;
}

async function readMissingPointers(
  response: Response,
): Promise<string[]> {
  try {
    const body: unknown = await response.json();
    if (
      !body ||
      typeof body !== "object" ||
      !("errors" in body) ||
      !Array.isArray(body.errors)
    ) {
      return [];
    }

    const pointers: string[] = [];
    for (const error of body.errors) {
      if (!error || typeof error !== "object") continue;
      const source =
        "source" in error &&
        error.source &&
        typeof error.source === "object"
          ? error.source as Record<string, unknown>
          : null;
      const pointer = source?.pointer;
      if (
        typeof pointer === "string" &&
        /^[A-Za-z0-9_./]{1,120}$/u.test(pointer)
      ) {
        pointers.push(pointer);
      }
    }
    return pointers;
  } catch {
    return [];
  }
}

function parseActivationStatus(
  value: unknown,
): PayMongoAccountActivationStatus {
  if (
    value === "pending" ||
    value === "under_review" ||
    value === "activated" ||
    value === "declined"
  ) {
    return value;
  }

  throw invalidResponse(
    "PayMongo account activation status is invalid.",
  );
}

function requireInvitationId(
  value: unknown,
): string {
  if (
    typeof value !== "string" ||
    !/^lr_[A-Za-z0-9_-]{3,200}$/u
      .test(value)
  ) {
    throw invalidResponse(
      "PayMongo invitation ID is invalid.",
    );
  }

  return value;
}

function requireAccountId(
  value: unknown,
): string {
  if (
    typeof value !== "string" ||
    !/^org_[A-Za-z0-9_-]{3,200}$/u
      .test(value)
  ) {
    throw invalidResponse(
      "PayMongo account ID is invalid.",
    );
  }

  return value;
}

function optionalExternalId(
  value: unknown,
): string | null {
  if (
    value === undefined ||
    value === null
  ) {
    return null;
  }

  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9_-]{3,220}$/u
      .test(value)
  ) {
    throw invalidResponse(
      "PayMongo child-account reference is invalid.",
    );
  }

  return value;
}

function normalizeEmail(
  value: unknown,
): string {
  if (
    typeof value !== "string"
  ) {
    throw invalidResponse(
      "PayMongo invitation email is invalid.",
    );
  }

  const normalized =
    value.trim().toLowerCase();

  if (
    normalized.length < 3 ||
    normalized.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u
      .test(normalized)
  ) {
    throw invalidResponse(
      "PayMongo invitation email is invalid.",
    );
  }

  return normalized;
}

function unwrapDataRecord(
  value: unknown,
): Record<string, unknown> {
  const root =
    asRecord(value);

  if (
    root.data &&
    typeof root.data === "object" &&
    !Array.isArray(root.data)
  ) {
    return asRecord(
      root.data,
    );
  }

  return root;
}

function asRecord(
  value: unknown,
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw invalidResponse(
      "PayMongo linked-account response is invalid.",
    );
  }

  return value as
    Record<string, unknown>;
}

function invalidResponse(
  message: string,
): PayMongoLinkedAccountRequestError {
  return new PayMongoLinkedAccountRequestError(
    message,
    "ambiguous",
    null,
  );
}