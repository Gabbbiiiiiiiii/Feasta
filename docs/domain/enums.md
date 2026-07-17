# FEASTA Domain Enums

This document defines the canonical enum values used by FEASTA across
Firestore, Flutter, Next.js, Cloud Functions, Firestore Security Rules,
background jobs, analytics, and administrative tools.

All enum values stored in Firestore must use lowercase snake_case strings.

Enum values must not be renamed, removed, or reused for a different meaning
without:

1. updating this document;
2. updating `packages/shared-types/src/enums.ts`;
3. updating the equivalent Dart enums and serializers;
4. updating Cloud Functions and Firestore Security Rules;
5. updating indexes, queries, tests, and analytics;
6. migrating existing Firestore records;
7. documenting the migration in the project changelog.

---

# General enum rules

- Firestore values use lowercase snake_case.
- TypeScript constants should use uppercase plural names.
- TypeScript union types should use PascalCase names.
- Dart enum members may use camelCase, but serialization must be explicit.
- Do not rely on Dart `.name` for Firestore storage.
- Unknown values must be handled defensively when reading old data.
- Deprecated enum values must remain readable until data migration is complete.
- UI labels must be derived separately and must not be used as stored values.
- Backend validation is authoritative for sensitive lifecycle transitions.

---

# User and account enums

## User role

Represents the authenticated user's primary platform role.

- `customer`
- `provider`
- `admin`

Guests are unauthenticated users and are not stored as a role.

## Account status

Represents whether an account may access FEASTA.

- `active`
- `blocked`
- `disabled`
- `pending_deletion`

### Meaning

- `active` — the account may use its authorized FEASTA features.
- `blocked` — an administrator blocked the account because of policy, safety, or abuse concerns.
- `disabled` — the account is inactive because of an administrative or system action.
- `pending_deletion` — the account is awaiting deletion, anonymization, or retention review.

## Authentication provider

Represents the sign-in method linked to an account.

- `password`
- `google`

## Verification channel

Represents the verification channel used for an account action.

- `email`
- `phone`

## User activity status

Represents the user's current activity state when needed for operational monitoring.

- `online`
- `offline`
- `away`

This is optional and should not be treated as an authorization field.

---

# Provider enums

## Provider service type

Represents the provider's supported service model.

- `catering`
- `addon`
- `both`

### Meaning

- `catering` — offers catering packages, menus, and catering-owned add-ons.
- `addon` — offers optional event-related services.
- `both` — offers catering and supported add-on services.

## Provider verification status

Represents the overall provider verification application.

- `draft`
- `submitted`
- `under_review`
- `resubmission_required`
- `approved`
- `rejected`
- `suspended`

### Allowed lifecycle

```text
draft
→ submitted
→ under_review
→ approved
```

Alternative outcomes:

```text
under_review → rejected
under_review → resubmission_required
resubmission_required → submitted
approved → suspended
```

`rejected` and `suspended` are terminal in this lifecycle. A rejected
application is not the same as a resubmission request: only
`resubmission_required` permits the provider to replace documents and submit
again. Approval activates the provider; rejection and resubmission keep the
provider inactive; suspension removes an approved provider from public
availability.

Only administrators or trusted backend processes may set:

- `under_review`
- `approved`
- `rejected`
- `resubmission_required`
- `suspended`

## Verification document status

Represents the review status of one submitted document.

- `pending`
- `verified`
- `rejected`
- `expired`

## Verification document type

Represents the type of document submitted by a provider.

- `business_permit`
- `dti_registration`
- `bir_registration`
- `valid_id`
- `sanitary_permit`
- `mayors_permit`
- `other`

The server-owned minimum policy requires `business_permit` and `valid_id`.
Clients cannot choose whether a document is required.

## Verification decision type

Represents the administrative decision recorded during provider verification.

- `start_review`
- `approve`
- `reject`
- `require_resubmission`
- `suspend`

## Provider visibility status

Represents whether a provider may appear in customer discovery.

