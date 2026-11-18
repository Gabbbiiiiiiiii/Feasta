"use server";

import {revalidatePath} from "next/cache";
import {mutateWalkIn} from "@/lib/provider/bookings/walk-in-booking-service";

export async function saveWalkIn(
  _previous: {message?: string; error?: string},
  form: FormData,
): Promise<{message?: string; error?: string}> {
  const result = await mutateWalkIn(form);
  if (result.message) {
    revalidatePath("/provider/bookings/walk-in");
    revalidatePath("/provider/calendar");
  }
  return result;
}
