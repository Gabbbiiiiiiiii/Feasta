export type CustomizationDraft = {
  event: {eventDate: string; eventTime: string; eventEndTime: string; guestCount: string;
    eventLocation: string; eventAddress: string; specialRequest: string};
  customization: {selectedFoods: string[]; selectedDecorations: string[]; selectedFurniture: string[]};
  addonIds: string[];
  ownAddons?: boolean;
  ownAddonsNote?: string;
  submission?: {fingerprint: string; clientRequestId: string};
};

const PREFIX = "feasta:customization:v1:";
const TTL = 30 * 24 * 60 * 60 * 1000;
const MAX_DRAFTS = 20;
export function customizationDraftKey(owner: string, providerId: string, packageId: string, context = "") {
  // A separate literal namespace segment cannot collide with an older encoded
  // UID, even when a custom Firebase UID contains ':' or is literally 'guest'.
  const identity = owner.startsWith("customer:")
    ? `customer:${encodeURIComponent(owner.slice("customer:".length))}`
    : encodeURIComponent(owner);
  return PREFIX + identity + ":" + [providerId, packageId, context].map(encodeURIComponent).join(":");
}

// Project explicit editable fields only. Prices, policy terms, acknowledgements and tokens never enter storage.
export function parseCustomizationDraft(value: unknown): CustomizationDraft | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const event = record.event as CustomizationDraft["event"] | undefined;
  const customization = record.customization as CustomizationDraft["customization"] | undefined;
  if (!event || !customization || typeof event !== "object" || typeof customization !== "object") return null;
  if (record.ownAddons !== undefined && typeof record.ownAddons !== "boolean") return null;
  if (record.ownAddonsNote !== undefined && (typeof record.ownAddonsNote !== "string" || record.ownAddonsNote.length > 1000)) return null;
  const limits = {eventDate: 10, eventTime: 5, eventEndTime: 5, guestCount: 8, eventLocation: 500, eventAddress: 500, specialRequest: 1000};
  for (const [key, limit] of Object.entries(limits)) {
    const field = event[key as keyof typeof event];
    if (typeof field !== "string" || field.length > limit) return null;
  }
  const list = (input: unknown, max: number): input is string[] => Array.isArray(input) && input.length <= max &&
    input.every((item) => typeof item === "string" && item.length <= 160);
  if (!list(record.addonIds, 20) || !list(customization.selectedFoods, 50) ||
    !list(customization.selectedDecorations, 50) || !list(customization.selectedFurniture, 50)) return null;
  return {
    event: Object.fromEntries(Object.keys(limits).map((key) => [key, event[key as keyof typeof event]])) as typeof event,
    customization: {selectedFoods: [...customization.selectedFoods], selectedDecorations: [...customization.selectedDecorations], selectedFurniture: [...customization.selectedFurniture]},
    addonIds: [...new Set(record.addonIds)],
    ownAddons: record.ownAddons === true,
    ownAddonsNote: typeof record.ownAddonsNote === "string" ? record.ownAddonsNote : "",
    ...(record.submission && typeof record.submission === "object" &&
      "fingerprint" in record.submission && typeof record.submission.fingerprint === "string" && /^[a-f0-9]{64}$/u.test(record.submission.fingerprint) &&
      "clientRequestId" in record.submission && typeof record.submission.clientRequestId === "string" && /^booking-[a-f0-9-]{36}$/u.test(record.submission.clientRequestId)
      ? {submission: {fingerprint: record.submission.fingerprint, clientRequestId: record.submission.clientRequestId}} : {}),
  };
}

export function readCustomizationDraft(storage: Storage, key: string): CustomizationDraft | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    if (raw.length > 50000) return null;
    const data = JSON.parse(raw);
    if (data.version !== 1 || !Number.isFinite(data.savedAt) || Date.now() - data.savedAt > TTL || data.savedAt > Date.now()) return null;
    return parseCustomizationDraft(data.value);
  } catch { return null; }
}

export function listCustomizationDrafts(storage: Storage, owner: string, providerId: string, packageId: string) {
  const prefix = customizationDraftKey(owner, providerId, packageId);
  const matches: {key: string; value: CustomizationDraft}[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (!key?.startsWith(prefix)) continue;
    const value = readCustomizationDraft(storage, key);
    if (value) matches.push({key, value});
  }
  return matches.slice(0, MAX_DRAFTS);
}

export function saveCustomizationDraft(storage: Storage, key: string, value: CustomizationDraft) {
  const parsed = parseCustomizationDraft(value);
  if (!parsed) throw new Error("Invalid customization draft");
  const records: {key: string; savedAt: number}[] = [];
  for (let i = 0; i < storage.length; i++) {
    const item = storage.key(i);
    if (!item?.startsWith(PREFIX) || item === key) continue;
    let savedAt = 0;
    try { savedAt = JSON.parse(storage.getItem(item) ?? "{}").savedAt ?? 0; } catch { /* Discard malformed records below. */ }
    records.push({key: item, savedAt});
  }
  records.sort((a, b) => b.savedAt - a.savedAt).forEach((item, index) => {
    if (index >= MAX_DRAFTS - 1 || Date.now() - item.savedAt > TTL) storage.removeItem(item.key);
  });
  storage.setItem(key, JSON.stringify({version: 1, savedAt: Date.now(), value: parsed}));
}