- `visible`
- `hidden`
- `suspended`

Provider visibility must not override verification requirements.

## Provider availability status

Represents a provider's manually maintained availability.

- `available`
- `limited`
- `unavailable`
- `blocked`

Availability does not depend only on whether another booking exists. Capacity,
staff, resources, time, equipment, location, and existing commitments must also
be considered.

## Capacity check result

Represents the result of an availability and operational capacity check.

- `available`
- `limited_capacity`
- `capacity_reached`
- `schedule_conflict`
- `insufficient_staff`
- `insufficient_equipment`
- `outside_service_area`
- `manual_review_required`

## Provider response reason

Represents why a provider rejected or could not accept a request.

- `schedule_conflict`
- `capacity_reached`
- `insufficient_staff`
- `insufficient_equipment`
- `outside_service_area`
- `unsupported_event_requirement`
- `provider_unavailable`
- `other`

## Provider suspension reason

Represents why an approved provider was suspended.

- `expired_documents`
- `invalid_documents`
- `policy_violation`
- `fraud_risk`
- `customer_complaints`
- `payment_issue`
- `inactive_business`
- `other`

---

# Service and catalog enums

## Service category

FEASTA is catering-focused, with optional event-related services.

- `catering`
- `venue`
- `decoration_and_styling`
- `cake_and_dessert`
- `photography`
- `videography`
- `photo_booth`
- `lights_and_sounds`
- `host_or_emcee`
- `entertainment`
- `makeup_artist`
- `flowers_and_souvenirs`
- `rental_equipment`
- `transportation`
- `event_coordination`
- `other`

## Event type

Initial supported event types:

- `birthday`
- `wedding`
- `anniversary`
- `reunion`
- `corporate`
- `other`

Additional event types may be added through controlled configuration without
changing historical records.

## Package status

Represents whether a package can be used for new bookings.

- `draft`
- `active`
- `inactive`
- `archived`

## Menu item status

Represents whether a menu item can be selected.

- `active`
- `unavailable`
- `archived`

## Add-on status

Represents whether an add-on service can be selected.

- `active`
- `unavailable`
- `archived`

## Add-on pricing type

Represents how an add-on price is calculated.

- `fixed`
- `per_guest`
- `per_hour`
- `per_unit`
- `custom_quote`

## Down-payment type

Represents how the required down payment is calculated.

- `percentage`
- `fixed_amount`

## Currency

Version 1 uses:

- `php`

---

# Booking and event enums

## Main event status

Represents the overall event stored in `bookings/{bookingId}`.

One event may contain one catering provider request and multiple optional
add-on provider requests.

- `draft`
- `pending_provider_approval`
- `needs_provider_replacement`
- `waiting_for_down_payment`
- `confirmed`
- `in_progress`
- `completed`
- `cancelled`
- `expired`

### Meaning

- `draft` — the customer is still selecting event details and services.
- `pending_provider_approval` — one or more provider requests are awaiting review.
- `needs_provider_replacement` — a required provider rejected, cancelled, or failed to respond.
- `waiting_for_down_payment` — accepted provider requests require payment.
- `confirmed` — all required provider requests and required down payments are confirmed.
- `in_progress` — the event or one of its scheduled services is currently being delivered.
- `completed` — all required event services have been completed.
- `cancelled` — the overall event was cancelled.
- `expired` — a required action was not completed within the allowed period.

Refund information belongs to payment records and must not be stored as an
event status.

## Provider request status

Represents one request stored in
`bookingProviderRequests/{providerRequestId}`.

Every selected provider has a separate request, approval decision, payment
record, and lifecycle.

- `pending`
- `accepted`
- `rejected`
- `waiting_for_down_payment`
- `payment_processing`
- `confirmed`
- `in_progress`
- `completed`
- `cancelled`
- `expired`

### Meaning

