import {
  logSecurityEvent,
} from "../shared/security-events.js";

export type PayMongoWalletStatus =
  | "activated"
  | "deactivated"
  | "frozen";

export type PayMongoSettlementSourceWallet = {
  walletId: string;

  merchantId: string;

  livemode: boolean;

  isDefault: boolean;

  status:
    PayMongoWalletStatus;

  availableBalanceInCentavos:
    number;

  pendingBalanceInCentavos:
    number;

  accountProvider:
    "paymongo";

  /*
   * Server-memory-only transfer identifier.
   *
   * C3D does not persist or expose this value.
   */
  accountNumber: string;

  currency:
    "PHP";
};

type UnknownRecord =
  Record<string, unknown>;

export class PayMongoWalletRequestError
  extends Error {
  readonly certainty:
    | "gateway_rejected"
    | "ambiguous";

  readonly statusCode:
    number | null;

  constructor(
    message: string,

    certainty:
      | "gateway_rejected"
      | "ambiguous",

    statusCode:
      number | null,
  ) {
    super(message);

    this.name =
      "PayMongoWalletRequestError";

    this.certainty =
      certainty;

    this.statusCode =
      statusCode;
  }
}

/*
 * Reads FEASTA's own PayMongo wallets.
 *
 * No Account-ID header is accepted here. This intentionally executes
 * only in the authenticated parent/platform account context.
 */
export async function listPayMongoWallets(
  input: {
    secretKey: string;

    status?:
      | "activated"
      | "deactivated";
  },
): Promise<
  PayMongoSettlementSourceWallet[]
> {
  const query =
    new URLSearchParams();

  if (input.status) {
    query.set(
      "status",
      input.status,
    );
  }

  query.append(
    "fields",
    "balance",
  );

  query.append(
    "fields",
    "account",
  );

  const response =
    await payMongoWalletRequest(
      input.secretKey,

      `/v2/wallets?${query.toString()}`,

      {
        method:
          "GET",
      },
    );

  return parsePayMongoWalletList(
    response,
  );
}

export async function retrievePayMongoWallet(
  input: {
    secretKey: string;
    walletId: string;
  },
): Promise<
  PayMongoSettlementSourceWallet
> {
  const walletId =
    requireWalletId(
      input.walletId,
    );

  const query =
    new URLSearchParams();

  query.append(
    "fields",
    "balance",
  );

  query.append(
    "fields",
    "account",
  );

  const response =
    await payMongoWalletRequest(
      input.secretKey,

      `/v2/wallets/${encodeURIComponent(
        walletId,
      )}?${query.toString()}`,

      {
        method:
          "GET",
      },
    );

  const wallet =
    parsePayMongoWalletResource(
      response,
    );

  if (
    wallet.walletId !==
      walletId
  ) {
    throw invalidResponse(
      "PayMongo wallet identity is inconsistent.",
    );
  }

  return wallet;
}

/*
 * Discovers FEASTA's canonical activated PHP Wallet.
 *
 * Selection is deliberately strict:
 *
 * - zero eligible wallets -> null
 * - one eligible wallet -> use it
 * - multiple wallets -> exactly one must be marked default
 * - anything ambiguous -> fail closed
 *
 * The selected Wallet is then retrieved again by ID before being
 * trusted for any later C3 transport verification.
 */
export async function discoverPayMongoSettlementSourceWallet(
  input: {
    secretKey: string;
  },
): Promise<
  PayMongoSettlementSourceWallet |
  null
> {
  const wallets =
    await listPayMongoWallets({
      secretKey:
        input.secretKey,

      status:
        "activated",
    });

  const eligible =
    wallets.filter(
      (wallet) =>
        wallet.status ===
          "activated" &&
        wallet.currency ===
          "PHP" &&
        wallet.accountProvider ===
          "paymongo",
    );

  if (eligible.length === 0) {
    return null;
  }

  let candidate:
    PayMongoSettlementSourceWallet;

  if (eligible.length === 1) {
    candidate =
      eligible[0];
  } else {
    const defaults =
      eligible.filter(
        (wallet) =>
          wallet.isDefault,
      );

    if (defaults.length !== 1) {
      throw new PayMongoWalletRequestError(
        "PayMongo settlement source wallet is ambiguous.",
        "ambiguous",
        null,
      );
    }

    candidate =
      defaults[0];
  }

  const verified =
    await retrievePayMongoWallet({
      secretKey:
        input.secretKey,

      walletId:
        candidate.walletId,
    });

  if (
    verified.merchantId !==
      candidate.merchantId ||
    verified.status !==
      "activated" ||
    verified.currency !==
      "PHP" ||
    verified.accountProvider !==
      "paymongo"
  ) {
    throw new PayMongoWalletRequestError(
      "PayMongo settlement source wallet changed during verification.",
      "ambiguous",
      null,
    );
  }

  return verified;
}

export function parsePayMongoWalletList(
  value: unknown,
): PayMongoSettlementSourceWallet[] {
  const root =
    asRecord(
      value,
      "PayMongo wallet list",
    );

  if (!Array.isArray(root.data)) {
    throw invalidResponse(
      "PayMongo wallet list response is invalid.",
    );
  }

  return root.data.map(
    (wallet) =>
      parsePayMongoWalletResource(
        wallet,
      ),
  );
}

