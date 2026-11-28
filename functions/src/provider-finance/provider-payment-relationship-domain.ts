import type {
  PayMongoLinkedAccountRelationship,
} from "./paymongo-linked-account-client.js";

type UnknownRecord =
  Readonly<Record<string, unknown>>;

export type ProviderPaymentRelationshipSnapshot = {
  relationshipId: string;

  status:
    | "enabled"
    | "disabled";

  childAccountId:
    string;

  linkingRequestId:
    string | null;
};

export function providerPaymentRelationshipSnapshot(
  input: {
    storedAccount:
      UnknownRecord;

    relationship:
      PayMongoLinkedAccountRelationship;
  },
): ProviderPaymentRelationshipSnapshot {
  const storedChildAccountId =
    input.storedAccount
      .paymongoAccountId;

  if (
    typeof storedChildAccountId !==
      "string" ||
    storedChildAccountId !==
      input.relationship
        .childAccountId
  ) {
    throw new Error(
      "PayMongo relationship child account does not match the Provider payout account.",
    );
  }

  const storedInvitationId =
    input.storedAccount
      .invitationId;

  if (
    input.relationship
      .linkingRequestId !== null &&
    storedInvitationId !==
      input.relationship
        .linkingRequestId
  ) {
    throw new Error(
      "PayMongo relationship invitation does not match the Provider payout account.",
    );
  }

  return {
    relationshipId:
      input.relationship
        .relationshipId,

    status:
      input.relationship.enabled
        ? "enabled"
        : "disabled",

    childAccountId:
      input.relationship
        .childAccountId,

    linkingRequestId:
      input.relationship
        .linkingRequestId,
  };
}