- `pending` — the provider has not reviewed the request.
- `accepted` — the provider temporarily accepted the request based on capacity.
- `rejected` — the provider rejected the request.
- `waiting_for_down_payment` — the request was accepted and requires payment.
- `payment_processing` — the customer started the payment process.
- `confirmed` — PayMongo verified the required down payment.
- `in_progress` — the provider is currently delivering or preparing the service.
- `completed` — the provider completed the service.
- `cancelled` — the request was cancelled.
- `expired` — the provider response or customer payment deadline passed.

Payment success and failure remain authoritative in `PaymentStatus`.

## Provider request type

Represents the type of service request.

- `catering`
- `addon`

## Booking timeline type

Represents an immutable event-level timeline entry.

- `created`
- `submitted`
- `provider_request_created`
- `provider_request_accepted`
- `provider_request_rejected`
- `provider_replacement_required`
- `waiting_for_down_payment`
- `payment_processing`
- `confirmed`
- `in_progress`
- `completed`
- `cancelled`
- `expired`
- `disputed`
- `note_added`

## Provider-request timeline type

Represents an immutable provider-request timeline entry.

- `created`
- `submitted`
- `accepted`
- `rejected`
- `waiting_for_down_payment`
- `payment_processing`
- `confirmed`
- `in_progress`
- `completed`
- `cancelled`
- `expired`
- `recovery_started`
- `note_added`

## Booking cancellation actor

Represents who initiated cancellation.

- `customer`
- `provider`
- `admin`
- `system`

## Booking cancellation reason

Represents a normalized cancellation reason.

- `customer_changed_plans`
- `customer_payment_not_completed`
- `provider_unavailable`
- `provider_capacity_issue`
- `schedule_conflict`
- `invalid_booking_details`
- `policy_violation`
- `force_majeure`
- `mutual_agreement`
- `other`

## Booking dispute status

Represents the lifecycle of a booking dispute.

- `submitted`
- `under_review`
- `awaiting_customer`
- `awaiting_provider`
- `resolved`
- `dismissed`
- `escalated`
- `closed`

---

# Payment enums

## Payment status

Represents one PayMongo payment attempt or transaction.

- `pending`
- `checkout_created`
- `processing`
- `paid`
- `failed`
- `expired`
- `cancelled`
- `refund_pending`
- `partially_refunded`
- `refunded`

### Rules

- Only trusted backend code may set `paid`.
- A verified PayMongo webhook is authoritative for payment confirmation.
- Customer and provider clients must never directly set a payment as paid.
- Refund statuses do not change the main event status into `refunded`.

## Payment type

Represents the purpose of a payment record.

- `provider_down_payment`
- `provider_balance`
- `refund`
- `adjustment`

Every selected provider has a separate payment record.

A combined payment covering all selected providers is excluded from Version 1.

## Payment gateway

- `paymongo`

## Payment method

Represents the payment method reported by PayMongo.

- `gcash`
- `grab_pay`
- `maya`
- `card`
- `qr_ph`
- `other`

The enabled methods depend on the PayMongo account configuration.

## Payment failure reason

Represents a normalized failure category.

- `customer_cancelled`
- `payment_declined`
- `insufficient_funds`
- `checkout_expired`
- `gateway_unavailable`
- `verification_failed`
- `unknown`

The raw PayMongo failure code should also be stored separately.

## Refund status

Represents a refund request or operation.

- `not_requested`
- `requested`
- `under_review`
- `processing`
- `partially_refunded`
- `refunded`
- `rejected`
- `failed`

## Refund reason

Represents why a refund was requested.

- `booking_cancelled`
- `provider_cancelled`
- `service_not_delivered`
- `duplicate_payment`
- `incorrect_amount`
- `payment_error`
- `admin_adjustment`
- `other`

---

# Booking recovery enums

## Booking recovery offer status

Represents the lifecycle of a replacement-provider offer.

- `offered`
- `viewed`
- `accepted`
- `rejected`
- `expired`
- `withdrawn`

## Booking recovery reason

Represents why the customer needs a replacement provider.

- `provider_rejected`
- `provider_response_expired`
- `provider_cancelled`
- `provider_suspended`
- `provider_unavailable`

