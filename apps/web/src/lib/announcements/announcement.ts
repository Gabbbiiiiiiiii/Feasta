export type PublishedAnnouncement = {id: string; title: string; content: string; audience: string; publishedAt: Date};

/** Defense in depth; Firestore rules remain the authorization boundary. */
export function publishedAnnouncement(id: string, data: Record<string, unknown>, role: "customer" | "provider"): PublishedAnnouncement | null {
  if (data.status !== "published" || data.isDeleted !== false ||
    !["everyone", role === "customer" ? "customers" : "providers"].includes(String(data.audience)) ||
    typeof data.title !== "string" || !data.title.trim() || typeof data.content !== "string" || !data.content.trim()) return null;
  const timestamp = data.publishedAt as {toDate?: () => Date} | null;
  const date = timestamp && typeof timestamp.toDate === "function" ? timestamp.toDate() : null;
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) return null;
  return {id, title: data.title, content: data.content, audience: String(data.audience), publishedAt: date};
}
