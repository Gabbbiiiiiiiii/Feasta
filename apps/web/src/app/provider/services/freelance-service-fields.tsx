import {cloneElement, isValidElement, useId, useRef, useState, type ReactNode, type HTMLAttributes} from "react";
import {parseFreelanceServiceDetails, type FreelanceServiceDetails} from "@feasta/shared-types/freelance-service-details";
import {phpFormatter} from "@/components/shared/price-display";
import {Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle} from "@/components/ui/dialog";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Textarea} from "@/components/ui/textarea";

type PackageRow = {id: string};
type RowKey = "inclusions" | "deliverables" | "addOns" | "travelZones" | "distanceSurcharge";

function validateRow(key: RowKey, row: PackageRow) {
  parseFreelanceServiceDetails({
    deliverables: [], collaboration: "", collaborationNotes: "", addOns: [], travelZones: [],
    [key]: key === "distanceSurcharge" ? row : [row],
  });
}

function RowSection<T extends PackageRow>({title, item, rows, children, create, onChange, fields, summarize, rowKey, dialogItem, customEntry, limit = 10}: {
  customEntry?: {label: (row: T) => string; duplicate: (label: string, id?: string) => boolean};
  dialogItem?: string;
  title: string;
  item: string;
  rows: readonly T[];
  children?: ReactNode | ((remove: (row: T, button: HTMLButtonElement) => void) => ReactNode);
  create: () => T;
  onChange: (rows: T[]) => void;
  fields: (row: T, change: (patch: Partial<T>) => void) => ReactNode;
  summarize: (row: T) => {name: string; detail: string};
  rowKey: RowKey;
  limit?: number;
}) {
  const [dialog, setDialog] = useState<{action: "Add" | "Edit" | "Remove"; row: T} | null>(null);
  const [error, setError] = useState("");
  const opener = useRef<HTMLButtonElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const customInput = useRef<HTMLInputElement>(null);
  const [customText, setCustomText] = useState("");
  const [customError, setCustomError] = useState("");
  const customId = useId();
  function addCustom() {
    if (!customEntry || !customText.trim()) return;
    const row = {...create(), label: customText.trim()};
    try { validateRow(rowKey, row); } catch {
      setCustomError("Enter an included item with 1 to 120 characters.");
      customInput.current?.focus();
      return;
    }
    if (customEntry.duplicate(customText)) {
      setCustomError("This item is already included in your service.");
      customInput.current?.focus();
      return;
    }
    if (rows.length >= limit) { setCustomError("You can include up to 10 items."); return; }
    onChange([...rows, row]);
    setCustomText("");
    setCustomError("");
    customInput.current?.focus();
  }

  function open(action: "Add" | "Edit" | "Remove", row: T, button: HTMLButtonElement) {
    opener.current = button;
    setError("");
    setDialog({action, row});
  }

  return <fieldset className="grid gap-3">
    <legend className="mb-2 font-semibold">{title}</legend>
    {/* The render callback only wires event handlers; open reads/writes refs when clicked. */}
    {/* eslint-disable-next-line react-hooks/refs */}
    {typeof children === "function" ? children((row, button) => open("Remove", row, button)) : children}
    {customEntry ? <div className="grid gap-2">
      <label htmlFor={customId} className="text-sm font-medium">Custom included item</label>
      <div className="flex items-start gap-2">
        <Input className="min-h-12 min-w-0 flex-1" ref={customInput} id={customId} value={customText} placeholder="e.g. Behind-the-scenes photos"
          aria-invalid={Boolean(customError)} aria-describedby={customError ? customId + "-error" : undefined}
          onChange={(event) => {setCustomText(event.target.value); setCustomError("");}}
          onKeyDown={(event) => {if (event.key === "Enter" && !event.nativeEvent.isComposing) {event.preventDefault(); event.stopPropagation(); addCustom();}}} />
        <Button type="button" size="compact" className="shrink-0" disabled={!customText.trim() || rows.length >= limit} onClick={addCustom}>Add</Button>
      </div>
      {customError ? <p id={customId + "-error"} role="alert" className="text-sm text-destructive">{customError}</p> : null}
      <p aria-live="polite" className="text-sm font-semibold">Included in your service ({rows.length})</p>
      {rows.length >= limit ? <p className="text-sm text-muted-foreground">You can include up to 10 items.</p> : null}
    </div> : null}
    {rows.length ? <ul className="grid gap-2">
      {rows.map((row) => {
        const summary = summarize(row);
        return <li key={row.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3">
          <div className="min-w-0">
            <p className="break-words font-medium">{summary.name}</p>
            <p className="break-words text-sm text-muted-foreground">{summary.detail}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" aria-label={"Edit " + summary.name}
              onClick={(event) => open("Edit", row, event.currentTarget)}>Edit</Button>
            <Button type="button" variant="ghost" aria-label={"Remove " + summary.name}
              onClick={(event) => open("Remove", row, event.currentTarget)}>Remove</Button>
          </div>
        </li>;
      })}
    </ul> : null}
    {!customEntry && rows.length < limit ? <Button ref={addButton} className="justify-self-start" type="button" variant="secondary"
      onClick={(event) => open("Add", create(), event.currentTarget)}>Add {item}</Button> : null}

    <Dialog open={dialog !== null} onOpenChange={(open) => { if (!open) setDialog(null); }}>
      <DialogContent
        onInteractOutside={(event) => event.preventDefault()}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onCloseAutoFocus={(event) => {
        event.preventDefault();
        if (opener.current?.isConnected) opener.current.focus();
        else if (customEntry) customInput.current?.focus();
        else addButton.current?.focus();
      }}>
        {dialog ? <>
          <DialogHeader>
            <DialogTitle>{dialog.action} {dialogItem ?? item}</DialogTitle>
            <DialogDescription>{dialog.action === "Remove"
              ? "Remove " + summarize(dialog.row).name + " from this draft?"
              : rowKey === "deliverables" ? "Tell customers what they'll receive and when." : "Save this entry, then continue editing your service."}</DialogDescription>
          </DialogHeader>
          <form className="grid gap-4" onSubmit={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (dialog.action === "Remove") {
              onChange(rows.filter((row) => row.id !== dialog.row.id));
            } else {
              try {
                validateRow(rowKey, dialog.row);
                if (customEntry?.duplicate(customEntry.label(dialog.row), dialog.row.id)) {
                  setError("This item is already included in your service.");
                  return;
                }
              } catch (error) {
                setError((error as Error).message);
                return;
              }
              onChange(dialog.action === "Add" ? [...rows, dialog.row] :
                rows.map((row) => row.id === dialog.row.id ? dialog.row : row));
            }
            setDialog(null);
          }}>
            {dialog.action !== "Remove" ? fields(dialog.row, (patch) => {
              setDialog({...dialog, row: {...dialog.row, ...patch}});
              setError("");
            }) : null}
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setDialog(null)}>Cancel</Button>
              <Button type="submit" variant={dialog.action === "Remove" ? "destructive" : "primary"}>
                {dialog.action === "Remove" ? "Remove" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </> : null}
      </DialogContent>
    </Dialog>
  </fieldset>;
}