## Recovery selection result

Represents the outcome of selecting a replacement provider.

- `replacement_requested`
- `replacement_accepted`
- `replacement_rejected`
- `replacement_expired`
- `customer_abandoned_recovery`

---

# Chat enums

## Chat room status

- `active`
- `closed`
- `archived`

A booking-related chat room may be closed after cancellation, expiration,
or completion.

## Message type

- `text`
- `image`
- `file`
- `system`

## Message delivery status

- `sending`
- `sent`
- `failed`

Message reading state should use:

- `isRead`
- `readAt`

rather than a separate read-status enum.

## System message type

Represents automated chat messages.

- `booking_created`
- `provider_request_accepted`
- `provider_request_rejected`
- `payment_required`
- `payment_confirmed`
- `booking_confirmed`
- `booking_cancelled`
- `booking_completed`
- `chat_closed`

---

# Review and engagement enums

## Review moderation status

- `published`
- `hidden`
- `under_review`
- `removed`

A review may only be created for a completed provider request belonging to
the authenticated customer.

## Rating value

Ratings are constrained integer values:

- `1`
- `2`
- `3`
- `4`
- `5`

This is a constrained number, not a Firestore string enum.

## Favorite target type

Version 1 favorites are for providers.

- `provider`

## Recommendation source

Represents why a provider appears in recommendations.

- `high_rating`
- `popular`
- `featured`
- `matching_category`
- `matching_event_type`
- `nearby`
- `personalized`

---

# Notification enums

## Notification delivery status

Represents delivery processing.

- `pending`
- `sent`
- `failed`

Notification reading state should use:

- `isRead`
- `readAt`

## Notification type

### Account and verification

- `account_blocked`
- `account_reactivated`
- `provider_verification_submitted`
- `provider_verification_approved`
- `provider_verification_rejected`
- `provider_verification_resubmission_required`
- `provider_suspended`

### Provider requests

- `provider_request_created`
- `provider_request_accepted`
- `provider_request_rejected`
- `provider_request_cancelled`
- `provider_request_expired`
- `provider_request_updated`
- `provider_request_completed`

### Main event

- `event_needs_provider_replacement`
- `event_waiting_for_down_payment`
- `event_confirmed`
- `event_cancelled`
- `event_expired`
- `event_completed`

### Payments

- `payment_checkout_created`
- `payment_processing`
- `payment_paid`
- `payment_failed`
- `payment_expired`
- `payment_cancelled`
- `refund_pending`
- `payment_partially_refunded`
- `payment_refunded`

### Communication and engagement

- `new_message`
- `review_received`
- `review_response_received`
- `booking_recovery_offer_available`
- `booking_recovery_offer_accepted`
- `announcement_published`
- `system`

## Notification related entity type

Represents the entity opened when a notification is selected.

- `user`
- `provider`
- `provider_verification`
- `booking`
- `provider_request`
- `payment`
- `chat_room`
- `review`
- `booking_recovery_offer`
- `announcement`
- `complaint`
- `report`

---

# Complaint and report enums

## Complaint status

- `submitted`
- `under_review`
- `awaiting_customer`
- `awaiting_provider`
- `resolved`
- `dismissed`
- `escalated`
- `closed`

## Complaint priority

- `low`
- `normal`
- `high`
- `urgent`

## Complaint category

- `provider_service`
- `customer_behavior`
- `booking`
- `payment`
- `refund`
- `communication`
- `review`
- `other`

## Complaint activity type

Represents an immutable complaint activity record.

- `submitted`
- `assigned`
- `status_changed`
- `customer_response_added`
- `provider_response_added`
- `evidence_added`
- `resolution_added`
- `escalated`
- `closed`
- `note_added`

## Report type

Represents an administrative or user-submitted report.

- `user`
- `provider`
- `booking`
- `provider_request`
- `payment`
- `review`
- `message`
- `system`

## Report status

- `submitted`
- `under_review`
- `resolved`
- `dismissed`
- `escalated`
- `closed`