export function parsePayMongoWalletResource(
  value: unknown,
): PayMongoSettlementSourceWallet {
  const root =
    asRecord(
      value,
      "PayMongo wallet response",
    );

  const data =
    root.data &&
    typeof root.data === "object" &&
    !Array.isArray(root.data)
      ? asRecord(
          root.data,
          "PayMongo wallet data",
        )
      : root;

  const walletId =
    requireWalletId(
      data.id,
    );

  const merchantId =
    requireMerchantId(
      data.merchant_id,
    );

  if (
    typeof data.livemode !==
      "boolean"
  ) {
    throw invalidResponse(
      "PayMongo wallet livemode is invalid.",
    );
  }

  const status =
    requireWalletStatus(
      data.status,
    );

  const balance =
    asRecord(
      data.balance,
      "PayMongo wallet balance",
    );

  const available =
    requireNonNegativeCentavos(
      balance.available,
      "PayMongo wallet available balance",
    );

  const pending =
    requireNonNegativeCentavos(
      balance.pending,
      "PayMongo wallet pending balance",
    );

  const account =
    asRecord(
      data.account,
      "PayMongo wallet account",
    );

  if (
    account.provider !==
      "paymongo"
  ) {
    throw invalidResponse(
      "PayMongo wallet account provider is invalid.",
    );
  }

  const accountNumber =
    requireBoundedString(
      account.account_number,
      "PayMongo wallet account number",
      3,
      200,
    );

  if (
    typeof account.currency !==
      "string" ||
    account.currency.toUpperCase() !==
      "PHP"
  ) {
    throw invalidResponse(
      "PayMongo wallet currency is invalid.",
    );
  }

  const isDefault =
    data.is_default ===
      undefined ||
    data.is_default ===
      null
      ? false
      : requireBoolean(
          data.is_default,
          "PayMongo wallet default flag",
        );

  /*
   * Deliberately return only the fields FEASTA needs for settlement
   * capability verification. Account name, ledger internals,
   * statements and unrelated Wallet payload fields are discarded.
   */
  return {
    walletId,

    merchantId,

    livemode:
      data.livemode,

    isDefault,

    status,

    availableBalanceInCentavos:
      available,

    pendingBalanceInCentavos:
      pending,

    accountProvider:
      "paymongo",

    accountNumber,

    currency:
      "PHP",
  };
}

async function payMongoWalletRequest(
  secretKey: string,

  path: string,

  init: RequestInit,
): Promise<unknown> {
  if (
    !secretKey.startsWith(
      "sk_",
    )
  ) {
    logSecurityEvent({
      action:
        "configuration_failure",

      outcome:
        "failed",

      targetId:
        "paymongo_wallet",

      reasonCode:
        "secret_key_missing_or_invalid",
    });

    throw new PayMongoWalletRequestError(
      "PayMongo secret key is not configured.",
      "gateway_rejected",
      null,
    );
  }

  if (
    !path.startsWith(
      "/v2/wallets",
    )
  ) {
    throw new PayMongoWalletRequestError(
      "PayMongo wallet path is invalid.",
      "gateway_rejected",
      null,
    );
  }

  /*
   * C3D is deliberately read-only.
   */
  if (
    init.method !== "GET"
  ) {
    throw new PayMongoWalletRequestError(
      "PayMongo wallet request method is not allowed.",
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

  let response:
    Response;

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
          },

          signal:
            AbortSignal.timeout(
              15_000,
            ),
        },
      );
  } catch {
    throw new PayMongoWalletRequestError(
      "PayMongo wallet request outcome is unknown.",
      "ambiguous",
      null,
    );
  }

  if (!response.ok) {
    /*
     * Never include or log the gateway response body.
     */
    throw new PayMongoWalletRequestError(
      "PayMongo wallet request failed with " +
        `status ${response.status}.`,

      response.status >= 400 &&
        response.status < 500 &&
        response.status !== 408 &&
        response.status !== 409 &&
        response.status !== 425 &&
        response.status !== 429
        ? "gateway_rejected"
        : "ambiguous",

      response.status,
    );
  }

  try {
    return await response.json();
  } catch {
    throw new PayMongoWalletRequestError(
      "PayMongo wallet response could not be decoded.",
      "ambiguous",
      null,
    );
  }
}

function requireWalletId(
  value: unknown,
): string {
  if (
    typeof value !== "string" ||
    !/^wallet_[A-Za-z0-9]+$/u
      .test(value)
  ) {
    throw invalidResponse(
      "PayMongo wallet ID is invalid.",
    );
  }

  return value;
}

function requireMerchantId(
  value: unknown,
): string {
  if (
    typeof value !== "string" ||
    !/^org_[A-Za-z0-9]+$/u
      .test(value)
  ) {
    throw invalidResponse(
      "PayMongo wallet merchant ID is invalid.",
    );
  }

  return value;
}

function requireWalletStatus(
  value: unknown,
): PayMongoWalletStatus {
  if (
    value !== "activated" &&
    value !== "deactivated" &&
    value !== "frozen"
  ) {
    throw invalidResponse(
      "PayMongo wallet status is invalid.",
    );
  }

  return value;
}

function requireNonNegativeCentavos(
  value: unknown,

  name: string,
): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0
  ) {
    throw invalidResponse(
      `${name} is invalid.`,
    );
  }

  return value;
}

function requireBoolean(
  value: unknown,

  name: string,
): boolean {
  if (
    typeof value !==
      "boolean"
  ) {
    throw invalidResponse(
      `${name} is invalid.`,
    );
  }

  return value;
}

function requireBoundedString(
  value: unknown,

  name: string,

  minLength: number,

  maxLength: number,
): string {
  if (
    typeof value !== "string" ||
    value.length < minLength ||
    value.length > maxLength
  ) {
    throw invalidResponse(
      `${name} is invalid.`,
    );
  }

  return value;
}

function asRecord(
  value: unknown,

  name: string,
): UnknownRecord {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw invalidResponse(
      `${name} is invalid.`,
    );
  }

  return value as
    UnknownRecord;
}

function invalidResponse(
  message: string,
): PayMongoWalletRequestError {
  return new PayMongoWalletRequestError(
    message,
    "ambiguous",
    null,
  );
}