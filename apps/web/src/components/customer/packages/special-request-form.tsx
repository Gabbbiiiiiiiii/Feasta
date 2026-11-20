"use client";

import {useRef, useState, type FormEvent} from "react";
import {httpsCallable} from "firebase/functions";
import Link from "next/link";
import {ProviderDatePicker} from "@/components/customer/bookings/provider-date-picker";
import {Button} from "@/components/ui/button";
import {Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger} from "@/components/ui/dialog";
import {getCustomerProviderCalendarAvailability} from "@/lib/customer/bookings/customer-provider-availability-client";
import {auth, functions, initializeBrowserAppCheck} from "@/lib/firebase/client";

const money = new Intl.NumberFormat("en-PH", {style: "currency", currency: "PHP"});
const inputClass = "mt-1 block w-full rounded-lg border border-feasta-border-soft p-2";

export function SpecialRequestForm({packageId, providerId, price}: {
  packageId: string;
  providerId: string;
  price: number;
}) {
  const [calendarContainer, setCalendarContainer] = useState<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [quantity, setQuantity] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");
  const attempt = useRef<{payload: string; id: string} | null>(null);
  const pending = useRef(false);
  const count = Number(quantity);
  const validQuantity = /^\d+$/.test(quantity) && Number.isInteger(count) && count >= 1 && count <= 100;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || !validQuantity) return;
    if (!draft.eventDate) {
      setError("Choose an available event date from the calendar.");
      return;
    }
    const form = new FormData(event.currentTarget);
    const data = {
      packageId, quantity: count,
      eventDate: draft.eventDate, eventTime: form.get("eventTime"),
      address: form.get("address") ?? "", instructions: form.get("instructions") ?? "",
      deliveryInstructions: form.get("deliveryInstructions") ?? "",
    };
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await auth.authStateReady();
      if (!auth.currentUser) throw new Error("Sign in as a customer to submit this request.");
      const payload = JSON.stringify(data);
      if (attempt.current?.payload !== payload) {
        const calendar = await getCustomerProviderCalendarAvailability(providerId, data.eventDate.slice(0, 7));
        if (calendar.dates.some(day => day.date === data.eventDate)) {
          throw new Error("This date is no longer available. Choose another date.");
        }
      }
      if (attempt.current?.payload !== payload) attempt.current = {payload, id: crypto.randomUUID()};
      initializeBrowserAppCheck();
      const result = await httpsCallable<typeof data & {submissionId: string}, {id: string}>(
        functions, "submitSpecialRequest",
      )({...data, submissionId: attempt.current.id});
      setReference(result.data.id);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to submit the request.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <Dialog open={open} onOpenChange={value => {
        if (!pending.current) setOpen(value);
      }}>
        <DialogTrigger asChild>
          <Button variant="secondary" fullWidth>Special Request</Button>
        </DialogTrigger>
        <DialogContent ref={setCalendarContainer} className="flex size-[min(32rem,calc(100vw_-_2rem),90dvh)] flex-col overflow-visible"
          onEscapeKeyDown={event => {
            if (calendarContainer?.querySelector("[data-provider-calendar-popup]")) event.preventDefault();
          }}
          showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>Special Request</DialogTitle>
            <DialogDescription>
              {reference ? "Your request was sent to the provider." : "Send your package requirements to the provider for review."}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1">
            {reference ? <div role="status">
              <p className="font-semibold">Special request submitted</p>
              <p className="break-all text-sm">Reference {reference}</p>
              <DialogFooter className="mt-4">
                <Button asChild variant="secondary" size="compact">
                  <Link href={`/customer/special-requests/${encodeURIComponent(reference)}`}>View Special Request</Link>
                </Button>
                <DialogClose asChild><Button size="compact">Done</Button></DialogClose>
              </DialogFooter>
            </div> : <form className="space-y-3" onSubmit={submit} onChange={event => {
              const field = event.target;
              if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) {
                const {name, value} = field;
                if (name) setDraft(values => ({...values, [name]: value}));
              }
            }}>
              <fieldset className="space-y-3" disabled={busy}>
                <label className="block">Quantity
                  <input className={inputClass} inputMode="numeric" pattern="[0-9]+" required maxLength={3}
                    value={quantity} onChange={event => setQuantity(event.target.value)} />
                </label>
                <div>
                  <p className="mb-1">Event date</p>
                  <ProviderDatePicker providerId={providerId} value={draft.eventDate ?? ""}
                    planningOnly={false} revision={0} portalContainer={calendarContainer}
                    onChange={eventDate => {
                      setDraft(values => ({...values, eventDate}));
                      setError("");
                    }} />
                  <p className="mt-1 text-sm text-muted-foreground">
                    Choose an available date. The provider reviews your order before sending an offer.
                  </p>
                </div>
                <label className="block">Drop-Off Time
                  <input className={inputClass} required type="time" name="eventTime" defaultValue={draft.eventTime} />
                </label>
                <label className="block">Delivery address
                  <input className={inputClass} name="address" defaultValue={draft.address} required maxLength={500} />
                </label>
                <label className="block">Delivery instructions (optional)
                  <textarea className={inputClass} name="deliveryInstructions" defaultValue={draft.deliveryInstructions} maxLength={1000} />
                </label>
                <label className="block">Special instructions (optional)
                  <textarea className={inputClass} name="instructions" defaultValue={draft.instructions} maxLength={2000} />
                </label>
              </fieldset>
              <p>Published unit price {money.format(price)}</p>
              {validQuantity ? <p className="font-semibold">Estimated subtotal {money.format(price * count)}</p>
                : <p className="text-sm">Enter a whole quantity from 1 to 100.</p>}
              <p className="text-sm">Delivery is included. The provider will review your request. Submitting does not reserve the date or charge you.</p>
              {error && <p className="text-sm text-red-700" role="alert">{error} {!auth.currentUser && <Link href="/login">Sign in</Link>}</p>}
              <DialogFooter>
                <Button type="submit" disabled={!validQuantity} loading={busy} loadingLabel="Submitting">
                  Submit Special Request
                </Button>
              </DialogFooter>
            </form>}
        </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