function Field({label, children, error: fieldError}: {label: string; children: ReactNode; error?: string}) {
  const id = useId();
  const [nativeError, setError] = useState("");
  const error = fieldError ?? nativeError;
  return <div className="grid gap-1 text-sm font-medium">
    <label htmlFor={id}>{label}</label>
    {isValidElement<HTMLAttributes<HTMLElement>>(children) ? cloneElement(children, {
      id, "aria-invalid": Boolean(error) || undefined, "aria-describedby": error ? id + "-error" : undefined,
      onInvalid: (event) => {
        const input = event.target as HTMLInputElement;
        setError(input.validity.valueMissing
          ? label.includes("receive") ? "Choose how customers will receive this item."
            : label.includes("customer?") || label === "Item name" ? "Enter an item name."
            : "Enter when this item will be ready."
          : input.validationMessage);
      },
      onInput: () => setError(""),
    }) : children}
    {error ? <p id={id + "-error"} role="alert" className="text-sm text-destructive">{error}</p> : null}
  </div>;
}

function Money({amount, onChange}: {amount: number | null; onChange: (amount: number) => void}) {
  return <Field label="Amount in pesos">
    <Input type="number" min="0.01" max="100000000" step="0.01" required
      defaultValue={amount ? amount / 100 : ""}
      onChange={(event) => {
        const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(event.target.value);
        onChange(match ? Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0")) : 0);
      }} />
  </Field>;
}

const coverageError = "Enter coverage between 1 minute and 24 hours, in whole minutes.";
const coverageMaxLength = 24;

// Decimal arithmetic avoids rounding fractional minutes into valid durations.
// Canonical repeating decimals produced from saved minutes must also round-trip.
function coverageMinutes(text: string): number | undefined {
  if (text === "") return undefined;
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(text)) return NaN;
  const hours = Number(text);
  if (hours <= 0 || hours > 24) return NaN;
  const nearest = Math.round(hours * 60);
  if (text === String(nearest / 60)) return nearest;
  const [whole, fraction = ""] = text.split(".");
  const scale = BigInt(10) ** BigInt(fraction.length);
  const numerator = BigInt((whole || "0") + fraction) * BigInt(60);
  return numerator % scale === BigInt(0) ? Number(numerator / scale) : NaN;
}

