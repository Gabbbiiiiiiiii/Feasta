"use client";

import {httpsCallable} from "firebase/functions";

import {
  functions,
  initializeBrowserAppCheck,
} from "@/lib/firebase/client";

import type {
  CustomerProviderTaxStatus,
} from "./customer-provider-vat-breakdown";

type CustomerProviderTaxPreview = {
  providerId: string;
  taxStatus: CustomerProviderTaxStatus;
  vatRateBps: number;
};

export async function getCustomerProviderTaxPreview(
  providerId: string,
): Promise<CustomerProviderTaxPreview> {
  if (!/^[A-Za-z0-9_-]{1,160}$/u.test(providerId)) {
    throw new Error("Invalid provider.");
  }

  initializeBrowserAppCheck();

  const callable = httpsCallable<
    {providerId: string},
    CustomerProviderTaxPreview
  >(
    functions,
    "getCustomerProviderTaxPreview",
  );

  const {data} = await callable({providerId});

  if (
    !data ||
    data.providerId !== providerId ||
    (
      data.taxStatus !== "vat_registered" &&
      data.taxStatus !== "non_vat" &&
      data.taxStatus !== "unknown"
    ) ||
    data.vatRateBps !== (
      data.taxStatus === "vat_registered" ? 1200 : 0
    )
  ) {
    throw new Error("Invalid provider tax preview.");
  }

  return data;
}
