import {
  ANNOUNCEMENT_AUDIENCES,
  ANNOUNCEMENT_STATUSES,
  type AnnouncementAudience,
  type AnnouncementStatus,
} from "@feasta/shared-types";

import type {AnnouncementDraftInput} from "./admin-announcement-types";

const TITLE_MIN_LENGTH = 5;
const TITLE_MAX_LENGTH = 120;
const CONTENT_MIN_LENGTH = 20;
const CONTENT_MAX_LENGTH = 5_000;
const ADMIN_NOTES_MAX_LENGTH = 1_000;
const ARCHIVE_REASON_MIN_LENGTH = 10;
const ARCHIVE_REASON_MAX_LENGTH = 500;
const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/u;

const FORBIDDEN_CLIENT_FIELDS = new Set([
  "actorId",
  "actorRole",
  "audit",
  "createdAt",
  "createdBy",
  "updatedAt",
  "updatedBy",
  "publishedAt",
  "publishedBy",
  "archivedAt",
  "archivedBy",
  "status",
  "recipientIds",
  "recipients",
  "href",
  "navigationUrl",
  "destinationUrl",
]);

export function validateAnnouncementDraftInput(
  input: unknown,
): AnnouncementDraftInput {
  const record = inputRecord(input);
  rejectForbiddenClientFields(record);

  const title = requiredText(record.title, "Title");
  const content = requiredText(record.content, "Content");
  const adminNotes = optionalText(record.adminNotes, "Administrative notes");

  if (title.length < TITLE_MIN_LENGTH || title.length > TITLE_MAX_LENGTH) {
    throw new Error(
      `Title must be between ${TITLE_MIN_LENGTH} and ${TITLE_MAX_LENGTH} characters.`,
    );
  }
  if (content.length < CONTENT_MIN_LENGTH || content.length > CONTENT_MAX_LENGTH) {
    throw new Error(
      `Content must be between ${CONTENT_MIN_LENGTH} and ${CONTENT_MAX_LENGTH} characters.`,
    );
  }
  if (adminNotes.length > ADMIN_NOTES_MAX_LENGTH) {
    throw new Error(
      `Administrative notes cannot exceed ${ADMIN_NOTES_MAX_LENGTH} characters.`,
    );
  }
  if (!isAnnouncementAudience(record.audience)) {
    throw new Error("Select a valid announcement audience.");
  }

  return {title, content, audience: record.audience, adminNotes};
}

export function validateAnnouncementId(value: unknown): string {
  if (typeof value !== "string" || !SAFE_ID.test(value.trim())) {
    throw new Error("A valid announcement ID is required.");
  }
  return value.trim();
}
export function validatePublishInput(input: unknown): {
  announcementId: string;
  confirmed: true;
} {
  const record = inputRecord(input);
  rejectForbiddenClientFields(record);
  const announcementId = validateAnnouncementId(record.announcementId);
  if (record.confirmed !== true) {
    throw new Error("Publication must be explicitly confirmed.");
  }
  return {announcementId, confirmed: true};
}

export function validateArchiveInput(input: unknown): {
  announcementId: string;
  reason: string;
} {
  const record = inputRecord(input);
  rejectForbiddenClientFields(record);
  const announcementId = validateAnnouncementId(record.announcementId);
  const reason = requiredText(record.reason, "Archive reason");
  if (
    reason.length < ARCHIVE_REASON_MIN_LENGTH ||
    reason.length > ARCHIVE_REASON_MAX_LENGTH
  ) {
    throw new Error(
      `Archive reason must be between ${ARCHIVE_REASON_MIN_LENGTH} and ${ARCHIVE_REASON_MAX_LENGTH} characters.`,
    );
  }
  return {announcementId, reason};
}

export function assertAnnouncementTransition(
  from: AnnouncementStatus,
  to: AnnouncementStatus,
): void {
  const allowed: Record<AnnouncementStatus, readonly AnnouncementStatus[]> = {
    draft: ["published", "archived"],
    scheduled: ["published", "archived"],
    published: ["archived"],
    expired: ["archived"],
    archived: [],
  };
  if (!allowed[from].includes(to)) {
    throw new Error(`Announcements cannot transition from ${from} to ${to}.`);
  }
}

export function assertAnnouncementEditable(status: AnnouncementStatus): void {
  if (status !== "draft") {
    throw new Error("Only draft announcements can be edited.");
  }
}

export function isAnnouncementStatus(value: unknown): value is AnnouncementStatus {
  return typeof value === "string" &&
    (ANNOUNCEMENT_STATUSES as readonly string[]).includes(value);
}

export function isAnnouncementAudience(
  value: unknown,
): value is AnnouncementAudience {
  return typeof value === "string" &&
    (ANNOUNCEMENT_AUDIENCES as readonly string[]).includes(value);
}

function inputRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new Error("Invalid announcement submission.");
  }
  return input as Record<string, unknown>;
}

function rejectForbiddenClientFields(record: Record<string, unknown>): void {
  for (const field of FORBIDDEN_CLIENT_FIELDS) {
    if (Object.hasOwn(record, field)) {
      throw new Error(`The ${field} field is managed by the server.`);
    }
  }
}

function requiredText(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }
  return value.trim();
}

function optionalText(value: unknown, label: string): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  return value.trim();
}