const quickCoverage = [120, 240, 360, 480];
function acceptsCoverageDraft(text: string) {
  return text.length <= coverageMaxLength && /^\d{0,2}(?:\.\d*)?$/.test(text) &&
    (text === "" || text === "." || Number(text) <= 24);
}

function CoverageField({minutes, onChange}: {minutes?: number; onChange: (minutes: number | undefined) => void}) {
  const [draft, setDraft] = useState({text: minutes === undefined ? "" : String(minutes / 60), minutes, custom: false});
  const local = Object.is(minutes, draft.minutes);
  const text = local ? draft.text : minutes === undefined ? "" : String(minutes / 60);
  const custom = (local && draft.custom) || (minutes !== undefined && !quickCoverage.includes(minutes));
  const selection = custom ? "custom" : minutes === undefined ? "" : String(minutes);
  const parsed = coverageMinutes(text);
  const error = parsed !== undefined && (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 1440) ? coverageError : "";
  function edit(next: string) {
    if (!acceptsCoverageDraft(next)) return;
    const nextMinutes = coverageMinutes(next);
    setDraft({text: next, minutes: nextMinutes, custom: true});
    onChange(nextMinutes);
  }
  const valid = minutes !== undefined && Number.isSafeInteger(minutes) && minutes >= 1 && minutes <= 1440;
  return <div className="grid gap-3">
    <Field label="How many hours will you cover the event? (optional)">
      <select className="min-h-11 min-w-0 rounded-md border bg-background px-3" value={selection}
        onChange={(event) => {
          const choice = event.target.value;
          const next = choice === "" || choice === "custom" ? undefined : Number(choice);
          setDraft({text: next === undefined ? "" : String(next / 60), minutes: next, custom: choice === "custom"});
          onChange(next);
        }}>
        <option value="">No coverage duration</option>
        {quickCoverage.map((duration) => <option key={duration} value={duration}>{duration / 60} hours</option>)}
        <option value="custom">Custom duration</option>
      </select>
    </Field>
    {custom ? <Field label="Custom coverage (hours)" error={error}>
      <Input type="text" inputMode="decimal" maxLength={coverageMaxLength} placeholder="e.g., 2.5"
        value={text} ref={(input) => {input?.setCustomValidity(error);}}
        onPaste={(event) => {
          const input = event.currentTarget;
          const next = text.slice(0, input.selectionStart ?? text.length) + event.clipboardData.getData("text") + text.slice(input.selectionEnd ?? text.length);
          if (!acceptsCoverageDraft(next)) event.preventDefault();
        }}
        onChange={(event) => edit(event.target.value)} />
    </Field> : null}
    {custom ? <p className="text-sm text-muted-foreground">Enter up to 24 hours. Decimals must equal whole minutes, for example 1.5 hours for 90 minutes.</p> : null}
    <p className="text-sm text-muted-foreground" role="status">{valid
      ? `Selected coverage: ${Math.floor(minutes / 60)} hours${minutes % 60 ? ` ${minutes % 60} minutes` : ""}`
      : "No coverage duration selected."}</p>
  </div>;
}

