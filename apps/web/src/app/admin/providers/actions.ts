"use server";

import { revalidatePath } from "next/cache";

import {
  approveProviderVerification,
  rejectProviderVerification,
} from "@/lib/admin/provider-verification/provider-verification-service";

export type VerificationActionResult =
  | {
      success: true;
    }
  | {
      success: false;
      error: string;
    };

function getActionError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Unable to update the verification application.";
}

export async function approveVerificationAction(
  verificationId: string,
  providerId: string,
): Promise<VerificationActionResult> {
  try {
    await approveProviderVerification({
      verificationId,
      providerId,
    });

    revalidatePath("/admin");
    revalidatePath("/admin/providers");

    return {
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      error: getActionError(error),
    };
  }
}

export async function rejectVerificationAction(
  verificationId: string,
  providerId: string,
  reason: string,
): Promise<VerificationActionResult> {
  try {
    await rejectProviderVerification({
      verificationId,
      providerId,
      reason,
    });

    revalidatePath("/admin");
    revalidatePath("/admin/providers");

    return {
      success: true,
    };
  } catch (error) {
    return {
      success: false,
      error: getActionError(error),
    };
  }
}