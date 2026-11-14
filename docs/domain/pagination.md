# Pagination and search policy

All normal list endpoints and screens use cursor pagination.

- Default page size: **20**.
- Maximum accepted page size: **50**; larger values are clamped or rejected.
- Use `startAfterDocument` in Flutter or explicit ordered cursor values on the
  server. Do not use offsets.
- Sort by a stable domain field and document ID as the final tie-breaker. The
  shared Flutter query builder adds the document-ID order automatically.
- Return the final document/cursor with each page. An empty page terminates the
  traversal.
- Do not read an entire collection for a normal list screen.

Provider search uses server-owned `searchTokens`, not in-memory filtering of an
already-loaded page. Registration creates normalized word/prefix tokens and the
query uses `array-contains`, visibility filters, and a maximum of 50 candidates.
The query-policy migration backfills tokens on existing providers. If FEASTA
later needs fuzzy, infix, relevance-ranked, or multi-language search, use a
dedicated search service; do not emulate it with full Firestore scans.

Next.js currently performs only direct session profile reads. Cloud Functions
currently use direct IDs or bounded, single-field uniqueness/ownership lookups.
New list queries in either layer must follow this policy and add their index in
the same change.
