# Announcement recipient feeds

Admin announcements retain their existing draft -> published -> archived lifecycle.
Publication makes a notice eligible for the live feed; it does not send SMS, email,
push notifications, or create personal notification records.

## Access

- Customer Web: bell menu -> Official announcements (on Notifications).
- Provider Web: bell menu -> Official announcements (on Notifications).
- Customer Mobile: Notifications -> Official announcements.
- Customers receive Everyone and Customers; providers receive Everyone and Providers.
- Administrators-only notices never appear in these feeds.
- Only published, nondeleted notices with valid publication timestamps appear.
- Private administrative notes are never rendered.
- New notices appear newest first. Archiving removes them from open live feeds.
- Announcements have no personal unread count and cannot mark booking/payment alerts read.

## Web bell visibility and sound

- Customer and provider headers subscribe to the announcement feed even while the
  bell menu is closed. A separate green indicator means published announcements
  are available; it is not a personal unread count.
- The bell menu previews up to three audience-matching announcements and links to
  the full feed. Archived notices disappear from previews and the indicator.
- Customer, provider, and admin menus offer Enable notification sound / Mute
  notification sound. Enabling plays a sample chime and applies to the current
  mounted session. Browser audio requires that user gesture.
- Existing notifications on initial load stay silent. New unread personal
  notifications ring after enabling; new announcement arrivals also ring for
  customers and providers. Updating or removing an existing notice stays silent.
- The admin bell loads its initial summary on the server and then listens live
  to that authenticated administrator's notifications, without polling.
- This is foreground Web audio, not background push or Mobile audio. Verify sound
  in each browser using a new notification after enabling it.

## Release prerequisite

The announcement composite index in firebase/firestore.indexes.json must be deployed
and ready before the new recipient query can run. Existing announcement read rules
already enforce audience and publication restrictions; this change does not alter rules.
No index/rules deployment or announcement publication is part of this local implementation.

## Manual verification after index readiness

1. Keep the three prepared notices as drafts and confirm none appears in recipient feeds.
2. Publish Everyone. Verify it appears for a signed-in customer and provider.
3. Publish Customers. Verify customer Web and Mobile show it; provider Web does not.
4. Publish Providers. Verify provider Web shows it; customer Web and Mobile do not.
5. Keep each feed open and archive one notice. Confirm it disappears without refresh.
6. Confirm administrative notes do not appear and personal unread counts remain unchanged.
7. Sign out and verify an open feed clears; sign in as a different account and verify its audience.
8. Confirm loading, empty, error/retry, and Show more behavior.

These live checks are still required; mocked component tests do not prove deployed
Firestore index readiness or production rule behavior.
