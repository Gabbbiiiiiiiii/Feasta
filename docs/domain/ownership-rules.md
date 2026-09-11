# Firestore Ownership Rules

## Purpose

This document defines who owns, reads, creates, updates, and deletes FEASTA Firestore documents.

These rules are the basis for:

- Firestore security rules
- Cloud Functions authorization
- Admin workflows
- Audit logging
- Query design
- Index requirements

---

## Actors

### Customer

A customer may access data connected to their own account, main events, provider requests, payments, chats, reviews, favorites, notifications, and complaints.

### Provider owner

A provider owner is the authenticated user referenced by:

```text
providers/{providerId}.ownerId