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

export type PayMongoLinkedAccount = {
  accountId: string;
  accountType:
    PayMongoLinkedAccountType;
  activationStatus:
    PayMongoAccountActivationStatus;
};

export class PayMongoLinkedAccountRequestError
  extends Error {
  readonly certainty:
    "gateway_rejected" |
    "ambiguous";

  readonly statusCode:
    number | null;

  constructor(
    message: string,
    certainty:
      "gateway_rejected" |
      "ambiguous",
    statusCode:
      number | null,
  ) {
    super(message);

    this.name =
      "PayMongoLinkedAccountRequestError";

    this.certainty =
      certainty;

    this.statusCode =
      statusCode;
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
  };
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
     */
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