export function FreelanceServiceFields({value, onChange, category}: {
  category?: string;
  value: FreelanceServiceDetails;
  onChange: (details: FreelanceServiceDetails) => void;
}) {
  // Suggestion browsing is local UI state, never a service category change.
  const [suggestionView, setSuggestionView] = useState({category, selected: category === "videographer" ? "videographer" : "photographer"});
  const suggestionCategory = suggestionView.category === category ? suggestionView.selected : category === "videographer" ? "videographer" : "photographer";
  const suggestionGroup = useId();
  const media = category === "photographer" || category === "videographer";
  const suggestions = media ? [
    ...(suggestionCategory === "photographer" ? ["Edited Photos", "Printed Photos", "Photo Album", "Original Photos"] : []),
    ...(suggestionCategory === "videographer" ? ["Highlight Video", "Full-Event Video", "Same-Day Edit", "Original Video Footage"] : []),
  ] : [];
  const normalize = (text: string) => text.trim().replace(/\s+/g, " ").toLowerCase().replace("original, unedited", "original").replace("same-day edit video", "same-day edit");
  const alreadyIncluded = (label: string) => (value.inclusions ?? []).some((row) => normalize(row.label) === normalize(label)) ||
    value.deliverables.some((row) => normalize(row.name) === normalize(label));
  return <section aria-label="Coverage & deliverables" className="grid gap-5 border-t border-border pt-5">
    <div>
      <h3 className="font-semibold">Event Coverage &amp; Team</h3>
      <p className="text-sm text-muted-foreground">Tell customers how long you’ll be there, what they’ll receive, and who they’ll work with.</p>
    </div>

    <CoverageField minutes={value.coverageMinutes} onChange={(coverageMinutes) => onChange({...value, coverageMinutes})} />

    <Field label="How many people will work? (optional)" error={value.crewSize !== undefined && (!Number.isSafeInteger(value.crewSize) || value.crewSize < 1 || value.crewSize > 100) ? "Enter a whole number from 1 to 100 people, or leave this blank." : undefined}>
      <Input type="number" min="1" max="100" value={value.crewSize ?? ""}
        onChange={(event) => onChange({...value, crewSize: event.target.value === "" ? undefined : Number(event.target.value)})} />
    </Field>
    <p className="-mt-3 text-sm text-muted-foreground">Include yourself and anyone else working at the event.</p>

    <Field label="Who will handle the event?">
      <select className="min-h-11 rounded-md border bg-background px-3" value={value.collaboration}
        onChange={(event) => onChange({...value, collaboration: event.target.value as FreelanceServiceDetails["collaboration"]})}>
        <option value="">Choose an option</option>
        <option value="direct">Directly with me</option>
        <option value="named_lead">With a specific lead</option>
        <option value="team">With my team</option>
      </select>
    </Field>
    <details className="grid gap-3" open={value.collaboration === "named_lead" ? true : undefined}>
      <summary className="cursor-pointer font-medium">Planning with the customer (optional)</summary>
      <div className="grid gap-3 pt-3">
    <Field label={value.collaboration === "named_lead" ? media ? "Main photographer/videographer or special arrangements" : "Main provider or special arrangements" : "How you’ll plan with the client (optional)"}>
      <Textarea rows={2} maxLength={400} required={value.collaboration === "named_lead"} value={value.collaborationNotes}
        placeholder="Example: We’ll confirm the event timeline together."
        onChange={(event) => onChange({...value, collaborationNotes: event.target.value})} />
    </Field>

    <fieldset className="grid gap-2 text-sm">
      <legend className="font-semibold">Planning help included in the price</legend>
      {([
        ["consultationIncluded", "Pre-event consultation call"],
        ["customShotListIncluded", "Help planning which moments to capture"],
      ] as const).map(([key, label]) => <label key={key} className="flex items-center gap-2">
        <input type="checkbox" checked={value.planning?.[key] ?? false}
          onChange={(event) => onChange({...value, planning: {
            consultationIncluded: value.planning?.consultationIncluded ?? false,
            customShotListIncluded: value.planning?.customShotListIncluded ?? false,
            [key]: event.target.checked,
          }})} />{label}
      </label>)}
    </fieldset>

    <Field label="What the client should send you before the event (optional)">
      <Textarea rows={2} maxLength={500} value={value.clientRequirements ?? ""}
        placeholder="Example: Share the event timeline, venue address, and must-have shots."
        onChange={(event) => onChange({...value, clientRequirements: event.target.value})} />
    </Field>

      </div>
    </details>

    <RowSection<NonNullable<FreelanceServiceDetails["inclusions"]>[number]> title="What's Included?" item="included item" rowKey="inclusions"
      rows={value.inclusions ?? []}
      customEntry={media ? {label: (row) => row.label, duplicate: (label, id) => (value.inclusions ?? []).some((row) => row.id !== id && normalize(row.label) === normalize(label)) || value.deliverables.some((row) => normalize(row.name) === normalize(label))} : undefined}
      create={() => ({id: crypto.randomUUID(), kind: "session", label: ""})}
      onChange={(inclusions) => onChange({...value, inclusions})}
      summarize={(row) => ({name: row.label, detail: row.kind === "session" ? "Session" :
        row.kind === "keepsake" ? "Keepsake" : "Other inclusion"})}
      fields={(row, change) => <>
          <Field label="What kind of item is included?"><select className="min-h-11 rounded-md border bg-background px-3" value={row.kind}
            onChange={(event) => change({kind: event.target.value as typeof row.kind})}>
            <option value="session">{media ? "Photo or video session" : "Session"}</option><option value="keepsake">Printed item or keepsake</option><option value="other">Other</option>
          </select></Field>
          <Field label="Included item"><Input required maxLength={120} value={row.label}
            placeholder={row.kind === "keepsake" ? "Hardcover photobook" : "Pre-debut session"}
            onChange={(event) => change({label: event.target.value})} /></Field>
      </>}>
      {(remove) => media ? <div className="grid gap-2">
        <p className="text-sm text-muted-foreground">Choose what comes with your service, or add your own.</p>
        <div role="radiogroup" aria-label="Inclusion suggestions" className="flex w-fit max-w-full flex-wrap gap-1 rounded-lg bg-muted p-1">
          {([["photographer", "Photography"], ["videographer", "Videography"]] as const).map(([key, label]) =>
            <label key={key} className="relative cursor-pointer">
              <input type="radio" name={suggestionGroup} value={key} checked={suggestionCategory === key}
                onChange={() => setSuggestionView({category, selected: key})} className="peer sr-only" />
              <span className="flex min-h-10 items-center rounded-md px-3 py-2 text-sm font-semibold text-muted-foreground peer-checked:bg-card peer-checked:text-primary peer-checked:shadow-sm peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2">{label}</span>
            </label>)}
        </div>
        <p className="text-sm text-muted-foreground">Your selected primary category stays the same. This does not list your service in both categories.</p>
        <p className="text-sm text-muted-foreground">Original files are the unedited photos or video footage.</p>
        <div className="flex flex-wrap gap-2">{suggestions.map((label) => <Button key={label} type="button" variant="secondary"
          className="h-auto min-h-9 min-w-0 max-w-full rounded-full px-3 py-1.5 text-sm font-medium aria-pressed:border-primary aria-pressed:bg-secondary aria-pressed:text-primary disabled:aria-pressed:bg-secondary disabled:aria-pressed:text-primary disabled:aria-pressed:opacity-100"
          aria-label={"Add " + label} aria-pressed={alreadyIncluded(label)}
          disabled={!(value.inclusions ?? []).some((row) => normalize(row.label) === normalize(label)) && (alreadyIncluded(label) || (value.inclusions?.length ?? 0) >= 10)}
          onClick={(event) => {
            const selected = value.inclusions?.find((row) => normalize(row.label) === normalize(label));
            if (selected) {remove(selected, event.currentTarget); return;}
            if (alreadyIncluded(label) || (value.inclusions?.length ?? 0) >= 10) return;
            onChange({...value, inclusions: [...(value.inclusions ?? []), {id: crypto.randomUUID(),
              kind: label === "Printed Photos" || label === "Photo Album" ? "keepsake" : "other", label}]});
          }}>{alreadyIncluded(label) ? <span aria-hidden="true">&#10003;</span> : null}{label}</Button>)}</div>
      </div> : null}
    </RowSection>

    <RowSection<FreelanceServiceDetails["deliverables"][number]> title={media ? "Photo & Video Delivery" : "Service Delivery"} item="delivery item" dialogItem={media ? "photos or videos to deliver" : undefined} rowKey="deliverables"
      rows={value.deliverables}
      create={() => ({id: crypto.randomUUID(), name: "", min: 0, max: 0, unit: "hours", method: "digital_files"})}
      onChange={(deliverables) => onChange({...value, deliverables})}
      summarize={(row) => ({name: row.name, detail: (row.min === row.max ? "Within " + row.max : row.min + " to " + row.max) + " " + row.unit + " after the event - " + (row.method === "in_person" ? "Physical delivery in person" : row.method === "gallery" ? "Private online gallery" : "Online delivery")})}
      fields={(row, change) => <DeliveryFields row={row} change={change} media={media} />}>
      <p className="text-sm text-muted-foreground">Providing both online and physical copies? Add a delivery item for each.</p>
    </RowSection>

    <details>
      <summary className="cursor-pointer font-semibold">Additional Services (Optional)</summary>
      <div className="grid gap-3 pt-3">
    <RowSection<FreelanceServiceDetails["addOns"][number]> title="Optional extras" item="extra" rowKey="addOns"
      rows={value.addOns}
      create={() => ({id: crypto.randomUUID(), name: "", priceCentavos: 0, unit: "booking"})}
      onChange={(addOns) => onChange({...value, addOns})}
      summarize={(row) => ({name: row.name, detail: phpFormatter.format(row.priceCentavos / 100) + " per " + row.unit})}
      fields={(row, change) => <>
          <Field label="Extra name"><Input required maxLength={100} placeholder="Example: Drone coverage, extra hours, or another photographer" value={row.name}
            onChange={(event) => change({name: event.target.value})} /></Field>
          <Money amount={row.priceCentavos} onChange={(priceCentavos) => change({priceCentavos})} />
          <Field label="Rate unit">
            <select className="min-h-11 rounded-md border bg-background px-3" value={row.unit} onChange={(event) => change({unit: event.target.value as typeof row["unit"]})}>
              <option value="booking">Per booking</option><option value="hour">Per hour</option>
            </select>
          </Field>
      </>}>
      <p className="text-sm text-muted-foreground">Advertised rates for a separate quote. These extras aren’t charged at checkout.</p>
    </RowSection>

      </div>
    </details>
    <details>
      <summary className="cursor-pointer font-semibold">Travel Terms (Optional)</summary>
      <div className="grid gap-3 pt-3">
    <RowSection title="Extra charge for distant venues (optional)" item="distance surcharge" rowKey="distanceSurcharge" limit={1}
      rows={value.distanceSurcharge ? [{id: "distance", ...value.distanceSurcharge}] : []}
      create={() => ({id: "distance", from: "", afterKm: 0, feeCentavos: 0})}
      onChange={([rule]) => onChange({...value, distanceSurcharge: rule
        ? {from: rule.from, afterKm: rule.afterKm, feeCentavos: rule.feeCentavos} : undefined})}
      summarize={(row) => ({name: phpFormatter.format(row.feeCentavos / 100) + " distance surcharge",
        detail: "For venues more than " + row.afterKm + " km from " + row.from})}
      fields={(row, change) => <>
        <Field label="Where do you measure distance from?"><Input required maxLength={120} value={row.from}
          placeholder="Example: Ormoc City Hall" onChange={(event) => change({from: event.target.value})} /></Field>
        <Field label="Charge for venues farther than (km)"><Input required type="number" min="1" max="1000"
          value={row.afterKm || ""} onChange={(event) => change({afterKm: Number(event.target.value)})} /></Field>
        <Money amount={row.feeCentavos} onChange={(feeCentavos) => change({feeCentavos})} />
      </>}>
      <p className="text-sm text-muted-foreground">Add a separate quote for distant venues within your service area.</p>
    </RowSection>

    <RowSection<FreelanceServiceDetails["travelZones"][number]> title="Fees for specific venues (optional)" item="venue fee" rowKey="travelZones"
      rows={value.travelZones}
      create={() => ({id: crypto.randomUUID(), name: "", mode: "fixed_fee", feeCentavos: null})}
      onChange={(travelZones) => onChange({...value, travelZones})}
      summarize={(row) => ({name: row.name, detail: row.mode === "fixed_fee" && row.feeCentavos !== null ? phpFormatter.format(row.feeCentavos / 100) : row.mode === "included" ? "Travel included" : "Quote required"})}
      fields={(row, change) => <>
          <Field label="Area or venue"><Input required maxLength={100} placeholder="Example: Lake Danao venues" value={row.name}
            onChange={(event) => change({name: event.target.value})} /></Field>
          <Field label="Travel fee">
            <select className="min-h-11 rounded-md border bg-background px-3" value={row.mode}
              onChange={(event) => change({mode: event.target.value as typeof row["mode"]})}>
              <option value="included">Included</option><option value="fixed_fee">Fixed fee</option><option value="quote_required">Quote required</option>
            </select>
          </Field>
          {row.mode === "fixed_fee" ? <Money amount={row.feeCentavos} onChange={(feeCentavos) => change({feeCentavos})} /> : null}
      </>}>
      <p className="text-sm text-muted-foreground">
        Your profile already defines where you work. Add a fee only if a venue within that area costs extra.
        Confirm any fee before the customer pays. These amounts are quoted separately.
      </p>
    </RowSection>

      </div>
    </details>

    <div>
      <h4 className="font-semibold">Booking payment</h4>
      <p className="text-sm text-muted-foreground">Feasta collects full payment for this event service. Payment methods appear at checkout.</p>
    </div>
  </section>;
}

type DeliveryRow = FreelanceServiceDetails["deliverables"][number];
function DeliveryFields({row, change, media}: {row: DeliveryRow; change: (patch: Partial<DeliveryRow>) => void; media: boolean}) {
  const [range, setRange] = useState(row.min !== row.max);
  const [savedRange, setWindow] = useState({min: row.min, max: row.max});
  const [deadline, setDeadline] = useState(row.max);
  const [confirmSingle, setConfirmSingle] = useState(false);
  const limit = {hours: 8760, days: 365, weeks: 52}[row.unit];
  return <>
    <Field label={media ? "What will you give the customer?" : "Item name"}><Input required maxLength={100} placeholder={media ? "e.g., 100 edited photos" : "e.g., Completed event materials"} value={row.name} onChange={(event) => change({name: event.target.value})} /></Field>
    <Field label="How will customers receive it?">
      <select required className="min-h-11 min-w-0 rounded-md border bg-background px-3" value={row.method} onChange={(event) => change({method: event.target.value as DeliveryRow["method"]})}>
        <option value="digital_files">Online link or digital files</option><option value="gallery">Private online gallery</option><option value="in_person">USB or physical item (in person)</option>
      </select>
    </Field>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={range} onChange={(event) => {
      if (event.target.checked) { setRange(true); change(savedRange); setConfirmSingle(false); }
      else if (row.min !== row.max) setConfirmSingle(true);
      else { setRange(false); change({min: deadline, max: deadline}); }
    }} />Give a delivery time range instead</label>
    {confirmSingle ? <div className="grid gap-2" role="group" aria-label="Choose a single deadline">
      <p className="text-sm">Replace this range with a single deadline? The latest delivery time will be used. Your range is kept while this editor stays open.</p>
      <Button type="button" variant="secondary" onClick={() => {setDeadline(row.max); change({min: row.max, max: row.max}); setRange(false); setConfirmSingle(false);}}>Use latest time as deadline</Button>
      {deadline > 0 ? <Button type="button" variant="secondary" onClick={() => {change({min: deadline, max: deadline}); setRange(false); setConfirmSingle(false);}}>Use previous deadline ({deadline} {row.unit})</Button> : null}
      <Button type="button" variant="ghost" onClick={() => setConfirmSingle(false)}>Keep range</Button>
    </div> : null}
    {range ? <>
      <Field label="Earliest delivery"><Input required type="number" min="1" max={limit} step="1" value={row.min || ""} onChange={(event) => {const min = Number(event.target.value); setWindow({...savedRange, min}); change({min});}} /></Field>
      <Field label="Latest delivery"><Input required type="number" min={row.min || 1} max={limit} step="1" value={row.max || ""} onChange={(event) => {const max = Number(event.target.value); setWindow({...savedRange, max}); change({max});}} /></Field>
    </> : <Field label="When will it be ready after the event?"><Input required type="number" min="1" max={limit} step="1" value={row.max || ""} onChange={(event) => {const next = Number(event.target.value); setDeadline(next); change({min: next, max: next});}} /></Field>}
    <Field label="Time unit"><select className="min-h-11 rounded-md border bg-background px-3" value={row.unit} onChange={(event) => change({unit: event.target.value as DeliveryRow["unit"]})}>
      <option value="hours">Hours</option><option value="days">Days</option><option value="weeks">Weeks</option>
    </select></Field>
  </>;
}
