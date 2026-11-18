"use server";

import {revalidatePath} from "next/cache";
import {checkWalkInDay, mutateWalkIn} from "@/lib/provider/bookings/walk-in-booking-service";

export type WalkInActionState = {
  message?: string;
  error?: string;
  reference?: string;
  remaining?: number | null;
};

export async function saveWalkIn(
  _previous: WalkInActionState,
  form: FormData,
): Promise<WalkInActionState> {
  const result = await mutateWalkIn(form);
  if (result.message) {
    revalidatePath("/provider/bookings");
    revalidatePath("/provider/bookings/walk-in");
    revalidatePath("/provider/calendar");
  }
  return result;
}

export async function checkWalkInDayAction(date: string) {
  return checkWalkInDay(date);
}
