export const PROVIDER_SETTLEMENT_TRANSPORT_MODES = [
  "disabled",
  "wallet_transfer",
  "workflow",
] as const;

export type ProviderSettlementTransportMode =
  typeof PROVIDER_SETTLEMENT_TRANSPORT_MODES[number];

type UnknownRecord =
  Readonly<Record<string, unknown>>;

export type ProviderSettlementCapability = {
  schemaVersion: 1;

  accountReady: boolean;

  relationshipKnown: boolean;
  relationshipEnabled: boolean;

  transportMode:
    ProviderSettlementTransportMode;

  transportReady: boolean;

  reason:
    | "ready"
    | "account_not_ready"
    | "relationship_unknown"
    | "relationship_disabled"
    | "transport_disabled"
    | "transport_unverified";
};

export function providerSettlementCapability(
  account: UnknownRecord | null,
): ProviderSettlementCapability {
  if (!account) {
    return blocked(
      "account_not_ready",
    );
  }

  const accountReady =
    account.schemaVersion === 1 &&
    account.setupStatus === "ready" &&
    account.payoutReady === true &&
    typeof account.paymongoAccountId ===
      "string" &&
    /^org_[A-Za-z0-9_-]{3,200}$/u
      .test(
        account.paymongoAccountId,
      ) &&
    account.activationStatus ===
      "activated";

  if (!accountReady) {
    return blocked(
      "account_not_ready",
    );
  }

  const relationshipKnown =
    account.relationshipStatus ===
      "enabled" ||
    account.relationshipStatus ===
      "disabled";

  if (!relationshipKnown) {
    return {
      schemaVersion: 1,

      accountReady: true,

      relationshipKnown:
        false,

      relationshipEnabled:
        false,

      transportMode:
        "disabled",

      transportReady:
        false,

      reason:
        "relationship_unknown",
    };
  }

  const relationshipEnabled =
    account.relationshipStatus ===
      "enabled";

  if (!relationshipEnabled) {
    return {
      schemaVersion: 1,

      accountReady: true,

      relationshipKnown:
        true,

      relationshipEnabled:
        false,

      transportMode:
        "disabled",

      transportReady:
        false,

      reason:
        "relationship_disabled",
    };
  }

  const transportMode =
    parseTransportMode(
      account.settlementTransportMode,
    );

  if (transportMode === "disabled") {
    return {
      schemaVersion: 1,

      accountReady: true,

      relationshipKnown:
        true,

      relationshipEnabled:
        true,

      transportMode,

      transportReady:
        false,

      reason:
        "transport_disabled",
    };
  }

  /*
   * Choosing a transport name is never enough to authorize
   * Provider money movement.
   *
   * A separate trusted server-side verification step must explicitly
   * confirm the configured transport before settlement reservation is
   * allowed.
   */
  if (
    account.settlementTransportReady !==
      true
  ) {
    return {
      schemaVersion: 1,

      accountReady: true,

      relationshipKnown:
        true,

      relationshipEnabled:
        true,

      transportMode,

      transportReady:
        false,

      reason:
        "transport_unverified",
    };
  }

  return {
    schemaVersion: 1,

    accountReady: true,

    relationshipKnown:
      true,

    relationshipEnabled:
      true,

    transportMode,

    transportReady:
      true,

    reason:
      "ready",
  };
}

export function assertProviderSettlementTransportReady(
  account: UnknownRecord | null,
): ProviderSettlementCapability {
  const capability =
    providerSettlementCapability(
      account,
    );

  if (!capability.transportReady) {
    throw new Error(
      `Provider settlement transport unavailable: ${capability.reason}`,
    );
  }

  return capability;
}

function parseTransportMode(
  value: unknown,
): ProviderSettlementTransportMode {
  if (
    value === "wallet_transfer" ||
    value === "workflow"
  ) {
    return value;
  }

  /*
   * Unknown, absent, or unconfigured transport always fails closed.
   */
  return "disabled";
}

function blocked(
  reason:
    "account_not_ready",
): ProviderSettlementCapability {
  return {
    schemaVersion: 1,

    accountReady:
      false,

    relationshipKnown:
      false,

    relationshipEnabled:
      false,

    transportMode:
      "disabled",

    transportReady:
      false,

    reason,
  };
}