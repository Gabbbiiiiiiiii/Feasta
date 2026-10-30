import type {
  Metadata,
} from "next";

import {
  notFound,
} from "next/navigation";

import {
  getProviderEarningsStatement,
  normalizeProviderEarningsStatementMonth,
} from "@/lib/provider/payments/provider-earnings-statement-service";

import {
  ProviderEarningsStatementClient,
} from "./provider-earnings-statement-client";

export const metadata: Metadata = {
  title:
    "Provider Earnings Statement | FEASTA",
};

type ProviderEarningsStatementPageProps = {
  searchParams:
    Promise<
      Record<
        string,
        string | string[] | undefined
      >
    >;
};

export default async function ProviderEarningsStatementPage({
  searchParams,
}: ProviderEarningsStatementPageProps) {
  const values =
    await searchParams;

  const rawMonth =
    Array.isArray(
      values.month,
    )
      ? values.month[0]
      : values.month;

  const month =
    rawMonth
      ? normalizeProviderEarningsStatementMonth(
          rawMonth,
        )
      : null;

  if (
    rawMonth &&
    !month
  ) {
    notFound();
  }

  const statement =
    await getProviderEarningsStatement(
      month,
    );

  return (
    <ProviderEarningsStatementClient
      statement={statement}
    />
  );
}