---

# Announcement enums

## Announcement status

- `draft`
- `scheduled`
- `published`
- `expired`
- `archived`

## Announcement audience

- `everyone`
- `customers`
- `providers`
- `admins`

## Announcement delivery channel

- `in_app`
- `push`
- `email`

Version 1 may use only the supported channels.

---

# Admin and audit enums

## Admin action type

Represents the action recorded in `adminLogs`.

- `user_blocked`
- `user_unblocked`
- `user_disabled`
- `provider_verification_reviewed`
- `provider_approved`
- `provider_rejected`
- `provider_suspended`
- `provider_reinstated`
- `booking_reviewed`
- `payment_reviewed`
- `complaint_assigned`
- `complaint_resolved`
- `review_hidden`
- `review_removed`
- `announcement_created`
- `announcement_updated`
- `announcement_published`
- `settings_updated`
- `report_resolved`
- `other`

## Admin entity type

Represents the affected entity in an admin log.

- `user`
- `customer`
- `provider`
- `provider_verification`
- `booking`
- `provider_request`
- `payment`
- `review`
- `complaint`
- `report`
- `announcement`
- `app_settings`

---

# Media enums

## Media type

- `image`
- `document`
- `video`
- `other`

## Upload purpose

- `profile_image`
- `provider_logo`
- `provider_cover`
- `provider_gallery`
- `package_image`
- `menu_item_image`
- `addon_image`
- `verification_document`
- `complaint_evidence`
- `review_attachment`
- `chat_attachment`
- `announcement_image`

---

# Location enums

## Address type

- `home`
- `event_venue`
- `provider_business`
- `service_area_reference`

## Location verification status

- `unverified`
- `geocoded`
- `manually_confirmed`
- `invalid`

---

# Scheduling enums

## Schedule entry type

- `available`
- `blocked`
- `booking`
- `maintenance`
- `personal_unavailability`

## Recurrence type

- `none`
- `daily`
- `weekly`
- `monthly`

## Time conflict result

- `no_conflict`
- `overlapping_booking`
- `blocked_schedule`
- `outside_operating_hours`
- `insufficient_buffer_time`

---

# Application settings enums

## Settings document type

Recommended documents in `appSettings`:

- `general`
- `booking`
- `payment`
- `cancellation`
- `notifications`
- `customer_web`
- `provider_dashboard`
- `admin_dashboard`

## Feature flag status

- `enabled`
- `disabled`
- `maintenance`

---

# Canonical naming summary

The following names are authoritative:

- Overall event lifecycle: `MainEventStatus`
- Individual provider lifecycle: `ProviderRequestStatus`
- Payment lifecycle: `PaymentStatus`
- Verification lifecycle: `ProviderVerificationStatus`
- Complaint lifecycle: `ComplaintStatus`
- Recovery lifecycle: `BookingRecoveryOfferStatus`

Do not use a generic `BookingStatus` type for both the overall event and
individual provider requests.

---

# Deprecated legacy values

The current Flutter implementation may still contain older values such as:

- `provider_accepted`
- `provider_rejected`
- `waiting_payment`
- `payment_successful`
- `payment_failed`
- `recoveryOffers`

These legacy values must remain readable until migration is complete, but new
Next.js modules and new Cloud Functions must use the canonical values defined
in this document.

A migration plan must document:

1. the old value;
2. the new value;
3. affected collections;
4. affected queries and indexes;
5. affected Firestore Security Rules;
6. affected notifications;
7. the migration and rollback strategy.

---

# Versioning

This document is the canonical source of truth for FEASTA enum values.

Any change requires updating:

- `docs/domain/enums.md`
- `packages/shared-types/src/enums.ts`
- `apps/customer_mobile/lib/core/enums/domain_enums.dart`
- `apps/customer_mobile/lib/core/enums/domain_enum_serializers.dart`
- Cloud Functions
- Firestore Security Rules
- Firestore indexes and queries
- automated tests
- migration documentation
