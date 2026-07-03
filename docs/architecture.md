# Feasta Architecture

## Overview

Feasta is a Flutter application organized around a role-based mobile experience for customers, providers, and admins. The project uses a layered architecture with feature-based screens, repository-backed Firestore access, typed models, and reusable shared services/helpers.

## Current folder structure

```text
lib/
  app.dart
  main.dart
  firebase_options.dart

  core/
    constants/
    helpers/
    services/
    utils/

  mobile/
    admin/
    auth/
    chat/
    customer/
    notifications/
    onboarding/
    provider/
    splash/

  models/
  repositories/
  services/
  web/
  widgets/
```

## Shared modules

### Core
- Shared constants and status definitions in `lib/core/constants/`
- Authentication and navigation guards in `lib/core/helpers/`
- Device permissions, startup, and utility helpers in `lib/core/services/` and `lib/core/utils/`

### Models
- Typed Firestore models live in `lib/models/`
- Current domain objects include users, customers, providers, packages, addons, bookings, and promotions.

### Repositories
- `lib/repositories/auth_repository.dart` handles user and auth-related persistence.
- `lib/repositories/feasta_repository.dart` handles most booking and provider operations.
- `lib/repositories/promotion_repository.dart` handles promotion CRUD and real-time streams.

### Services
- `lib/services/cloudinary_service.dart` is the existing upload helper for general Cloudinary uploads.
- `lib/services/cloudinary_upload_helper.dart` is the dedicated promotion upload helper.
- `lib/services/maps_api_service.dart` handles location and place search via Cloud Functions.
- `lib/services/customer_address_storage_service.dart` stores customer address preferences locally.

## Firestore collections

The app currently uses the following Firestore collections:

- `users`
- `customers`
- `providers`
- `providerVerifications`
- `packages`
- `menuItems`
- `addonRequests`
- `addons`
- `bookings`
- `bookingTimelines`
- `payments`
- `chatRooms`
- `messages`
- `reviews`
- `favorites`
- `notifications`
- `recoveryOffers`
- `reports`
- `adminLogs`
- `bookingRecoveryOffers`
- `promotions` (new backend addition)

## Promotion backend

### Promotion model
- `lib/models/promotion_model.dart`
- Represents a promotion with title, description, image, link, timing, ordering, and live status.

### Promotion repository
- `lib/repositories/promotion_repository.dart`
- Provides create, get, list, update, delete, and stream-based access.

### Promotion service
- `lib/services/promotion_service.dart`
- Encapsulates validation, Cloudinary upload, and promotion CRUD orchestration.

### Firestore schema
- `lib/core/constants/promotion_firestore_schema.dart`
- Centralized field names for the `promotions` collection.

### Cloudinary helper
- `lib/services/cloudinary_upload_helper.dart`
- Uploads promotion images to Cloudinary into the `feasta_promotions` folder.

## Planned web/mobile separation

The app is currently structured as a single Flutter codebase with feature folders under `lib/mobile`. The long-term shape should separate responsibilities as follows:

### Mobile
- Keep customer, provider, and auth flows under `lib/mobile/`
- Continue using the existing repositories and services for runtime data access

### Web
- Future web-specific screens can live under `lib/web/`
- Shared business logic should remain in `lib/repositories/`, `lib/services/`, and `lib/models/`

### Shared application layer
- Keep all core domain rules and API integration in shared layers so web and mobile stay aligned.
- Avoid placing business logic directly inside widgets.

## Notes

- The current architecture is intentionally feature-first and repository-driven.
- The promotion backend was added without changing the customer home UI or introducing an admin UI.
- No direct UI was added; this change remains backend-only.
